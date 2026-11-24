import { reportUpdateResults } from '@dory/shared/types/report-updates';
import { createHash } from 'node:crypto';
import { getDoryArtifactStore, type DoryArtifactStore } from '@dory/artifacts';
import type { PostgresDBClient } from '@dory/shared';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { ReportWorkingDraft, ReportWorkingState } from '@dory/shared/types/report-workspace';
import type { AnalysisScope, WorkDocumentContent } from '@dory/shared/types/work-document';
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

import { getClient } from '../../client';
import { reportAgentDrafts, reportSnapshots, reportWorkingDrafts, workDocuments, workDocumentVersions } from '../../schemas/work-documents';
import { reportArtifactReference, retainReportEvidence, validateReportVersionEvidence } from './evidence-retention';

type Owner = { organizationId: string; userId: string };
type Target = Owner & { documentId: string };
type Record = typeof workDocuments.$inferSelect;
type Write = Pick<Record, 'title' | 'content' | 'scope' | 'status'>;
type Writer = Pick<PostgresDBClient, 'insert' | 'select' | 'update' | 'delete' | 'execute'>;
function sameReport(left: Write, right: Write) {
    const comparable = ({ title, content, scope }: Write) => {
        const { agentWrite: _agentWrite, workspaceOrigin: _workspaceOrigin, ...report } = content;
        return JSON.stringify(canonical([title, scope, report]));
    };
    return comparable(left) === comparable(right);
}
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
    constructor(private readonly artifactStore: DoryArtifactStore = getDoryArtifactStore()) {}
    async init(client?: PostgresDBClient) {
        this.db = client ?? (await getClient());
    }
    private owned(input: Target) {
        return and(eq(workDocuments.id, input.documentId), eq(workDocuments.organizationId, input.organizationId), eq(workDocuments.userId, input.userId));
    }
    private async numberedHistory(documentIds: string[], db: Pick<PostgresDBClient, 'select'> = this.db) {
        if (!documentIds.length) return [];
        return db
            .select({
                documentId: workDocumentVersions.documentId,
                revision: workDocumentVersions.revision,
                version: sql<number>`(row_number() over (partition by ${workDocumentVersions.documentId} order by ${workDocumentVersions.revision}))::integer`,
                title: workDocumentVersions.title,
                createdAt: workDocumentVersions.createdAt,
                source: workDocumentVersions.source,
                sourceChatId: workDocumentVersions.sourceChatId,
            })
            .from(workDocumentVersions)
            .where(inArray(workDocumentVersions.documentId, documentIds))
            .orderBy(desc(workDocumentVersions.revision));
    }
    private async withVersion<T extends { id: string; revision: number }>(row: T, db: Pick<PostgresDBClient, 'select'> = this.db) {
        const [saved] = await db
            .select({ version: count() })
            .from(workDocumentVersions)
            .where(and(eq(workDocumentVersions.documentId, row.id), lte(workDocumentVersions.revision, row.revision)));
        return { ...row, version: saved.version || 1 };
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
        const conditions = [
            sql`exists (select 1 from work_document_versions v where v.document_id = ${workDocuments.id})`,
            eq(workDocuments.organizationId, input.organizationId),
            eq(workDocuments.userId, input.userId),
        ];
        const archiveState = input.archiveState ?? (input.archived ? 'all' : 'active');
        if (archiveState === 'active') conditions.push(isNull(workDocuments.archivedAt));
        if (archiveState === 'archived') conditions.push(isNotNull(workDocuments.archivedAt));
        if (input.query) conditions.push(ilike(workDocuments.title, `%${input.query.replace(/[\\%_]/g, '\\$&')}%`));
        if (input.chatId)
            conditions.push(
                or(
                    eq(workDocuments.chatId, input.chatId),
                    sql`exists (
            select 1 from work_document_versions v where v.document_id = ${workDocuments.id} and v.source_chat_id = ${input.chatId}
        )`,
                )!,
            );
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
                version: sql<number>`(select count(*)::integer from work_document_versions v where v.document_id = ${workDocuments.id})`,
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
    async listReferencingArtifact(input: Owner & { artifactId: string }) {
        const reference = JSON.stringify([{ artifactId: input.artifactId }]);
        const rows = await this.db
            .select({
                id: workDocuments.id,
                title: workDocuments.title,
                revision: sql<number | null>`case
                    when ${workDocuments.content}->'evidence' @> ${reference}::jsonb then ${workDocuments.revision}
                    else (select max(v.revision) from ${workDocumentVersions} v
                        where v.document_id = ${workDocuments.id} and v.content->'evidence' @> ${reference}::jsonb)
                    end`,
            })
            .from(workDocuments)
            .where(
                and(
                    eq(workDocuments.organizationId, input.organizationId),
                    eq(workDocuments.userId, input.userId),
                    reportArtifactReference(input.organizationId, input.artifactId, workDocuments.id),
                ),
            )
            .orderBy(desc(workDocuments.updatedAt));
        // Pending SQL candidates are retained for recovery but are not report citations yet.
        return rows.flatMap(row => (row.revision === null ? [] : [{ id: row.id, title: row.title, revision: row.revision }]));
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
            const [retry] = await tx
                .select()
                .from(workDocuments)
                .where(and(eq(workDocuments.organizationId, input.organizationId), eq(workDocuments.userId, input.userId), eq(workDocuments.creationKey, input.creationKey)));
            if (retry) return this.withVersion(retry, tx);
            await retainReportEvidence(tx, input.organizationId, input.content.evidence);
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
            if (input.content.markdown.trim() || input.content.visuals.length) await tx.insert(workDocumentVersions).values(this.version(created, 'agent'));
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

    private draftOwned(input: Target & { baseRevision: number }) {
        return and(
            eq(reportWorkingDrafts.documentId, input.documentId),
            eq(reportWorkingDrafts.organizationId, input.organizationId),
            eq(reportWorkingDrafts.userId, input.userId),
            eq(reportWorkingDrafts.baseRevision, input.baseRevision),
        );
    }
    async workingDraft(input: Target & { baseRevision: number }) {
        await this.getRow(input);
        const [row] = await this.db.select().from(reportWorkingDrafts).where(this.draftOwned(input));
        return row ?? null;
    }
    async initializeWorkingDraft(input: Target & { baseRevision: number; state: ReportWorkingState; recoverUpdates?: boolean }) {
        return this.db.transaction(async tx => {
            const [current] = await tx.select().from(workDocuments).where(this.owned(input)).for('update');
            if (!current || current.archivedAt) throw new DatabaseError('Report unavailable.', 404);
            const [existing] = await tx
                .select()
                .from(reportWorkingDrafts)
                .where(
                    and(
                        eq(reportWorkingDrafts.documentId, input.documentId),
                        eq(reportWorkingDrafts.organizationId, input.organizationId),
                        eq(reportWorkingDrafts.userId, input.userId),
                        or(
                            eq(reportWorkingDrafts.baseRevision, input.baseRevision),
                            current.revision === input.baseRevision ? eq(reportWorkingDrafts.expectedReportRevision, input.baseRevision) : undefined,
                        ),
                    ),
                )
                .orderBy(desc(reportWorkingDrafts.updatedAt))
                .limit(1);
            let state = input.state;
            if (input.recoverUpdates && current.revision === input.baseRevision) {
                const stale = await tx
                    .select()
                    .from(reportWorkingDrafts)
                    .where(
                        and(
                            eq(reportWorkingDrafts.documentId, input.documentId),
                            eq(reportWorkingDrafts.userId, input.userId),
                            eq(reportWorkingDrafts.organizationId, input.organizationId),
                            sql`${reportWorkingDrafts.expectedReportRevision} < ${current.revision} and jsonb_array_length(coalesce(${reportWorkingDrafts.state}->'updates', '[]'::jsonb)) > 0`,
                        ),
                    )
                    .orderBy(desc(reportWorkingDrafts.updatedAt))
                    .for('update');
                if (stale.length) {
                    const updates = new Map((existing?.state.updates ?? []).map(item => [item.id, item]));
                    for (const previous of stale) {
                        for (const item of previous.state.updates ?? []) if (!updates.has(item.id)) updates.set(item.id, { ...item, selected: false, needsReview: true });
                        await tx
                            .update(reportWorkingDrafts)
                            .set({ state: { ...previous.state, updates: [] }, revision: previous.revision + 1 })
                            .where(eq(reportWorkingDrafts.id, previous.id));
                    }
                    state = { ...(existing?.state ?? input.state), updates: [...updates.values()] };
                    if (existing) {
                        const [recovered] = await tx
                            .update(reportWorkingDrafts)
                            .set({ state, revision: existing.revision + 1 })
                            .where(eq(reportWorkingDrafts.id, existing.id))
                            .returning();
                        return recovered;
                    }
                }
            }
            if (existing) return existing;
            const [base] = await tx
                .select()
                .from(workDocumentVersions)
                .where(and(eq(workDocumentVersions.documentId, input.documentId), eq(workDocumentVersions.revision, input.baseRevision)));
            if (!base) throw new DatabaseError('Version not found.', 404);
            await retainReportEvidence(tx, input.organizationId, [...input.state.content.evidence, ...(input.state.canvas?.undo?.content.evidence ?? [])], input.documentId);
            await tx
                .insert(reportWorkingDrafts)
                .values({
                    documentId: input.documentId,
                    organizationId: input.organizationId,
                    userId: input.userId,
                    baseRevision: input.baseRevision,
                    expectedReportRevision: current.revision,
                    state,
                })
                .onConflictDoNothing();
            const [draft] = await tx.select().from(reportWorkingDrafts).where(this.draftOwned(input));
            return draft;
        });
    }
    async saveWorkingDraft(input: Target & { revision?: number; baseRevision: number; expectedDraftRevision: number; state: ReportWorkingState }) {
        return this.db.transaction(async tx => {
            const [document] = await tx.select().from(workDocuments).where(this.owned(input)).for('update');
            if (!document || document.archivedAt) throw new DatabaseError('Report unavailable.', 404);
            if (input.revision !== undefined && input.revision !== document.revision) throw new DatabaseError('The report changed. Review the latest version.', 409);
            await retainReportEvidence(tx, input.organizationId, [...input.state.content.evidence, ...(input.state.canvas?.undo?.content.evidence ?? [])], input.documentId);
            if (input.revision !== undefined)
                await retainReportEvidence(
                    tx,
                    input.organizationId,
                    (input.state.updates ?? []).flatMap(item => reportUpdateResults(item).map(result => ({ artifactId: 'artifact_' + result.resultSetId }))),
                    input.documentId,
                );
            const [row] = await tx
                .update(reportWorkingDrafts)
                .set({ state: input.state, revision: sql`${reportWorkingDrafts.revision} + 1`, updatedAt: new Date() })
                .where(and(this.draftOwned(input), eq(reportWorkingDrafts.revision, input.expectedDraftRevision)))
                .returning();
            if (!row) throw new DatabaseError('This working draft changed in another window. Your local edits have been retained.', 409);
            return row;
        });
    }
    // Executions append trusted records independently of autosave; they never apply themselves.
    async recordWorkingResult(input: Target & { baseRevision: number; resultId: string; result: ReportWorkingDraft['results'][string] }) {
        await this.db.transaction(async tx => {
            const [document] = await tx.select().from(workDocuments).where(this.owned(input)).for('update');
            if (!document || document.archivedAt) throw new DatabaseError('Report unavailable.', 404);
            // Execution records are recoverable until ordinary result expiry; only adopted results are retained.
            const [row] = await tx
                .update(reportWorkingDrafts)
                .set({ results: sql`${reportWorkingDrafts.results} || ${JSON.stringify({ [input.resultId]: input.result })}::jsonb` })
                .where(this.draftOwned(input))
                .returning();
            if (!row) throw new DatabaseError('Working draft not found.', 404);
        });
    }
    async savedWorkingVersion(input: Target & { requestId: string; baseRevision: number; expectedDraftRevision: number }) {
        await this.getRow(input);
        const [row] = await this.db
            .select()
            .from(workDocumentVersions)
            .where(and(eq(workDocumentVersions.documentId, input.documentId), eq(workDocumentVersions.requestKey, `workspace:${input.requestId}`)));
        if (!row) return null;
        if (row.content.workspaceOrigin?.baseRevision !== input.baseRevision || row.content.workspaceOrigin?.draftRevision !== input.expectedDraftRevision)
            throw new DatabaseError('Save request already used for another draft.', 409);
        return this.getVersion({ ...input, revision: row.revision });
    }
    async saveWorkingVersion(
        input: Target & {
            baseRevision: number;
            expectedDraftRevision: number;
            requestId: string;
            content: WorkDocumentContent;
            selection?: { revision: number; remaining: NonNullable<ReportWorkingState['updates']>; title: string; state: ReportWorkingState };
        },
    ) {
        const revision = await this.db.transaction(async tx => {
            const [current] = await tx.select().from(workDocuments).where(this.owned(input)).for('update');
            if (!current || current.archivedAt) throw new DatabaseError('Report unavailable.', 404);
            // Idempotency is checked before the revision check, including after a lost response.
            const requestKey = `workspace:${input.requestId}`;
            const [retry] = await tx
                .select()
                .from(workDocumentVersions)
                .where(and(eq(workDocumentVersions.documentId, input.documentId), eq(workDocumentVersions.requestKey, requestKey)));
            if (retry) {
                if (retry.content.workspaceOrigin?.baseRevision !== input.baseRevision || retry.content.workspaceOrigin?.draftRevision !== input.expectedDraftRevision)
                    throw new DatabaseError('Save request already used for another draft.', 409);
                return retry.revision;
            }
            const [draft] = await tx.select().from(reportWorkingDrafts).where(this.draftOwned(input)).for('update');
            if (!draft || draft.revision !== input.expectedDraftRevision || current.revision !== draft.expectedReportRevision)
                throw new DatabaseError('The report or working draft changed. Your draft is preserved; open the latest version to resolve the conflict.', 409);
            if (input.selection && current.revision !== input.selection.revision) throw new DatabaseError('Report changed. Review the latest revision.', 409);
            if (!input.selection && draft.state.proseNeedsReview) throw new DatabaseError('Review the report text after applying new data.', 400);
            if (input.content.evidenceGroups?.some(group => group.needsReview)) throw new DatabaseError('Review the changed report evidence before saving a version.', 400);
            const [base] = await tx
                .select()
                .from(workDocumentVersions)
                .where(and(eq(workDocumentVersions.documentId, input.documentId), eq(workDocumentVersions.revision, input.baseRevision)));
            if (!base) throw new DatabaseError('Base version unavailable.', 404);
            const title = input.selection?.title ?? draft.state.title;
            if (sameReport(current, { ...current, title, content: input.content })) return current.revision;
            const row = await this.writeVersion(
                tx,
                current,
                {
                    content: { ...input.content, workspaceOrigin: { baseRevision: input.baseRevision, draftRevision: input.expectedDraftRevision } },
                    scope: input.selection
                        ? current.scope
                        : {
                              ...base.scope,
                              connectionIds: [...new Set(input.content.evidence.flatMap(e => (e.connectionId ? [e.connectionId] : [])))],
                              databasesByConnection: Object.fromEntries(
                                  [...new Set(input.content.evidence.flatMap(e => (e.connectionId ? [e.connectionId] : [])))].flatMap(connectionId => {
                                      const databases = [
                                          ...new Set(input.content.evidence.flatMap(e => (e.connectionId === connectionId && e.sourceDatabaseName ? [e.sourceDatabaseName] : []))),
                                      ];
                                      return databases.length ? [[connectionId, databases]] : [];
                                  }),
                              ),
                          },
                    title,
                    status: 'ready',
                },
                'workspace',
                requestKey,
            );
            const content = row.content;
            if (row.revision === current.revision) return row.revision;
            if (input.selection) {
                // Leave the previous version's independent report edits available to its author.
                await tx
                    .update(reportWorkingDrafts)
                    .set({ state: { ...draft.state, updates: [] }, revision: draft.revision + 1 })
                    .where(this.draftOwned(input));
                await tx.insert(reportWorkingDrafts).values({
                    organizationId: input.organizationId,
                    documentId: input.documentId,
                    userId: input.userId,
                    baseRevision: row.revision,
                    expectedReportRevision: row.revision,
                    state: {
                        ...input.selection.state,
                        content,
                        baseline: { revision: row.revision, version: row.version, title: row.title, content },
                        updates: input.selection.remaining,
                    },
                });
                return row.revision;
            }
            await tx
                .update(reportWorkingDrafts)
                .set({
                    expectedReportRevision: row.revision,
                    revision: draft.revision + 1,
                    state: {
                        ...draft.state,
                        content,
                        proseNeedsReview: false,
                        baseline: { revision: row.revision, version: row.version, title: row.title, content },
                        canvas: draft.state.canvas
                            ? { ...draft.state.canvas, baselineBlocks: draft.state.canvas.blocks, baselineRevision: row.revision, undo: undefined }
                            : undefined,
                    },
                })
                .where(this.draftOwned(input));
            return row.revision;
        });
        return this.getVersion({ ...input, revision });
    }

    private version(row: Record, source: typeof workDocumentVersions.$inferSelect.source) {
        return { documentId: row.id, revision: row.revision, title: row.title, content: row.content, scope: row.scope, status: row.status, source };
    }
    private async writeVersion(
        tx: Writer,
        current: Record,
        input: Write,
        source: typeof workDocumentVersions.$inferSelect.source,
        requestKey?: string,
        sourceChatId?: string | null,
    ) {
        if (input.content.diagnostics?.length || input.content.evidenceGroups?.some(group => group.needsReview))
            throw new DatabaseError('Fix the report syntax and review changed evidence before saving.', 400);
        if (source !== 'restore') await validateReportVersionEvidence(tx, this.artifactStore, current.organizationId, input.content.evidence, current.id);
        const content = source === 'restore' ? input.content : await this.snapshotContent(current.id, input.content, tx);
        if (source !== 'restore' && sameReport(current, { ...input, content })) return this.withVersion(current, tx);
        const revision = current.revision + 1;
        if (source === 'agent' && content.agentWrite) content.agentWrite = { ...content.agentWrite, revision };
        const [row] = await tx
            .update(workDocuments)
            .set({
                title: input.title,
                content,
                scope: input.scope,
                status: input.status,
                revision,
                updatedAt: new Date(),
            })
            .where(eq(workDocuments.id, current.id))
            .returning();
        await tx.insert(workDocumentVersions).values({ ...this.version(row, source), requestKey, sourceChatId });
        return this.withVersion(row, tx);
    }
    async savedRequest(input: Target & { requestKey: string }) {
        await this.getRow(input);
        const [saved] = await this.db
            .select({ revision: workDocumentVersions.revision })
            .from(workDocumentVersions)
            .where(and(eq(workDocumentVersions.documentId, input.documentId), eq(workDocumentVersions.requestKey, input.requestKey)));
        return saved ? this.getVersion({ ...input, revision: saved.revision }) : null;
    }
    async update(input: Target & Write & { expectedRevision: number; source: 'user' | 'agent' | 'restore'; requestKey?: string }) {
        return this.db.transaction(async tx => {
            const [current] = await tx.select().from(workDocuments).where(this.owned(input)).for('update');
            if (!current || current.archivedAt) throw new DatabaseError('Report unavailable.', 404);
            if (input.requestKey) {
                const [saved] = await tx
                    .select()
                    .from(workDocumentVersions)
                    .where(and(eq(workDocumentVersions.documentId, current.id), eq(workDocumentVersions.requestKey, input.requestKey)));
                if (saved)
                    return this.withVersion(
                        { ...current, title: saved.title, content: saved.content, scope: saved.scope, status: saved.status, revision: saved.revision, updatedAt: saved.createdAt },
                        tx,
                    );
            }
            if (current.revision !== input.expectedRevision) throw new DatabaseError('Report changed. Reload the latest version before saving.', 409);
            return this.writeVersion(tx, current, input, input.source, input.requestKey);
        });
    }
    async completedAgent(input: Target & { requestId: string }) {
        const saved = await this.savedRequest({ ...input, requestKey: 'agent:' + input.requestId });
        if (saved) return saved;
        const [receipt] = await this.db
            .select({ revision: reportAgentDrafts.completedRevision })
            .from(reportAgentDrafts)
            .where(and(eq(reportAgentDrafts.documentId, input.documentId), eq(reportAgentDrafts.requestId, input.requestId), isNotNull(reportAgentDrafts.completedRevision)));
        return receipt?.revision ? this.getVersion({ ...input, revision: receipt.revision }) : null;
    }
    async discardAgent(input: Target & { requestId: string }) {
        await this.getRow(input);
        await this.db
            .delete(reportAgentDrafts)
            .where(and(eq(reportAgentDrafts.documentId, input.documentId), eq(reportAgentDrafts.requestId, input.requestId), isNull(reportAgentDrafts.completedRevision)));
    }
    async agentView(input: Target & { requestId: string }) {
        const row = await this.get(input);
        const [draft] = await this.db
            .select()
            .from(reportAgentDrafts)
            .where(and(eq(reportAgentDrafts.documentId, row.id), eq(reportAgentDrafts.requestId, input.requestId)));
        return draft ? { ...row, title: draft.title, scope: draft.scope, content: draft.content, revision: draft.revision, status: draft.status } : row;
    }
    async stageAgent(input: Target & Write & { requestId: string; expectedRevision: number; sourceChatId?: string }) {
        return this.db.transaction(async tx => {
            const [current] = await tx.select().from(workDocuments).where(this.owned(input)).for('update');
            if (!current || current.archivedAt) throw new DatabaseError('Report unavailable.', 404);
            const [previous] = await tx
                .select()
                .from(reportAgentDrafts)
                .where(and(eq(reportAgentDrafts.documentId, current.id), eq(reportAgentDrafts.requestId, input.requestId)));
            const [committed] = await tx
                .select({ revision: workDocumentVersions.revision })
                .from(workDocumentVersions)
                .where(and(eq(workDocumentVersions.documentId, current.id), eq(workDocumentVersions.requestKey, 'agent:' + input.requestId)));
            if (previous?.completedRevision || committed) throw new DatabaseError('This turn has already saved its report.', 409);
            if ((previous?.revision ?? current.revision) !== input.expectedRevision || (previous && previous.baseRevision !== current.revision))
                throw new DatabaseError('Report changed. Read the latest report before editing.', 409);
            await retainReportEvidence(tx, input.organizationId, input.content.evidence, input.documentId);
            const state = { title: input.title, scope: input.scope, content: input.content, status: input.status, revision: input.expectedRevision + 1 };
            const [staged] = await tx
                .insert(reportAgentDrafts)
                .values({ ...state, documentId: current.id, requestId: input.requestId, sourceChatId: input.sourceChatId, baseRevision: current.revision })
                .onConflictDoUpdate({ target: [reportAgentDrafts.documentId, reportAgentDrafts.requestId], set: state })
                .returning();
            return { ...(await this.withVersion(current, tx)), ...state, content: staged.content };
        });
    }
    async finishAgent(input: Target & { requestId: string }) {
        return this.db.transaction(async tx => {
            const [current] = await tx.select().from(workDocuments).where(this.owned(input)).for('update');
            if (!current || current.archivedAt) throw new DatabaseError('Report unavailable.', 404);
            const predicate = and(eq(reportAgentDrafts.documentId, current.id), eq(reportAgentDrafts.requestId, input.requestId));
            const [draft] = await tx.select().from(reportAgentDrafts).where(predicate);
            if (!draft || draft.completedRevision) {
                const [saved] = await tx
                    .select()
                    .from(workDocumentVersions)
                    .where(
                        and(
                            eq(workDocumentVersions.documentId, current.id),
                            draft?.completedRevision ? eq(workDocumentVersions.revision, draft.completedRevision) : eq(workDocumentVersions.requestKey, 'agent:' + input.requestId),
                        ),
                    );
                if (saved)
                    return this.withVersion({ ...current, title: saved.title, scope: saved.scope, content: saved.content, status: saved.status, revision: saved.revision }, tx);
                throw new DatabaseError('No completed report update in this turn.', 409);
            }
            if (draft.status !== 'ready' || draft.baseRevision !== current.revision) throw new DatabaseError('Report changed or the update is incomplete.', 409);
            const row = await this.writeVersion(tx, current, draft, 'agent', 'agent:' + input.requestId, draft.sourceChatId);
            if (row.revision === current.revision) await tx.update(reportAgentDrafts).set({ completedRevision: row.revision, content: current.content }).where(predicate);
            else await tx.delete(reportAgentDrafts).where(predicate);
            return row;
        });
    }
    async versions(input: Target) {
        await this.getRow(input);
        const history = await this.numberedHistory([input.documentId]);
        return history;
    }
    async getVersion(input: Target & { revision: number }) {
        const current = await this.getRow(input);
        const [version] = await this.db
            .select()
            .from(workDocumentVersions)
            .where(and(eq(workDocumentVersions.documentId, input.documentId), eq(workDocumentVersions.revision, input.revision)));
        if (!version) throw new DatabaseError('REPORT_VERSION_REMOVED', 410);
        return this.withVersion({
            ...current,
            title: version.title,
            content: version.content,
            scope: version.scope,
            status: version.status,
            revision: version.revision,
            updatedAt: version.createdAt,
        });
    }
    async restore(input: Target & { revision: number; expectedRevision: number }) {
        const version = await this.getVersion(input);
        if (input.revision === input.expectedRevision) {
            const current = await this.get(input);
            if (current.revision !== input.expectedRevision || current.archivedAt) throw new DatabaseError('Report changed or was archived.', 409);
            return current;
        }
        return this.update({
            ...input,
            title: version.title,
            content: version.content,
            scope: version.scope,
            status: version.status,
            requestKey: `restore:${input.expectedRevision}:${input.revision}`,
            source: 'restore',
        });
    }

    async rename(input: Target & { title: string; expectedRevision: number }) {
        return this.db.transaction(async tx => {
            const [current] = await tx.select().from(workDocuments).where(this.owned(input)).for('update');
            if (!current || current.archivedAt || current.revision !== input.expectedRevision) throw new DatabaseError('Report changed or was archived.', 409);
            if (input.title === current.title) return this.withVersion(current, tx);
            const [row] = await tx
                .update(workDocuments)
                .set({ title: input.title, revision: current.revision + 1, updatedAt: new Date() })
                .where(eq(workDocuments.id, current.id))
                .returning();
            await tx.insert(workDocumentVersions).values(this.version(row, 'user'));
            return this.withVersion(row, tx);
        });
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
