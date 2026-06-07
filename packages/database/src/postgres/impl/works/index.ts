import { and, asc, desc, eq } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import {
    workInvestigations,
    workRunEvents,
    workRuns,
    works,
    type Work,
    type WorkCreator,
    type WorkInvestigation,
    type WorkRun,
    type WorkRunEvent,
    type WorkRunEventRole,
    type WorkRunEventType,
    type WorkStatus,
} from '@dory/database/postgres/schemas';
import { translateDatabase } from '@dory/database/i18n';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';
import type { PostgresDBClient } from '@dory/shared';

export type WorkCreateInput = {
    id?: string;
    organizationId: string;
    title?: string | null;
    goal: string;
    conclusion?: string | null;
    connectionId: string;
    createdBy: WorkCreator;
    createdByUserId: string;
};

export type WorkUpdateInput = {
    title?: string | null;
    goal?: string;
    conclusion?: string | null;
    status?: WorkStatus;
};

export type WorkInvestigationCreateInput = {
    id?: string;
    workId: string;
    organizationId: string;
    connectionId: string;
    title: string;
    summary?: string | null;
    status?: WorkStatus;
    linkedTabId?: string | null;
    lastQueryAt?: string | Date | null;
};

export type WorkInvestigationUpdateInput = {
    title?: string;
    summary?: string | null;
    status?: WorkStatus;
    linkedTabId?: string | null;
    lastQueryAt?: string | Date | null;
};

export type WorkRunCreateInput = {
    id?: string;
    workId: string;
    organizationId: string;
    connectionId: string;
    createdByUserId: string;
};

export type WorkRunEventCreateInput = {
    id?: string;
    runId: string;
    workId: string;
    organizationId: string;
    type: WorkRunEventType;
    role: WorkRunEventRole;
    content?: string | null;
    payload?: Record<string, unknown> | null;
    createdAt?: string | Date | null;
};

export class PostgresWorksRepository {
    private db!: PostgresDBClient;

    async init() {
        try {
            this.db = (await getClient()) as PostgresDBClient;
            if (!this.db) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
            }
        } catch (e) {
            console.error(translateDatabase('Database.Logs.InitFailed'), e);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError(translateDatabase('Database.Errors.NotInitialized'), 500);
    }

