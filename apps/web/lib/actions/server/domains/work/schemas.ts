import { z } from 'zod';

export const workStatusSchema = z.enum(['draft', 'running', 'completed']);
export const workCreatorSchema = z.enum(['user', 'agent']);
export const workTypeSchema = z.enum(['investigation', 'analysis', 'monitoring', 'data_qa', 'sql_workspace']);
export const workAnalysisAuditStatusSchema = z.enum(['draft', 'needs_review', 'reviewed', 'revised', 'accepted', 'rejected']);
export const workScopeSchema = z
    .object({
        timeRange: z.string().nullable().optional(),
        tablesMode: z.enum(['auto', 'selected']).nullable().optional(),
        selectedTables: z.array(z.string()).optional(),
        metrics: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
    })
    .nullable();
export const workFindingCreatorSchema = z.enum(['user', 'agent', 'automation']);
export const workRunStatusSchema = z.enum(['running', 'completed', 'failed']);
export const workRunEventTypeSchema = z.enum([
    'message',
    'tool_call',
    'tool_result',
    'sql_executed',
    'investigation_created',
    'investigation_updated',
    'conclusion_updated',
    'error',
    'completed',
]);
export const workRunEventRoleSchema = z.enum(['user', 'agent', 'tool', 'system']);

export const workWorkspaceSnapshotChangeSummaryOutputSchema = z.object({
    sqlEdited: z.boolean().optional(),
    resultRefreshed: z.boolean().optional(),
    chartConfigChanged: z.boolean().optional(),
    selectedRowsChanged: z.boolean().optional(),
});

export const workWorkspaceSnapshotHumanEditsOutputSchema = z.object({
    sql: z.string().nullable().optional(),
    resultPreview: z.record(z.string(), z.unknown()).nullable().optional(),
    chartConfig: z.record(z.string(), z.unknown()).nullable().optional(),
    selectedRows: z.record(z.string(), z.unknown()).nullable().optional(),
    userNote: z.string().nullable().optional(),
    changeSummary: workWorkspaceSnapshotChangeSummaryOutputSchema.nullable().optional(),
});

export const workOutputSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    title: z.string(),
    status: workStatusSchema,
    goal: z.string(),
    workType: workTypeSchema,
    scope: workScopeSchema,
    initialContext: z.string().nullable(),
    conclusion: z.string().nullable(),
    connectionId: z.string(),
    createdBy: workCreatorSchema,
    createdByUserId: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export const workInvestigationOutputSchema = z.object({
    id: z.string(),
    workId: z.string(),
    organizationId: z.string(),
    connectionId: z.string(),
    title: z.string(),
    status: workStatusSchema,
    auditStatus: workAnalysisAuditStatusSchema,
    linkedTabId: z.string().nullable(),
    lastQueryAt: z.date().nullable(),
    reviewedAt: z.date().nullable(),
    acceptedAt: z.date().nullable(),
    rejectedAt: z.date().nullable(),
    auditStatusUpdatedAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export const workInvestigationFindingOutputSchema = z.object({
    id: z.string(),
    workId: z.string(),
    investigationId: z.string(),
    organizationId: z.string(),
    content: z.string(),
    sourceTabId: z.string().nullable(),
    sourceRunEventId: z.string().nullable(),
    createdBy: workFindingCreatorSchema,
    orderIndex: z.number(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export const workInvestigationDetailOutputSchema = workInvestigationOutputSchema.extend({
    findings: z.array(workInvestigationFindingOutputSchema),
    sqlAssetCount: z.number(),
});

export const workRunOutputSchema = z.object({
    id: z.string(),
    workId: z.string(),
    organizationId: z.string(),
    connectionId: z.string(),
    status: workRunStatusSchema,
    previousWorkStatus: workStatusSchema,
    createdByUserId: z.string(),
    startedAt: z.date(),
    completedAt: z.date().nullable(),
    error: z.string().nullable(),
});

export const workRunEventOutputSchema = z.object({
    id: z.string(),
    runId: z.string(),
    workId: z.string(),
    organizationId: z.string(),
    type: workRunEventTypeSchema,
    role: workRunEventRoleSchema,
    content: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.date(),
});

export const workWorkspaceSnapshotOutputSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    workId: z.string(),
    investigationId: z.string(),
    workspaceId: z.string(),
    previousAgentStepId: z.string().nullable(),
    intent: z.literal('continue_analysis'),
    humanEdits: workWorkspaceSnapshotHumanEditsOutputSchema,
    createdByUserId: z.string(),
    createdAt: z.date(),
});

export const workTimelineEventOutputSchema = z.object({
    id: z.string(),
    kind: z.enum(['run_event', 'workspace_snapshot']),
    runEvent: workRunEventOutputSchema.nullable(),
    snapshot: workWorkspaceSnapshotOutputSchema.nullable(),
    createdAt: z.date(),
});
