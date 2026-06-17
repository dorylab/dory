import { and, asc, desc, eq } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import {
    tabs,
    workInvestigationFindings,
    workInvestigationRevisions,
    workInvestigations,
    workRunEvents,
    workRuns,
    workWorkspaceSnapshots,
    works,
    type Work,
    type WorkAnalysisAuditStatus,
    type WorkConclusionMetadata,
    type WorkCreator,
    type WorkFindingCreator,
    type WorkInvestigation,
    type WorkInvestigationFinding,
    type WorkInvestigationRevision,
    type WorkInvestigationRevisionAssetSummary,
    type WorkInvestigationRevisionFindingSnapshot,
    type WorkRun,
    type WorkRunEvent,
    type WorkRunEventRole,
    type WorkRunEventType,
    type WorkWorkspaceSnapshot,
    type WorkWorkspaceSnapshotHumanEdits,
    type WorkWorkspaceSnapshotIntent,
    type WorkRevisionCreator,
    type WorkScope,
    type WorkStatus,
    type WorkType,
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
    workType?: WorkType | null;
    scope?: WorkScope | null;
    initialContext?: string | null;
    conclusion?: string | null;
    conclusionMetadata?: WorkConclusionMetadata | null;
    connectionId: string;
    createdBy: WorkCreator;
    createdByUserId: string;
};

export type WorkUpdateInput = {
    title?: string | null;
    goal?: string;
    workType?: WorkType;
    scope?: WorkScope | null;
    initialContext?: string | null;
    conclusion?: string | null;
    connectionId?: string;
    status?: WorkStatus;
};

export type WorkInvestigationCreateInput = {
    id?: string;
    workId: string;
    organizationId: string;
    connectionId: string;
    title: string;
    status?: WorkStatus;
    auditStatus?: WorkAnalysisAuditStatus;
    createdBy?: WorkRevisionCreator;
    linkedTabId?: string | null;
    lastQueryAt?: string | Date | null;
};

export type WorkInvestigationUpdateInput = {
    title?: string;
    status?: WorkStatus;
    auditStatus?: WorkAnalysisAuditStatus;
    currentRevisionId?: string | null;
    linkedTabId?: string | null;
    lastQueryAt?: string | Date | null;
};

export type WorkInvestigationRevisionCreateInput = {
    id?: string;
    organizationId: string;
    workId: string;
    investigationId: string;
    instruction?: string | null;
    title?: string | null;
    runId?: string | null;
    createdBy: WorkRevisionCreator;
    version?: number | null;
    markConclusionOutdated?: boolean;
};

export type WorkInvestigationFindingCreateInput = {
    id?: string;
    workId: string;
    investigationId: string;
    organizationId: string;
    content: string;
    whyItMatters?: string | null;
    sourceTabId?: string | null;
    sourceRunEventId?: string | null;
    createdBy: WorkFindingCreator;
    orderIndex?: number | null;
};

