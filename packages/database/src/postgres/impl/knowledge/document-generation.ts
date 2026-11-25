import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { PostgresDBClient } from '@dory/shared';
import type {
    DocumentDraft,
    DocumentGenerationInput,
    DocumentGenerationPhase,
    DocumentGenerationTask,
    DocumentGenerationTaskDetail,
} from '@dory/shared/types/knowledge-document-draft';
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';

import { knowledgeDocumentGenerationTasks as tasks, knowledgeFolders, knowledgeModels } from '../../schemas/knowledge';

export type DocumentTaskOwner = { organizationId: string; userId: string };
type TaskRow = typeof tasks.$inferSelect;
const owner = (input: DocumentTaskOwner) => and(eq(tasks.organizationId, input.organizationId), eq(tasks.createdBy, input.userId));
const leased = (id: string, token: string) => and(eq(tasks.id, id), eq(tasks.leaseToken, token), eq(tasks.status, 'running'), gt(tasks.leaseExpiresAt, sql`clock_timestamp()`));
const summaryColumns = {
    id: tasks.id,
    knowledgeModelId: tasks.knowledgeModelId,
    modelName: knowledgeModels.name,
    database: sql<string>`${tasks.input}->>'database'`,
    folderId: tasks.folderId,
    folderName: knowledgeFolders.name,
    status: tasks.status,
    phase: tasks.phase,
    completedTables: tasks.completedTables,
    totalTables: tasks.totalTables,
    error: tasks.error,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
    documents: tasks.documents,
};
function serialize(row: Omit<DocumentGenerationTask, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date }): DocumentGenerationTask {
    return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export class KnowledgeDocumentGenerationStore {
    constructor(private readonly db: PostgresDBClient) {}

    private summaries() {
        return this.db
            .select(summaryColumns)
            .from(tasks)
            .innerJoin(knowledgeModels, eq(tasks.knowledgeModelId, knowledgeModels.id))
            .leftJoin(knowledgeFolders, and(eq(tasks.folderId, knowledgeFolders.id), eq(tasks.knowledgeModelId, knowledgeFolders.knowledgeModelId)));
    }

    async list(input: DocumentTaskOwner): Promise<DocumentGenerationTask[]> {
        const [recent, active] = await Promise.all([
            this.summaries().where(owner(input)).orderBy(desc(tasks.createdAt)).limit(50),
            this.summaries()
                .where(and(owner(input), inArray(tasks.status, ['queued', 'running', 'ready'])))
                .orderBy(asc(tasks.createdAt)),
        ]);
        const activeIds = new Set(active.map(task => task.id));
        return [...active, ...recent.filter(task => !activeIds.has(task.id))].map(serialize);
    }

    async get(input: DocumentTaskOwner & { id: string }): Promise<DocumentGenerationTaskDetail> {
        const [row] = await this.db
            .select({ ...summaryColumns, input: tasks.input, draft: tasks.draft })
            .from(tasks)
            .innerJoin(knowledgeModels, eq(tasks.knowledgeModelId, knowledgeModels.id))
            .leftJoin(knowledgeFolders, and(eq(tasks.folderId, knowledgeFolders.id), eq(tasks.knowledgeModelId, knowledgeFolders.knowledgeModelId)))
            .where(and(owner(input), eq(tasks.id, input.id)));
        if (!row) throw new Error('Document generation task not found.');
        const { input: generationInput, draft, ...summary } = row;
        return { ...serialize(summary), input: generationInput, draft };
    }

    async enqueue(
        input: DocumentTaskOwner & { id: string; input: DocumentGenerationInput; folderId: string | null; executionContext: string | null; submissionId?: string; retry?: boolean },
    ) {
        await this.db.transaction(async tx => {
            const [model] = await tx
                .select({ id: knowledgeModels.id })
                .from(knowledgeModels)
                .where(and(eq(knowledgeModels.id, input.input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)));
            if (!model) throw new Error('Knowledge base not found.');
            if (input.folderId) {
                const [folder] = await tx
                    .select({ id: knowledgeFolders.id })
                    .from(knowledgeFolders)
                    .where(and(eq(knowledgeFolders.id, input.folderId), eq(knowledgeFolders.knowledgeModelId, model.id)));
                if (!folder) throw new Error('Choose a local folder in this knowledge base.');
            }
            if (input.retry) {
                const [current] = await tx
                    .select()
                    .from(tasks)
                    .where(and(owner(input), eq(tasks.id, input.id)))
                    .for('update');
                if (current && current.submissionId === (input.submissionId ?? input.id) && isDeepStrictEqual(current.input, input.input) && current.folderId === input.folderId)
                    return;

                const [updated] = await tx
                    .update(tasks)
                    .set({
                        input: input.input,
                        folderId: input.folderId,
                        executionContext: input.executionContext,
                        submissionId: input.submissionId ?? input.id,
                        status: 'queued',
                        phase: 'queued',
                        completedTables: 0,
                        totalTables: input.input.tables.length,
                        attempts: 0,
                        draft: null,
                        error: null,
                        leaseToken: null,
                        leaseExpiresAt: null,
                        updatedAt: new Date(),
                    })
                    .where(and(owner(input), eq(tasks.id, input.id), eq(tasks.knowledgeModelId, model.id), eq(tasks.status, 'failed')))
                    .returning({ id: tasks.id });
                if (!updated) throw new Error('Only failed tasks can be retried.');
            } else {
                await tx
                    .insert(tasks)
                    .values({
                        id: input.id,
                        submissionId: input.submissionId ?? input.id,
                        organizationId: input.organizationId,
                        createdBy: input.userId,
                        knowledgeModelId: model.id,
                        input: input.input,
                        folderId: input.folderId,
                        totalTables: input.input.tables.length,
                        executionContext: input.executionContext,
                    })
                    .onConflictDoNothing();
                const [existing] = await tx
                    .select()
                    .from(tasks)
                    .where(and(owner(input), eq(tasks.id, input.id)));
                if (!existing || !isDeepStrictEqual(existing.input, input.input) || existing.folderId !== input.folderId) throw new Error('Invalid document generation task.');
            }
        });
        return this.get(input);
    }

    async claim(): Promise<TaskRow | null> {
        return this.db.transaction(async tx => {
            await tx
                .update(tasks)
                .set({ status: 'failed', phase: 'failed', leaseToken: null, executionContext: null, error: 'INTERRUPTED', updatedAt: new Date() })
                .where(and(eq(tasks.status, 'running'), lte(tasks.leaseExpiresAt, sql`clock_timestamp()`), gte(tasks.attempts, 5)));
            await tx
                .update(tasks)
                .set({ status: 'queued', phase: 'queued', leaseToken: null, updatedAt: new Date() })
                .where(and(eq(tasks.status, 'running'), lte(tasks.leaseExpiresAt, sql`clock_timestamp()`), lt(tasks.attempts, 5)));
            const [next] = await tx.select().from(tasks).where(eq(tasks.status, 'queued')).orderBy(asc(tasks.createdAt)).limit(1).for('update', { skipLocked: true });
            if (!next) return null;
            const [claimed] = await tx
                .update(tasks)
                .set({
                    status: 'running',
                    phase: 'reading',
                    completedTables: 0,
                    error: null,
                    attempts: next.attempts + 1,
                    leaseToken: randomUUID(),
                    leaseExpiresAt: sql`clock_timestamp() + interval '120 seconds'`,
                    updatedAt: new Date(),
                })
                .where(eq(tasks.id, next.id))
                .returning();
            return claimed;
        });
    }

    async heartbeat(id: string, token: string, progress: { phase?: DocumentGenerationPhase; completedTables?: number } = {}) {
        const [row] = await this.db
            .update(tasks)
            .set({ ...progress, leaseExpiresAt: sql`clock_timestamp() + interval '120 seconds'`, updatedAt: new Date() })
            .where(leased(id, token))
            .returning({ id: tasks.id });
        if (!row) throw new Error('Document generation lease expired.');
    }

    async complete(id: string, token: string, draft: DocumentDraft) {
        const failed = draft.failedTables.length > 0;
        await this.db
            .update(tasks)
            .set({
                draft,
                status: failed ? 'failed' : 'ready',
                phase: failed ? 'failed' : 'ready',
                leaseToken: null,
                leaseExpiresAt: null,
                executionContext: null,
                updatedAt: new Date(),
                error: failed ? 'TABLES_UNAVAILABLE' : null,
            })
            .where(leased(id, token));
    }

    async fail(id: string, token: string, error: string) {
        await this.db
            .update(tasks)
            .set({ status: 'failed', phase: 'failed', error, leaseToken: null, leaseExpiresAt: null, executionContext: null, updatedAt: new Date() })
            .where(leased(id, token));
    }
}
