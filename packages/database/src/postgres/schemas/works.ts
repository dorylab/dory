import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { newEntityId } from '@dory/shared/id';

export type WorkStatus = 'draft' | 'running' | 'completed';
export type WorkCreator = 'user' | 'agent';
export type WorkType = 'investigation' | 'analysis' | 'monitoring' | 'data_qa' | 'sql_workspace';
export type WorkAnalysisAuditStatus = 'draft' | 'reviewed' | 'revised' | 'accepted' | 'rejected';
export type WorkConclusionStatus = 'fresh' | 'outdated' | 'missing';
export type WorkConclusionConfidence = 'low' | 'medium' | 'high';
export type WorkConclusionMetadata = {
    confidence: WorkConclusionConfidence;
    caveats: string[];
    recommendedNextStep: string | null;
};
export type WorkScope = {
    timeRange?: string | null;
    tablesMode?: 'auto' | 'selected' | null;
    selectedTables?: string[];
    metrics?: string[];
    constraints?: string[];
};
export type WorkFindingCreator = 'user' | 'agent' | 'automation';
export type WorkRevisionCreator = 'user' | 'agent' | 'automation';
export type WorkInvestigationRevisionFindingSnapshot = {
    id: string;
    content: string;
    whyItMatters: string | null;
    sourceTabId: string | null;
    sourceRunEventId: string | null;
    createdBy: WorkFindingCreator;
    orderIndex: number;
    createdAt: string;
    updatedAt: string;
};
export type WorkInvestigationRevisionAssetSummary = {
    sqlAssetCount: number;
    linkedTabId: string | null;
    lastQueryAt: string | null;
};
export type WorkRunStatus = 'running' | 'completed' | 'failed';
export type WorkWorkspaceSnapshotIntent = 'continue_analysis';
export type WorkWorkspaceSnapshotChangeSummary = {
    sqlEdited?: boolean;
    resultRefreshed?: boolean;
    chartConfigChanged?: boolean;
    selectedRowsChanged?: boolean;
};
export type WorkWorkspaceSnapshotHumanEdits = {
    sql?: string | null;
    resultPreview?: Record<string, unknown> | null;
    chartConfig?: Record<string, unknown> | null;
    selectedRows?: Record<string, unknown> | null;
    userNote?: string | null;
    changeSummary?: WorkWorkspaceSnapshotChangeSummary | null;
};
export type WorkRunEventType =
    | 'message'
    | 'tool_call'
    | 'tool_result'
    | 'sql_executed'
    | 'investigation_created'
    | 'investigation_updated'
    | 'conclusion_updated'
    | 'error'
    | 'completed';
export type WorkRunEventRole = 'user' | 'agent' | 'tool' | 'system';

export const works = pgTable(
    'works',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        title: text('title').notNull().default('Untitled Work'),
        status: text('status').$type<WorkStatus>().notNull().default('draft'),
        goal: text('goal').notNull(),
        workType: text('work_type').$type<WorkType>().notNull().default('investigation'),
        scope: jsonb('scope').$type<WorkScope | null>(),
        initialContext: text('initial_context'),
        conclusion: text('conclusion'),
        conclusionMetadata: jsonb('conclusion_metadata').$type<WorkConclusionMetadata | null>(),
        conclusionStatus: text('conclusion_status').$type<WorkConclusionStatus>().notNull().default('missing'),
        conclusionUpdatedAt: timestamp('conclusion_updated_at', { withTimezone: true }),
        connectionId: text('connection_id').notNull(),
        createdBy: text('created_by').$type<WorkCreator>().notNull(),
        createdByUserId: text('created_by_user_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_works_organization_updated_at').on(t.organizationId, t.updatedAt),
        index('idx_works_connection_id').on(t.connectionId),
        index('idx_works_created_by_user_id').on(t.createdByUserId),
    ],
);

export const workInvestigations = pgTable(
    'work_investigations',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        workId: text('work_id').notNull(),
        organizationId: text('organization_id').notNull(),
        connectionId: text('connection_id').notNull(),
        title: text('title').notNull(),
        status: text('status').$type<WorkStatus>().notNull().default('draft'),
        auditStatus: text('audit_status').$type<WorkAnalysisAuditStatus>().notNull().default('draft'),
        currentRevisionId: text('current_revision_id'),
        linkedTabId: text('linked_tab_id'),
        lastQueryAt: timestamp('last_query_at', { withTimezone: true }),
        reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
        acceptedAt: timestamp('accepted_at', { withTimezone: true }),
        rejectedAt: timestamp('rejected_at', { withTimezone: true }),
        auditStatusUpdatedAt: timestamp('audit_status_updated_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_work_investigations_work_id').on(t.workId),
        index('idx_work_investigations_organization_work').on(t.organizationId, t.workId),
        index('idx_work_investigations_connection_id').on(t.connectionId),
    ],
);