export type WorkInvestigationFindingUpdateInput = {
    content?: string;
    whyItMatters?: string | null;
    sourceTabId?: string | null;
    sourceRunEventId?: string | null;
    orderIndex?: number | null;
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

export type WorkWorkspaceSnapshotCreateInput = {
    id?: string;
    organizationId: string;
    workId: string;
    investigationId: string;
    workspaceId: string;
    previousAgentStepId?: string | null;
    intent: WorkWorkspaceSnapshotIntent;
    humanEdits: WorkWorkspaceSnapshotHumanEdits;
    createdByUserId: string;
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
                status: 'waiting_for_user',
                goal: input.goal,
                workType: input.workType ?? 'investigation',
                scope: input.scope ?? null,
                initialContext: input.initialContext?.trim() || null,
                conclusion: input.conclusion ?? null,
                conclusionMetadata: input.conclusion?.trim() ? (input.conclusionMetadata ?? null) : null,
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
        if (params.patch.workType !== undefined) {
            updatePayload.workType = params.patch.workType;
            hasChanges = true;
        }
        if (params.patch.scope !== undefined) {
            updatePayload.scope = params.patch.scope;
            hasChanges = true;
        }
        if (params.patch.initialContext !== undefined) {
            updatePayload.initialContext = params.patch.initialContext?.trim() || null;
            hasChanges = true;
        }
        if (params.patch.conclusion !== undefined) {
            updatePayload.conclusion = params.patch.conclusion;
            hasChanges = true;
        }
        if (params.patch.connectionId !== undefined) {
            updatePayload.connectionId = params.patch.connectionId;
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

    async updateTitle(params: { organizationId: string; id: string; title: string }): Promise<Work> {
        return this.update({ organizationId: params.organizationId, id: params.id, patch: { title: params.title } });
    }

    async updateConclusion(params: { organizationId: string; id: string; conclusion: string | null; conclusionMetadata?: WorkConclusionMetadata | null }): Promise<Work> {
        this.assertInited();

        const now = new Date();
        const hasConclusion = Boolean(params.conclusion?.trim());
        const [row] = await this.db
            .update(works)
            .set({
                conclusion: params.conclusion,
                conclusionMetadata: hasConclusion ? (params.conclusionMetadata ?? null) : null,
                conclusionStatus: hasConclusion ? 'fresh' : 'missing',
                conclusionUpdatedAt: hasConclusion ? now : null,
                updatedAt: now,
            } as any)
            .where(and(eq(works.organizationId, params.organizationId), eq(works.id, params.id)))
            .returning();

        if (!row) throw new DatabaseError('Work not found.', 404);
        return row as Work;
    }

    async markConclusionOutdated(params: { organizationId: string; id: string }): Promise<Work> {
        this.assertInited();

        const work = await this.getById({ organizationId: params.organizationId, id: params.id });
        if (!work) throw new DatabaseError('Work not found.', 404);
        const nextStatus = work.conclusion?.trim() ? 'outdated' : 'missing';
        if (work.conclusionStatus === nextStatus) return work;

        const [row] = await this.db
            .update(works)
            .set({
                conclusionStatus: nextStatus,
                updatedAt: new Date(),
            } as any)
            .where(and(eq(works.organizationId, params.organizationId), eq(works.id, params.id)))
            .returning();

        if (!row) throw new DatabaseError('Work not found.', 404);
        return row as Work;
    }

    async updateStatus(params: { organizationId: string; id: string; status: WorkStatus }): Promise<Work> {
        return this.update({ organizationId: params.organizationId, id: params.id, patch: { status: params.status } });
    }

    async delete(params: { organizationId: string; id: string }): Promise<void> {
        this.assertInited();

        const work = await this.getById(params);
        if (!work) throw new DatabaseError('Work not found.', 404);

        await this.db
            .delete(workInvestigationFindings)
            .where(and(eq(workInvestigationFindings.organizationId, params.organizationId), eq(workInvestigationFindings.workId, params.id)));
        await this.db.delete(workWorkspaceSnapshots).where(and(eq(workWorkspaceSnapshots.organizationId, params.organizationId), eq(workWorkspaceSnapshots.workId, params.id)));
        await this.db.delete(workRunEvents).where(and(eq(workRunEvents.organizationId, params.organizationId), eq(workRunEvents.workId, params.id)));
        await this.db.delete(workRuns).where(and(eq(workRuns.organizationId, params.organizationId), eq(workRuns.workId, params.id)));
        await this.db.delete(tabs).where(eq(tabs.workspaceScopeWorkId, params.id));
        await this.db.delete(workInvestigationRevisions).where(and(eq(workInvestigationRevisions.organizationId, params.organizationId), eq(workInvestigationRevisions.workId, params.id)));
        await this.db.delete(workInvestigations).where(and(eq(workInvestigations.organizationId, params.organizationId), eq(workInvestigations.workId, params.id)));
        await this.db.delete(works).where(and(eq(works.organizationId, params.organizationId), eq(works.id, params.id)));
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

        let query = this.db
            .select()
            .from(workRunEvents)
            .where(and(...conds))
            .orderBy(asc(workRunEvents.createdAt));

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

    async createWorkspaceSnapshot(input: WorkWorkspaceSnapshotCreateInput): Promise<WorkWorkspaceSnapshot> {
        this.assertInited();

        if (input.intent === 'continue_analysis') {
            const investigation = await this.getInvestigationById({
                organizationId: input.organizationId,
                workId: input.workId,
                id: input.investigationId,
            });
            if (!investigation) throw new DatabaseError('Work investigation not found.', 404);
        }

        const [row] = await this.db
            .insert(workWorkspaceSnapshots)
            .values({
                id: input.id ?? newEntityId(),
                organizationId: input.organizationId,
                workId: input.workId,
                investigationId: input.investigationId,
                workspaceId: input.workspaceId,
                previousAgentStepId: input.previousAgentStepId ?? null,
                intent: input.intent,
                humanEdits: input.humanEdits,
                createdByUserId: input.createdByUserId,
                createdAt: new Date(),
            })
            .returning();

        if (!row) throw new DatabaseError('Failed to create workspace snapshot.', 500);
        return row as WorkWorkspaceSnapshot;
    }

    async getWorkspaceSnapshotById(params: { organizationId: string; workId: string; id: string }): Promise<WorkWorkspaceSnapshot | null> {
        this.assertInited();

        const [row] = await this.db
            .select()
            .from(workWorkspaceSnapshots)
            .where(
                and(eq(workWorkspaceSnapshots.organizationId, params.organizationId), eq(workWorkspaceSnapshots.workId, params.workId), eq(workWorkspaceSnapshots.id, params.id)),
            )
            .limit(1);

        return (row as WorkWorkspaceSnapshot | undefined) ?? null;
    }

    async listWorkspaceSnapshots(params: { organizationId: string; workId: string; investigationId?: string | null; limit?: number }): Promise<WorkWorkspaceSnapshot[]> {
        this.assertInited();

        const conds = [eq(workWorkspaceSnapshots.organizationId, params.organizationId), eq(workWorkspaceSnapshots.workId, params.workId)];
        if (params.investigationId) conds.push(eq(workWorkspaceSnapshots.investigationId, params.investigationId));

        let query = this.db
            .select()
            .from(workWorkspaceSnapshots)
            .where(and(...conds))
            .orderBy(desc(workWorkspaceSnapshots.createdAt));

        if (params.limit && params.limit > 0) {
            query = (query as any).limit(params.limit);
        }

        return (await query) as WorkWorkspaceSnapshot[];
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
                status: input.status ?? 'draft',
                auditStatus: input.auditStatus ?? 'draft',
                linkedTabId: input.linkedTabId ?? null,
                lastQueryAt: input.lastQueryAt ? new Date(input.lastQueryAt) : null,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        if (!row) throw new DatabaseError('Failed to create work investigation.', 500);
        const revision = await this.createInvestigationRevision({
            organizationId: input.organizationId,
            workId: input.workId,
            investigationId: row.id,
            title: row.title,
            createdBy: input.createdBy ?? (input.auditStatus === 'revised' ? 'user' : 'agent'),
            version: 1,
            markConclusionOutdated: false,
        });

        return {
            ...row,
            currentRevisionId: revision.id,
        } as WorkInvestigation;
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

    async updateInvestigation(params: { organizationId: string; workId: string; id: string; patch: WorkInvestigationUpdateInput }): Promise<WorkInvestigation> {
        this.assertInited();

        const updatePayload: Record<string, unknown> = {};
        let hasChanges = false;

        if (params.patch.title !== undefined) {
            updatePayload.title = params.patch.title;
            hasChanges = true;
        }
        if (params.patch.status !== undefined) {
            updatePayload.status = params.patch.status;
            hasChanges = true;
        }
        if (params.patch.auditStatus !== undefined) {
            const auditStatus = params.patch.auditStatus;
            updatePayload.auditStatus = auditStatus;
            updatePayload.auditStatusUpdatedAt = new Date();
            if (auditStatus === 'reviewed') {
                updatePayload.reviewedAt = new Date();
            }
            if (auditStatus === 'accepted') {
                updatePayload.acceptedAt = new Date();
            }
            if (auditStatus === 'rejected') {
                updatePayload.rejectedAt = new Date();
            }
            hasChanges = true;
        }
        if (params.patch.currentRevisionId !== undefined) {
            updatePayload.currentRevisionId = params.patch.currentRevisionId;
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
                .where(and(eq(workInvestigations.organizationId, params.organizationId), eq(workInvestigations.workId, params.workId), eq(workInvestigations.id, params.id)));
        }

        const row = await this.getInvestigationById({
            organizationId: params.organizationId,
            workId: params.workId,
            id: params.id,
        });
        if (!row) throw new DatabaseError('Work investigation not found.', 404);
        return row;
    }

    private toRevisionFindingSnapshot(findings: WorkInvestigationFinding[]): WorkInvestigationRevisionFindingSnapshot[] {
        return findings.map(finding => ({
            id: finding.id,
            content: finding.content,
            whyItMatters: finding.whyItMatters ?? null,
            sourceTabId: finding.sourceTabId,
            sourceRunEventId: finding.sourceRunEventId,
            createdBy: finding.createdBy,
            orderIndex: finding.orderIndex,
            createdAt: finding.createdAt.toISOString(),
            updatedAt: finding.updatedAt.toISOString(),
        }));
    }

    private async buildRevisionAssetSummary(params: {
        organizationId: string;
        workId: string;
        investigation: WorkInvestigation;
    }): Promise<WorkInvestigationRevisionAssetSummary> {
        const runEvents = await this.listRunEvents({
            organizationId: params.organizationId,
            workId: params.workId,
        });
        const sqlAssetCount = runEvents.reduce((count, event) => {
            if (event.type !== 'sql_executed') return count;
            const investigationId = event.payload?.investigationId;
            return investigationId === params.investigation.id ? count + 1 : count;
        }, 0);

        return {
            sqlAssetCount: Math.max(sqlAssetCount, params.investigation.linkedTabId ? 1 : 0),
            linkedTabId: params.investigation.linkedTabId,
            lastQueryAt: params.investigation.lastQueryAt?.toISOString() ?? null,
        };
    }

    async createInvestigationRevision(input: WorkInvestigationRevisionCreateInput): Promise<WorkInvestigationRevision> {
        this.assertInited();

        const investigation = await this.getInvestigationById({
            organizationId: input.organizationId,
            workId: input.workId,
            id: input.investigationId,
        });
        if (!investigation) throw new DatabaseError('Work investigation not found.', 404);

        const latestRevision = await this.getLatestInvestigationRevision({
            organizationId: input.organizationId,
            workId: input.workId,
            investigationId: input.investigationId,
        });
        const version =
            typeof input.version === 'number' && Number.isFinite(input.version)
                ? input.version
                : latestRevision
                  ? latestRevision.version + 1
                  : input.instruction?.trim()
                    ? 2
                    : 1;
        const findings = await this.listInvestigationFindings({
            organizationId: input.organizationId,
            workId: input.workId,
            investigationId: input.investigationId,
        });
        const assetSummary = await this.buildRevisionAssetSummary({
            organizationId: input.organizationId,
            workId: input.workId,
            investigation,
        });
        const now = new Date();
        const [row] = await this.db
            .insert(workInvestigationRevisions)
            .values({
                id: input.id ?? newEntityId(),
                organizationId: input.organizationId,
                workId: input.workId,
                investigationId: input.investigationId,
                version,
                instruction: input.instruction?.trim() || null,
                title: input.title?.trim() || investigation.title,
                findingsSnapshot: this.toRevisionFindingSnapshot(findings),
                assetSummary,
                runId: input.runId ?? null,
                createdBy: input.createdBy,
                createdAt: now,
            })
            .returning();

        if (!row) throw new DatabaseError('Failed to create work investigation revision.', 500);

        await this.db
            .update(workInvestigations)
            .set({
                currentRevisionId: row.id,
                updatedAt: now,
            } as any)
            .where(and(eq(workInvestigations.organizationId, input.organizationId), eq(workInvestigations.workId, input.workId), eq(workInvestigations.id, input.investigationId)));

        if (input.markConclusionOutdated && investigation.auditStatus !== 'rejected') {
            await this.markConclusionOutdated({ organizationId: input.organizationId, id: input.workId });
        }

        return row as WorkInvestigationRevision;
    }

    async getInvestigationRevisionById(params: {
        organizationId: string;
        workId: string;
        id: string;
    }): Promise<WorkInvestigationRevision | null> {
        this.assertInited();

        const [row] = await this.db
            .select()
            .from(workInvestigationRevisions)
            .where(and(eq(workInvestigationRevisions.organizationId, params.organizationId), eq(workInvestigationRevisions.workId, params.workId), eq(workInvestigationRevisions.id, params.id)))
            .limit(1);

        return (row as WorkInvestigationRevision | undefined) ?? null;
    }

    async getLatestInvestigationRevision(params: {
        organizationId: string;
        workId: string;
        investigationId: string;
    }): Promise<WorkInvestigationRevision | null> {
        this.assertInited();

        const [row] = await this.db
            .select()
            .from(workInvestigationRevisions)
            .where(
                and(
                    eq(workInvestigationRevisions.organizationId, params.organizationId),
                    eq(workInvestigationRevisions.workId, params.workId),
                    eq(workInvestigationRevisions.investigationId, params.investigationId),
                ),
            )
            .orderBy(desc(workInvestigationRevisions.version), desc(workInvestigationRevisions.createdAt))
            .limit(1);

        return (row as WorkInvestigationRevision | undefined) ?? null;
    }

    async listInvestigationRevisions(params: {
        organizationId: string;
        workId: string;
        investigationId?: string | null;
        limit?: number;
    }): Promise<WorkInvestigationRevision[]> {
        this.assertInited();

        const conds = [eq(workInvestigationRevisions.organizationId, params.organizationId), eq(workInvestigationRevisions.workId, params.workId)];
        if (params.investigationId) conds.push(eq(workInvestigationRevisions.investigationId, params.investigationId));

        let query = this.db
            .select()
            .from(workInvestigationRevisions)
            .where(and(...conds))
            .orderBy(desc(workInvestigationRevisions.createdAt), desc(workInvestigationRevisions.version));

        if (params.limit && params.limit > 0) {
            query = (query as any).limit(params.limit);
        }

        return (await query) as WorkInvestigationRevision[];
    }

    async createInvestigationFinding(input: WorkInvestigationFindingCreateInput): Promise<WorkInvestigationFinding> {
        this.assertInited();

        const investigation = await this.getInvestigationById({
            organizationId: input.organizationId,
            workId: input.workId,
            id: input.investigationId,
        });
        if (!investigation) throw new DatabaseError('Work investigation not found.', 404);

        const existing = await this.listInvestigationFindings({
            organizationId: input.organizationId,
            workId: input.workId,
            investigationId: input.investigationId,
        });
        const orderIndex =
            typeof input.orderIndex === 'number' && Number.isFinite(input.orderIndex)
                ? input.orderIndex
                : existing.reduce((max, finding) => Math.max(max, finding.orderIndex), -1) + 1;
        const now = new Date();
        const [row] = await this.db
            .insert(workInvestigationFindings)
            .values({
                id: input.id ?? newEntityId(),
                workId: input.workId,
                investigationId: input.investigationId,
                organizationId: input.organizationId,
                content: input.content,
                whyItMatters: input.whyItMatters?.trim() || null,
                sourceTabId: input.sourceTabId ?? null,
                sourceRunEventId: input.sourceRunEventId ?? null,
                createdBy: input.createdBy,
                orderIndex,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        if (!row) throw new DatabaseError('Failed to create work investigation finding.', 500);
        await this.db
            .update(workInvestigations)
            .set({ updatedAt: new Date() })
            .where(and(eq(workInvestigations.organizationId, input.organizationId), eq(workInvestigations.workId, input.workId), eq(workInvestigations.id, input.investigationId)));
        return row as WorkInvestigationFinding;
    }

    async listInvestigationFindings(params: { organizationId: string; workId: string; investigationId: string }): Promise<WorkInvestigationFinding[]> {
        this.assertInited();

        const rows = await this.db
            .select()
            .from(workInvestigationFindings)
            .where(
                and(
                    eq(workInvestigationFindings.organizationId, params.organizationId),
                    eq(workInvestigationFindings.workId, params.workId),
                    eq(workInvestigationFindings.investigationId, params.investigationId),
                ),
            )
            .orderBy(asc(workInvestigationFindings.orderIndex), asc(workInvestigationFindings.createdAt));

        return rows as WorkInvestigationFinding[];
    }

    async listFindingsForWork(params: { organizationId: string; workId: string }): Promise<WorkInvestigationFinding[]> {
        this.assertInited();

        const rows = await this.db
            .select()
            .from(workInvestigationFindings)
            .where(and(eq(workInvestigationFindings.organizationId, params.organizationId), eq(workInvestigationFindings.workId, params.workId)))
            .orderBy(asc(workInvestigationFindings.orderIndex), asc(workInvestigationFindings.createdAt));

        return rows as WorkInvestigationFinding[];
    }

    async getInvestigationFindingById(params: { organizationId: string; workId: string; id: string }): Promise<WorkInvestigationFinding | null> {
        this.assertInited();

        const [row] = await this.db
            .select()
            .from(workInvestigationFindings)
            .where(
                and(
                    eq(workInvestigationFindings.organizationId, params.organizationId),
                    eq(workInvestigationFindings.workId, params.workId),
                    eq(workInvestigationFindings.id, params.id),
                ),
            )
            .limit(1);

        return (row as WorkInvestigationFinding | undefined) ?? null;
    }

    async updateInvestigationFinding(params: {
        organizationId: string;
        workId: string;
        id: string;
        patch: WorkInvestigationFindingUpdateInput;
    }): Promise<WorkInvestigationFinding> {
        this.assertInited();

        const updatePayload: Record<string, unknown> = {};
        let hasChanges = false;
        if (params.patch.content !== undefined) {
            updatePayload.content = params.patch.content;
            hasChanges = true;
        }
        if (params.patch.whyItMatters !== undefined) {
            updatePayload.whyItMatters = params.patch.whyItMatters?.trim() || null;
            hasChanges = true;
        }
        if (params.patch.sourceTabId !== undefined) {
            updatePayload.sourceTabId = params.patch.sourceTabId;
            hasChanges = true;
        }
        if (params.patch.sourceRunEventId !== undefined) {
            updatePayload.sourceRunEventId = params.patch.sourceRunEventId;
            hasChanges = true;
        }
        if (params.patch.orderIndex !== undefined) {
            updatePayload.orderIndex = params.patch.orderIndex ?? 0;
            hasChanges = true;
        }

        if (hasChanges) {
            await this.db
                .update(workInvestigationFindings)
                .set({ ...updatePayload, updatedAt: new Date() } as any)
                .where(
                    and(
                        eq(workInvestigationFindings.organizationId, params.organizationId),
                        eq(workInvestigationFindings.workId, params.workId),
                        eq(workInvestigationFindings.id, params.id),
                    ),
                );
        }

        const row = await this.getInvestigationFindingById({
            organizationId: params.organizationId,
            workId: params.workId,
            id: params.id,
        });
        if (!row) throw new DatabaseError('Work investigation finding not found.', 404);
        return row;
    }

    async deleteInvestigationFinding(params: { organizationId: string; workId: string; id: string }): Promise<void> {
        this.assertInited();

        await this.db
            .delete(workInvestigationFindings)
            .where(
                and(
                    eq(workInvestigationFindings.organizationId, params.organizationId),
                    eq(workInvestigationFindings.workId, params.workId),
                    eq(workInvestigationFindings.id, params.id),
                ),
            );
    }

    async deleteInvestigation(params: { organizationId: string; workId: string; id: string }): Promise<void> {
        this.assertInited();

        const investigation = await this.getInvestigationById(params);
        if (!investigation) throw new DatabaseError('Work investigation not found.', 404);

        await this.db
            .delete(workInvestigationFindings)
            .where(
                and(
                    eq(workInvestigationFindings.organizationId, params.organizationId),
                    eq(workInvestigationFindings.workId, params.workId),
                    eq(workInvestigationFindings.investigationId, params.id),
                ),
            );
        await this.db
            .delete(workWorkspaceSnapshots)
            .where(
                and(
                    eq(workWorkspaceSnapshots.organizationId, params.organizationId),
                    eq(workWorkspaceSnapshots.workId, params.workId),
                    eq(workWorkspaceSnapshots.investigationId, params.id),
                ),
            );
        await this.db
            .delete(workInvestigationRevisions)
            .where(
                and(
                    eq(workInvestigationRevisions.organizationId, params.organizationId),
                    eq(workInvestigationRevisions.workId, params.workId),
                    eq(workInvestigationRevisions.investigationId, params.id),
                ),
            );
        await this.db.delete(tabs).where(and(eq(tabs.workspaceScopeWorkId, params.workId), eq(tabs.workspaceScopeInvestigationId, params.id)));
        await this.db
            .delete(workInvestigations)
            .where(and(eq(workInvestigations.organizationId, params.organizationId), eq(workInvestigations.workId, params.workId), eq(workInvestigations.id, params.id)));
        await this.markConclusionOutdated({ organizationId: params.organizationId, id: params.workId });
    }
}
