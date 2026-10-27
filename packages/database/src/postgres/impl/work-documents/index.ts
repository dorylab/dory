import { and, desc, eq, ilike, isNotNull, isNull, sql } from 'drizzle-orm';
import type { PostgresDBClient } from '@dory/shared';
import type { AnalysisScope, WorkDocumentContent } from '@dory/shared/types/work-document';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { getClient } from '../../client';
import { workDocuments, workDocumentVersions } from '../../schemas/work-documents';

type Owner = { organizationId: string; userId: string };
type Target = Owner & { documentId: string };
type Record = typeof workDocuments.$inferSelect;
export class PostgresWorkDocumentsRepository {
    private db!: PostgresDBClient;
    async init(client?: PostgresDBClient) {
        this.db = client ?? (await getClient());
    }
    private owned(input: Target) {
        return and(eq(workDocuments.id, input.documentId), eq(workDocuments.organizationId, input.organizationId), eq(workDocuments.userId, input.userId));
    }
    async get(input: Target) {
        const [row] = await this.db.select().from(workDocuments).where(this.owned(input));
        if (!row) throw new DatabaseError('Report not found.', 404);
        return row;
    }
    async list(input: Owner & { query?: string; connectionId?: string; chatId?: string; archived?: boolean; archiveState?: 'active' | 'archived' | 'all' }) {
        const conditions = [eq(workDocuments.organizationId, input.organizationId), eq(workDocuments.userId, input.userId)];
        const archiveState = input.archiveState ?? (input.archived ? 'all' : 'active');
        if (archiveState === 'active') conditions.push(isNull(workDocuments.archivedAt));
        if (archiveState === 'archived') conditions.push(isNotNull(workDocuments.archivedAt));
        if (input.query) conditions.push(ilike(workDocuments.title, `%${input.query.replace(/[\\%_]/g, '\\$&')}%`));
        if (input.chatId) conditions.push(eq(workDocuments.chatId, input.chatId));
        if (input.connectionId) conditions.push(sql`${workDocuments.scope}->'connectionIds' @> ${JSON.stringify([input.connectionId])}::jsonb`);
        return this.db
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
        return row ?? null;
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
                return existing!;
            }
            await tx.insert(workDocumentVersions).values(this.version(created, 'agent'));
            return created;
        });
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
            const [row] = await tx
                .update(workDocuments)
                .set({ title: input.title, content: input.content, scope: input.scope, status: input.status, revision: sql`${workDocuments.revision} + 1`, updatedAt: new Date() })
                .where(and(this.owned(input), eq(workDocuments.revision, input.expectedRevision), isNull(workDocuments.archivedAt)))
                .returning();
            if (!row) throw new DatabaseError('Report changed or was archived. Reload the latest version before saving.', 409);
            await tx.insert(workDocumentVersions).values(this.version(row, input.source));
            return row;
        });
    }
    async versions(input: Target) {
        await this.get(input);
        return this.db
            .select({ revision: workDocumentVersions.revision, title: workDocumentVersions.title, createdAt: workDocumentVersions.createdAt, source: workDocumentVersions.source })
            .from(workDocumentVersions)
            .where(eq(workDocumentVersions.documentId, input.documentId))
            .orderBy(desc(workDocumentVersions.revision));
    }
    async getVersion(input: Target & { revision: number }) {
        const current = await this.get(input);
        const [version] = await this.db
            .select()
            .from(workDocumentVersions)
            .where(and(eq(workDocumentVersions.documentId, input.documentId), eq(workDocumentVersions.revision, input.revision)));
        if (!version) throw new DatabaseError('Version not found.', 404);
        return {
            ...current,
            title: version.title,
            content: version.content,
            scope: version.scope,
            status: version.status,
            revision: version.revision,
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
        return row;
    }
}