export const workInvestigationRevisions = pgTable(
    'work_investigation_revisions',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        workId: text('work_id').notNull(),
        investigationId: text('investigation_id').notNull(),
        version: integer('version').notNull(),
        instruction: text('instruction'),
        title: text('title').notNull(),
        findingsSnapshot: jsonb('findings_snapshot').$type<WorkInvestigationRevisionFindingSnapshot[]>().notNull(),
        assetSummary: jsonb('asset_summary').$type<WorkInvestigationRevisionAssetSummary>().notNull(),
        runId: text('run_id'),
        createdBy: text('created_by').$type<WorkRevisionCreator>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_work_investigation_revisions_work').on(t.organizationId, t.workId),
        index('idx_work_investigation_revisions_investigation').on(t.organizationId, t.investigationId),
        uniqueIndex('uidx_work_investigation_revisions_version').on(t.investigationId, t.version),
    ],
);

export const workInvestigationFindings = pgTable(
    'work_investigation_findings',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        workId: text('work_id').notNull(),
        investigationId: text('investigation_id').notNull(),
        organizationId: text('organization_id').notNull(),
        content: text('content').notNull(),
        whyItMatters: text('why_it_matters'),
        sourceTabId: text('source_tab_id'),
        sourceRunEventId: text('source_run_event_id'),
        createdBy: text('created_by').$type<WorkFindingCreator>().notNull(),
        orderIndex: integer('order_index').notNull().default(0),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_work_investigation_findings_work').on(t.organizationId, t.workId),
        index('idx_work_investigation_findings_investigation').on(t.organizationId, t.investigationId),
        index('idx_work_investigation_findings_source_tab').on(t.sourceTabId),
        index('idx_work_investigation_findings_source_event').on(t.sourceRunEventId),
    ],
);

export const workRuns = pgTable(
    'work_runs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        workId: text('work_id').notNull(),
        organizationId: text('organization_id').notNull(),
        connectionId: text('connection_id').notNull(),
        status: text('status').$type<WorkRunStatus>().notNull().default('running'),
        previousWorkStatus: text('previous_work_status').$type<WorkStatus>().notNull(),
        createdByUserId: text('created_by_user_id').notNull(),
        startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
        completedAt: timestamp('completed_at', { withTimezone: true }),
        error: text('error'),
    },
    t => [
        index('idx_work_runs_work_started_at').on(t.workId, t.startedAt),
        index('idx_work_runs_organization_work').on(t.organizationId, t.workId),
        index('idx_work_runs_status').on(t.status),
        uniqueIndex('uidx_work_runs_one_running_per_work')
            .on(t.workId)
            .where(sql`${t.status} = 'running'`),
    ],
);

export const workRunEvents = pgTable(
    'work_run_events',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        runId: text('run_id').notNull(),
        workId: text('work_id').notNull(),
        organizationId: text('organization_id').notNull(),
        type: text('type').$type<WorkRunEventType>().notNull(),
        role: text('role').$type<WorkRunEventRole>().notNull(),
        content: text('content'),
        payload: jsonb('payload').$type<Record<string, unknown> | null>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_work_run_events_run_created_at').on(t.runId, t.createdAt),
        index('idx_work_run_events_work_created_at').on(t.workId, t.createdAt),
        index('idx_work_run_events_organization_work').on(t.organizationId, t.workId),
        index('idx_work_run_events_type').on(t.type),
    ],
);

export const workWorkspaceSnapshots = pgTable(
    'work_workspace_snapshots',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        workId: text('work_id').notNull(),
        investigationId: text('investigation_id').notNull(),
        workspaceId: text('workspace_id').notNull(),
        previousAgentStepId: text('previous_agent_step_id'),
        intent: text('intent').$type<WorkWorkspaceSnapshotIntent>().notNull(),
        humanEdits: jsonb('human_edits').$type<WorkWorkspaceSnapshotHumanEdits>().notNull(),
        createdByUserId: text('created_by_user_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_work_workspace_snapshots_work_created').on(t.organizationId, t.workId, t.createdAt),
        index('idx_work_workspace_snapshots_investigation_created').on(t.organizationId, t.investigationId, t.createdAt),
        index('idx_work_workspace_snapshots_workspace_created').on(t.organizationId, t.workspaceId, t.createdAt),
    ],
);

export type Work = typeof works.$inferSelect;
export type NewWork = typeof works.$inferInsert;
export type WorkInvestigation = typeof workInvestigations.$inferSelect;
export type NewWorkInvestigation = typeof workInvestigations.$inferInsert;
export type WorkInvestigationRevision = typeof workInvestigationRevisions.$inferSelect;
export type NewWorkInvestigationRevision = typeof workInvestigationRevisions.$inferInsert;
export type WorkInvestigationFinding = typeof workInvestigationFindings.$inferSelect;
export type NewWorkInvestigationFinding = typeof workInvestigationFindings.$inferInsert;
export type WorkRun = typeof workRuns.$inferSelect;
export type NewWorkRun = typeof workRuns.$inferInsert;
export type WorkRunEvent = typeof workRunEvents.$inferSelect;
export type NewWorkRunEvent = typeof workRunEvents.$inferInsert;
export type WorkWorkspaceSnapshot = typeof workWorkspaceSnapshots.$inferSelect;
export type NewWorkWorkspaceSnapshot = typeof workWorkspaceSnapshots.$inferInsert;
