import { createHash } from 'node:crypto';
import type { PostgresDBClient } from '@dory/shared';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { AnalysisScope, WorkDocumentContent } from '@dory/shared/types/work-document';
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { getClient } from '../../client';
import { reportPublications, reportSnapshots, workDocuments, workDocumentVersions } from '../../schemas/work-documents';

type Owner = { organizationId: string; userId: string };
type Target = Owner & { documentId: string };
type Record = typeof workDocuments.$inferSelect;
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => [key, canonical(item)]),
        );
    return value;
}
export class PostgresWorkDocumentsRepository {
    private db!: PostgresDBClient;
    async init(client?: PostgresDBClient) {
        this.db = client ?? (await getClient());
    }
    private owned(input: Target) {
        return and(eq(workDocuments.id, input.documentId), eq(workDocuments.organizationId, input.organizationId), eq(workDocuments.userId, input.userId));
    }
    private async numberedHistory(documentIds: string[], db: Pick<PostgresDBClient, 'select'> = this.db) {
        if (!documentIds.length) return [];
        const snapshots = await db
            .select({
                documentId: workDocumentVersions.documentId,
                revision: workDocumentVersions.revision,
                title: workDocumentVersions.title,
                createdAt: workDocumentVersions.createdAt,
                source: workDocumentVersions.source,
                requestId: sql<string | null>`${workDocumentVersions.content}->'agentWrite'->>'requestId'`,
                emptyDraft: sql<boolean>`${workDocumentVersions.status} = 'draft' and coalesce(${workDocumentVersions.content}->>'markdown', '') = '' and coalesce(${workDocumentVersions.content}->'visuals', '[]'::jsonb) = '[]'::jsonb`,
            })
            .from(workDocumentVersions)
            .where(inArray(workDocumentVersions.documentId, documentIds))
            .orderBy(asc(workDocumentVersions.documentId), asc(workDocumentVersions.revision));
        let previous: (typeof snapshots)[number] | undefined;
        let version = 0;
        return snapshots.map(snapshot => {
            if (previous?.documentId !== snapshot.documentId) {
                previous = undefined;
                version = 0;
            }
            // The initial empty draft and incremental writes in one agent turn
            // are one public version. Revisions still identify immutable saves.
            const initialDraft = snapshot.revision === 1 && snapshot.emptyDraft;
            const sameTurn = snapshot.source === 'agent' && snapshot.requestId && previous?.source === 'agent' && previous.requestId === snapshot.requestId;
            if (!initialDraft && !sameTurn) version++;
            previous = snapshot;
            return { ...snapshot, version: Math.max(1, version) };
        });
    }
    private async withVersion<T extends { id: string; revision: number }>(row: T, db: Pick<PostgresDBClient, 'select'> = this.db) {
        const history = await this.numberedHistory([row.id], db);
        return { ...row, version: history.find(snapshot => snapshot.revision === row.revision)?.version ?? 1 };
    }
    private async getRow(input: Target) {
        const [row] = await this.db.select().from(workDocuments).where(this.owned(input));
        if (!row) throw new DatabaseError('Report not found.', 404);
        return row;
    }
    async get(input: Target) {
        return this.withVersion(await this.getRow(input));
    }
    async list(input: Owner & { query?: string; connectionId?: string; chatId?: string; archived?: boolean; archiveState?: 'active' | 'archived' | 'all' }) {
        const conditions = [eq(workDocuments.organizationId, input.organizationId), eq(workDocuments.userId, input.userId)];
        const archiveState = input.archiveState ?? (input.archived ? 'all' : 'active');
        if (archiveState === 'active') conditions.push(isNull(workDocuments.archivedAt));
        if (archiveState === 'archived') conditions.push(isNotNull(workDocuments.archivedAt));
        if (input.query) conditions.push(ilike(workDocuments.title, `%${input.query.replace(/[\\%_]/g, '\\$&')}%`));
        if (input.chatId) conditions.push(eq(workDocuments.chatId, input.chatId));
        if (input.connectionId) conditions.push(sql`${workDocuments.scope}->'connectionIds' @> ${JSON.stringify([input.connectionId])}::jsonb`);
        const rows = await this.db
            .select({
                id: workDocuments.id,
                sourceMessageId: sql<
                    string | null
                >`case when left(${workDocuments.creationKey}, length(${workDocuments.chatId}) + 1) = ${workDocuments.chatId} || ':' then substring(${workDocuments.creationKey} from length(${workDocuments.chatId}) + 2) else null end`,
                summary: sql<string>`left(${workDocuments.content}->>'markdown', 280)`,
                sourceLabels: sql<string[]>`coalesce((
                    select jsonb_agg(label order by label) from (
                        select distinct btrim(label) as label
                        from jsonb_array_elements(coalesce(${workDocuments.content}->'evidence', '[]'::jsonb)) as evidence
                        cross join lateral (
                            select evidence->>'connectionName' as label
                            union all
                            select file->>'filename'
                            from jsonb_array_elements(coalesce(evidence->'attachmentSource'->'files', '[]'::jsonb)) as file
                        ) labels
                        where nullif(btrim(label), '') is not null
                    ) sources
                ), '[]'::jsonb)`,
                title: workDocuments.title,
                chatId: workDocuments.chatId,
                scope: workDocuments.scope,
                revision: workDocuments.revision,
                status: workDocuments.status,
                archivedAt: workDocuments.archivedAt,
                createdAt: workDocuments.createdAt,
                updatedAt: workDocuments.updatedAt,
            })
            .from(workDocuments)
            .where(and(...conditions))
            .orderBy(desc(workDocuments.updatedAt))
            .limit(100);
        const history = await this.numberedHistory(rows.map(row => row.id));
        const versions = new Map(history.map(snapshot => [`${snapshot.documentId}:${snapshot.revision}`, snapshot.version]));
        return rows.map(row => ({ ...row, version: versions.get(`${row.id}:${row.revision}`) ?? 1 }));
    }
    async findByCreationKey(input: Owner & { creationKey: string }) {
        const [row] = await this.db
            .select()
            .from(workDocuments)
            .where(
                and(
                    eq(workDocuments.organizationId, input.organizationId),
                    eq(workDocuments.userId, input.userId),
                    eq(workDocuments.creationKey, input.creationKey),
                    isNull(workDocuments.archivedAt),
                ),
            );
        return row ? this.withVersion(row) : null;
    }
    async create(input: Owner & { creationKey: string; chatId?: string | null; title: string; scope: AnalysisScope; content: WorkDocumentContent }) {
        return this.db.transaction(async tx => {
            const [created] = await tx
                .insert(workDocuments)
                .values({ ...input, chatId: input.chatId ?? null })
                .onConflictDoNothing()
                .returning();
            if (!created) {
                const [existing] = await tx
                    .select()
                    .from(workDocuments)
                    .where(and(eq(workDocuments.organizationId, input.organizationId), eq(workDocuments.userId, input.userId), eq(workDocuments.creationKey, input.creationKey)));
                return this.withVersion(existing!, tx);
            }
            await tx.insert(workDocumentVersions).values(this.version(created, 'agent'));
            return this.withVersion(created, tx);
        });
    }
    private async snapshotContent(documentId: string, content: WorkDocumentContent, tx: Pick<PostgresDBClient, 'insert'>): Promise<WorkDocumentContent> {
        if (!content.format) return content;
        const evidence = await Promise.all(
            content.evidence.map(async item => {
                const { snapshotId: _previous, ...payload } = item;
                const snapshotId = `snap_${createHash('sha256')
                    .update(JSON.stringify(canonical([documentId, payload])))
                    .digest('hex')}`;
                const frozen = { ...payload, snapshotId };
                await tx.insert(reportSnapshots).values({ id: snapshotId, documentId, evidence: frozen }).onConflictDoNothing();
                return frozen;
            }),
        );
        const embeds =
            content.embeds &&
            Object.fromEntries(
                Object.entries(content.embeds).map(([key, embed]) => [
                    key,
                    {
                        ...embed,
                        snapshotId: evidence.find(item => item.artifactId === embed.artifactId)?.snapshotId ?? '',
                    },
                ]),
            );
        return { ...content, evidence, ...(embeds ? { embeds } : {}) };
    }
    async publications(input: Target) {
        await this.getRow(input);
        return this.db
            .select({ id: reportPublications.id, number: reportPublications.number, revision: reportPublications.revision, publishedAt: reportPublications.publishedAt })
            .from(reportPublications)
            .where(eq(reportPublications.documentId, input.documentId))
            .orderBy(desc(reportPublications.number));
    }
    async getPublication(input: Target & { publicationId: string }) {
        const current = await this.getRow(input);
        const [publication] = await this.db
            .select()
            .from(reportPublications)
            .where(and(eq(reportPublications.documentId, input.documentId), eq(reportPublications.id, input.publicationId)));
        if (!publication) throw new DatabaseError('Published report not found.', 404);
        return {
            ...current,
            title: publication.title,
            content: publication.content,
            scope: publication.scope,
            chatId: publication.chatId,
            revision: publication.revision,
            version: publication.number,
            updatedAt: publication.publishedAt,
            publication: { id: publication.id, number: publication.number, publishedAt: publication.publishedAt.toISOString() },
        };
    }
    async publish(input: Target & { expectedRevision: number; requestId: string }) {
        const publicationId = await this.db.transaction(async tx => {
            const [current] = await tx.select().from(workDocuments).where(this.owned(input)).for('update');
            if (!current || current.archivedAt) throw new DatabaseError('Report unavailable.', 404);
            const [retry] = await tx
                .select()
                .from(reportPublications)
                .where(and(eq(reportPublications.documentId, input.documentId), eq(reportPublications.requestId, input.requestId)));
            if (retry) {
                if (retry.revision !== input.expectedRevision) throw new DatabaseError('Publication request key was already used for another revision.', 409);
                return retry.id;
            }
            if (current.revision !== input.expectedRevision) throw new DatabaseError('Report changed. Read the latest draft before publishing.', 409);
            const [already] = await tx
                .select()
                .from(reportPublications)
                .where(and(eq(reportPublications.documentId, input.documentId), eq(reportPublications.revision, current.revision)));
            if (already) return already.id;
            if (!current.content.markdown.trim() || current.content.diagnostics?.length) throw new DatabaseError('Fix report diagnostics before publishing.', 400);
            if (current.content.format !== 'restricted-mdx') throw new DatabaseError('Save this report in the new format before publishing.', 400);
            for (const embed of Object.values(current.content.embeds ?? {})) {
                const [snapshot] = await tx
                    .select()
                    .from(reportSnapshots)
                    .where(and(eq(reportSnapshots.id, embed.snapshotId), eq(reportSnapshots.documentId, current.id)));
                if (!snapshot || snapshot.evidence.artifactId !== embed.artifactId) throw new DatabaseError('Missing report snapshot.', 409);
            }
            const [latest] = await tx
                .select({ number: reportPublications.number })
                .from(reportPublications)
                .where(eq(reportPublications.documentId, current.id))
                .orderBy(desc(reportPublications.number))
                .limit(1);
            const [published] = await tx
                .insert(reportPublications)
                .values({
                    documentId: current.id,
                    number: (latest?.number ?? 0) + 1,
                    revision: current.revision,
                    requestId: input.requestId,
                    title: current.title,
                    content: current.content,
                    scope: current.scope,
                    chatId: current.chatId,
                })
                .returning();
            await tx.update(workDocuments).set({ publishedVersionId: published.id }).where(this.owned(input));
            return published.id;
        });
        return this.getPublication({ ...input, publicationId });
    }
    private version(row: Record, source: 'user' | 'agent' | 'restore') {
        return { documentId: row.id, revision: row.revision, title: row.title, content: row.content, scope: row.scope, status: row.status, source };
    }
    async update(
        input: Target & {
            expectedRevision: number;
            title: string;
            content: WorkDocumentContent;
            scope: AnalysisScope;
            status: 'draft' | 'ready';
            source: 'user' | 'agent' | 'restore';
        },
    ) {
        return this.db.transaction(async tx => {
            const content = await this.snapshotContent(input.documentId, input.content, tx);
            const [row] = await tx
                .update(workDocuments)
                .set({ title: input.title, content, scope: input.scope, status: input.status, revision: sql`${workDocuments.revision} + 1`, updatedAt: new Date() })
                .where(and(this.owned(input), eq(workDocuments.revision, input.expectedRevision), isNull(workDocuments.archivedAt)))
                .returning();
            if (!row) throw new DatabaseError('Report changed or was archived. Reload the latest version before saving.', 409);
            await tx.insert(workDocumentVersions).values(this.version(row, input.source));
            return this.withVersion(row, tx);
        });
    }
    async versions(input: Target) {
        await this.getRow(input);
        const history = await this.numberedHistory([input.documentId]);
        return [...new Map(history.map(({ revision, version, title, createdAt, source }) => [version, { revision, version, title, createdAt, source }])).values()].reverse();
    }
    async getVersion(input: Target & { revision: number }) {
        const current = await this.getRow(input);
        const [version] = await this.db
            .select()
            .from(workDocumentVersions)
            .where(and(eq(workDocumentVersions.documentId, input.documentId), eq(workDocumentVersions.revision, input.revision)));
        if (!version) throw new DatabaseError('Version not found.', 404);
        const history = await this.numberedHistory([input.documentId]);
        return {
            ...current,
            title: version.title,
            content: version.content,
            scope: version.scope,
            status: version.status,
            revision: version.revision,
            version: history.find(snapshot => snapshot.revision === version.revision)!.version,
            updatedAt: version.createdAt,
        };
    }
    async restore(input: Target & { revision: number; expectedRevision: number }) {
        const version = await this.getVersion(input);
        return this.update({ ...input, title: version.title, content: version.content, scope: version.scope, status: version.status, source: 'restore' });
    }

    async rename(input: Target & { title: string; expectedRevision: number }) {
        const current = await this.get(input);
        return this.update({ ...input, content: current.content, scope: current.scope, status: current.status, source: 'user' });
    }
    async archive(input: Target & { archived: boolean }) {
        const [row] = await this.db
            .update(workDocuments)
            .set({ archivedAt: input.archived ? new Date() : null, updatedAt: new Date() })
            .where(this.owned(input))
            .returning();
        if (!row) throw new DatabaseError('Report not found.', 404);
        return this.withVersion(row);
    }
}