    async create(input: WorkCreateInput): Promise<Work> {
        this.assertInited();

        const now = new Date();
        const [row] = await this.db
            .insert(works)
            .values({
                id: input.id ?? newEntityId(),
                organizationId: input.organizationId,
                title: input.title?.trim() || 'Untitled Work',
                status: 'draft',
                goal: input.goal,
                conclusion: input.conclusion ?? null,
                connectionId: input.connectionId,
                createdBy: input.createdBy,
                createdByUserId: input.createdByUserId,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        if (!row) throw new DatabaseError('Failed to create work.', 500);
        return row as Work;
    }

    async getById(params: { organizationId: string; id: string }): Promise<Work | null> {
        this.assertInited();

        const [row] = await this.db
            .select()
            .from(works)
            .where(and(eq(works.organizationId, params.organizationId), eq(works.id, params.id)))
            .limit(1);

        return (row as Work | undefined) ?? null;
    }

    async list(params: { organizationId: string; connectionId?: string | null; limit?: number }): Promise<Work[]> {
        this.assertInited();

        const conds = [eq(works.organizationId, params.organizationId)];
        if (params.connectionId) conds.push(eq(works.connectionId, params.connectionId));

        let query = this.db
            .select()
            .from(works)
            .where(and(...conds))
            .orderBy(desc(works.updatedAt));

        if (params.limit && params.limit > 0) {
            query = (query as any).limit(params.limit);
        }

        return (await query) as Work[];
    }

    async update(params: { organizationId: string; id: string; patch: WorkUpdateInput }): Promise<Work> {
        this.assertInited();

        const updatePayload: Record<string, unknown> = {};
        let hasChanges = false;

        if (params.patch.title !== undefined) {
            updatePayload.title = params.patch.title?.trim() || 'Untitled Work';
            hasChanges = true;
        }
        if (params.patch.goal !== undefined) {
            updatePayload.goal = params.patch.goal;
            hasChanges = true;
        }
        if (params.patch.conclusion !== undefined) {
            updatePayload.conclusion = params.patch.conclusion;
            hasChanges = true;
        }
        if (params.patch.status !== undefined) {
            updatePayload.status = params.patch.status;
            hasChanges = true;
        }

        if (hasChanges) {
            await this.db
                .update(works)
                .set({ ...updatePayload, updatedAt: new Date() } as any)
                .where(and(eq(works.organizationId, params.organizationId), eq(works.id, params.id)));
        }

        const row = await this.getById({ organizationId: params.organizationId, id: params.id });
        if (!row) throw new DatabaseError('Work not found.', 404);
        return row;
    }

    async updateGoal(params: { organizationId: string; id: string; goal: string }): Promise<Work> {
        return this.update({ organizationId: params.organizationId, id: params.id, patch: { goal: params.goal } });
    }

    async updateConclusion(params: { organizationId: string; id: string; conclusion: string | null }): Promise<Work> {
        return this.update({ organizationId: params.organizationId, id: params.id, patch: { conclusion: params.conclusion } });
    }

    async updateStatus(params: { organizationId: string; id: string; status: WorkStatus }): Promise<Work> {
        return this.update({ organizationId: params.organizationId, id: params.id, patch: { status: params.status } });
    }

    async createRun(input: WorkRunCreateInput): Promise<{ run: WorkRun; existingRunningRun: WorkRun | null }> {
        this.assertInited();

        const work = await this.getById({ organizationId: input.organizationId, id: input.workId });
        if (!work) throw new DatabaseError('Work not found.', 404);

        const existingRunningRun = await this.getRunningRun({ organizationId: input.organizationId, workId: input.workId });
        if (existingRunningRun) {
            return {
                run: existingRunningRun,
                existingRunningRun,
            };
        }

        const now = new Date();
        try {
            const [row] = await this.db
                .insert(workRuns)
                .values({
                    id: input.id ?? newEntityId(),
                    workId: input.workId,
                    organizationId: input.organizationId,
                    connectionId: input.connectionId,
                    status: 'running',
                    previousWorkStatus: work.status,
                    createdByUserId: input.createdByUserId,
                    startedAt: now,
                    completedAt: null,
                    error: null,
                })
                .returning();

            if (!row) throw new DatabaseError('Failed to create work run.', 500);

            await this.updateStatus({
                organizationId: input.organizationId,
                id: input.workId,
                status: 'running',
            });

            return {
                run: row as WorkRun,
                existingRunningRun: null,
            };
        } catch (error) {
            const existing = await this.getRunningRun({ organizationId: input.organizationId, workId: input.workId });
            if (existing) {
                return {
                    run: existing,
                    existingRunningRun: existing,
                };
            }
            throw error;
        }
    }

    async getRunById(params: { organizationId: string; workId: string; id: string }): Promise<WorkRun | null> {
        this.assertInited();

        const [row] = await this.db
            .select()
            .from(workRuns)
            .where(and(eq(workRuns.organizationId, params.organizationId), eq(workRuns.workId, params.workId), eq(workRuns.id, params.id)))
            .limit(1);

        return (row as WorkRun | undefined) ?? null;
    }

    async getRunningRun(params: { organizationId: string; workId: string }): Promise<WorkRun | null> {
        this.assertInited();

        const [row] = await this.db
            .select()
            .from(workRuns)
            .where(and(eq(workRuns.organizationId, params.organizationId), eq(workRuns.workId, params.workId), eq(workRuns.status, 'running')))
            .limit(1);

        return (row as WorkRun | undefined) ?? null;
    }

    async listRuns(params: { organizationId: string; workId: string; limit?: number }): Promise<WorkRun[]> {
        this.assertInited();

        let query = this.db
            .select()
            .from(workRuns)
            .where(and(eq(workRuns.organizationId, params.organizationId), eq(workRuns.workId, params.workId)))
            .orderBy(desc(workRuns.startedAt));

        if (params.limit && params.limit > 0) {
            query = (query as any).limit(params.limit);
        }

        return (await query) as WorkRun[];
    }

    async appendRunEvent(input: WorkRunEventCreateInput): Promise<WorkRunEvent> {
        this.assertInited();

        const [row] = await this.db
            .insert(workRunEvents)
            .values({
                id: input.id ?? newEntityId(),
                runId: input.runId,
                workId: input.workId,
                organizationId: input.organizationId,
                type: input.type,
                role: input.role,
                content: input.content ?? null,
                payload: input.payload ?? null,
                createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
            })
            .returning();

        if (!row) throw new DatabaseError('Failed to append work run event.', 500);
        return row as WorkRunEvent;
    }

    async listRunEvents(params: { organizationId: string; workId: string; runId?: string | null; limit?: number }): Promise<WorkRunEvent[]> {
        this.assertInited();

        const conds = [eq(workRunEvents.organizationId, params.organizationId), eq(workRunEvents.workId, params.workId)];
        if (params.runId) conds.push(eq(workRunEvents.runId, params.runId));

        let query = this.db.select().from(workRunEvents).where(and(...conds)).orderBy(asc(workRunEvents.createdAt));

        if (params.limit && params.limit > 0) {
            query = (query as any).limit(params.limit);
        }

        return (await query) as WorkRunEvent[];
    }

    async getRunEventById(params: { organizationId: string; workId: string; id: string }): Promise<WorkRunEvent | null> {
        this.assertInited();

        const [row] = await this.db
            .select()
            .from(workRunEvents)
            .where(and(eq(workRunEvents.organizationId, params.organizationId), eq(workRunEvents.workId, params.workId), eq(workRunEvents.id, params.id)))
            .limit(1);

        return (row as WorkRunEvent | undefined) ?? null;
    }

    async completeRun(params: { organizationId: string; workId: string; id: string }): Promise<WorkRun> {
        this.assertInited();

        const now = new Date();
        const [row] = await this.db
            .update(workRuns)
            .set({
                status: 'completed',
                completedAt: now,
                error: null,
            })
            .where(and(eq(workRuns.organizationId, params.organizationId), eq(workRuns.workId, params.workId), eq(workRuns.id, params.id)))
            .returning();

        if (!row) throw new DatabaseError('Work run not found.', 404);

        await this.updateStatus({
            organizationId: params.organizationId,
            id: params.workId,
            status: 'completed',
        });

        return row as WorkRun;
    }

    async failRun(params: { organizationId: string; workId: string; id: string; error: string }): Promise<WorkRun> {
        this.assertInited();

        const run = await this.getRunById({ organizationId: params.organizationId, workId: params.workId, id: params.id });
        if (!run) throw new DatabaseError('Work run not found.', 404);

        const now = new Date();
        const [row] = await this.db
            .update(workRuns)
            .set({
                status: 'failed',
                completedAt: now,
                error: params.error,
            })
            .where(and(eq(workRuns.organizationId, params.organizationId), eq(workRuns.workId, params.workId), eq(workRuns.id, params.id)))
            .returning();

        if (!row) throw new DatabaseError('Work run not found.', 404);

        await this.updateStatus({
            organizationId: params.organizationId,
            id: params.workId,
            status: run.previousWorkStatus,
        });

        return row as WorkRun;
    }

    async createInvestigation(input: WorkInvestigationCreateInput): Promise<WorkInvestigation> {
        this.assertInited();

        const work = await this.getById({ organizationId: input.organizationId, id: input.workId });
        if (!work) throw new DatabaseError('Work not found.', 404);

        const now = new Date();
        const [row] = await this.db
            .insert(workInvestigations)
            .values({
                id: input.id ?? newEntityId(),
                workId: input.workId,
                organizationId: input.organizationId,
                connectionId: input.connectionId,
                title: input.title,
                summary: input.summary ?? null,
                status: input.status ?? 'draft',
                linkedTabId: input.linkedTabId ?? null,
                lastQueryAt: input.lastQueryAt ? new Date(input.lastQueryAt) : null,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        if (!row) throw new DatabaseError('Failed to create work investigation.', 500);
        return row as WorkInvestigation;
    }

    async listInvestigations(params: { organizationId: string; workId: string }): Promise<WorkInvestigation[]> {
        this.assertInited();

        const rows = await this.db
            .select()
            .from(workInvestigations)
            .where(and(eq(workInvestigations.organizationId, params.organizationId), eq(workInvestigations.workId, params.workId)))
            .orderBy(desc(workInvestigations.updatedAt), desc(workInvestigations.createdAt));

        return rows as WorkInvestigation[];
    }

    async getInvestigationById(params: { organizationId: string; workId: string; id: string }): Promise<WorkInvestigation | null> {
        this.assertInited();

        const [row] = await this.db
            .select()
            .from(workInvestigations)
            .where(and(eq(workInvestigations.organizationId, params.organizationId), eq(workInvestigations.workId, params.workId), eq(workInvestigations.id, params.id)))
            .limit(1);

        return (row as WorkInvestigation | undefined) ?? null;
    }

    async updateInvestigation(params: {
        organizationId: string;
        workId: string;
        id: string;
        patch: WorkInvestigationUpdateInput;
    }): Promise<WorkInvestigation> {
        this.assertInited();

        const updatePayload: Record<string, unknown> = {};
        let hasChanges = false;

        if (params.patch.title !== undefined) {
            updatePayload.title = params.patch.title;
            hasChanges = true;
        }
        if (params.patch.summary !== undefined) {
            updatePayload.summary = params.patch.summary;
            hasChanges = true;
        }
        if (params.patch.status !== undefined) {
            updatePayload.status = params.patch.status;
            hasChanges = true;
        }
        if (params.patch.linkedTabId !== undefined) {
            updatePayload.linkedTabId = params.patch.linkedTabId;
            hasChanges = true;
        }
        if (params.patch.lastQueryAt !== undefined) {
            updatePayload.lastQueryAt = params.patch.lastQueryAt ? new Date(params.patch.lastQueryAt) : null;
            hasChanges = true;
        }

        if (hasChanges) {
            await this.db
                .update(workInvestigations)
                .set({ ...updatePayload, updatedAt: new Date() } as any)
                .where(
                    and(
                        eq(workInvestigations.organizationId, params.organizationId),
                        eq(workInvestigations.workId, params.workId),
                        eq(workInvestigations.id, params.id),
                    ),
                );
        }

        const row = await this.getInvestigationById({
            organizationId: params.organizationId,
            workId: params.workId,
            id: params.id,
        });
        if (!row) throw new DatabaseError('Work investigation not found.', 404);
        return row;
    }
}
