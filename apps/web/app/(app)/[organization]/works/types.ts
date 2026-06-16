export type WorkStatus = 'draft' | 'running' | 'completed';
export type WorkCreator = 'user' | 'agent';
export type WorkType = 'investigation' | 'analysis' | 'monitoring' | 'data_qa' | 'sql_workspace';
export type WorkAnalysisAuditStatus = 'draft' | 'needs_review' | 'reviewed' | 'revised' | 'accepted' | 'rejected';
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

export type Work = {
    id: string;
    organizationId: string;
    title: string;
    status: WorkStatus;
    goal: string;
    workType: WorkType;
    scope: WorkScope | null;
    initialContext: string | null;
    conclusion: string | null;
    conclusionMetadata: WorkConclusionMetadata | null;
    conclusionStatus: WorkConclusionStatus;
    conclusionUpdatedAt: string | null;
    connectionId: string;
    createdBy: WorkCreator;
    createdByUserId: string;
    createdAt: string;
    updatedAt: string;
};

export type WorkInvestigation = {
    id: string;
    workId: string;
    organizationId: string;
    connectionId: string;
    title: string;
    status: WorkStatus;
    auditStatus: WorkAnalysisAuditStatus;
    currentRevisionId: string | null;
    linkedTabId: string | null;
    lastQueryAt: string | null;
    reviewedAt: string | null;
    acceptedAt: string | null;
    rejectedAt: string | null;
    auditStatusUpdatedAt: string | null;
    findings: WorkInvestigationFinding[];
    sqlAssetCount: number;
    currentRevision: WorkInvestigationRevision | null;
    createdAt: string;
    updatedAt: string;
};

export type WorkInvestigationRevisionFindingSnapshot = {
    id: string;
    content: string;
    whyItMatters?: string | null;
    sourceTabId: string | null;
    sourceRunEventId: string | null;
    createdBy: 'user' | 'agent' | 'automation';
    orderIndex: number;
    createdAt: string;
    updatedAt: string;
};

export type WorkInvestigationRevisionAssetSummary = {
    sqlAssetCount: number;
    linkedTabId: string | null;
    lastQueryAt: string | null;
};

export type WorkInvestigationRevision = {
    id: string;
    organizationId: string;
    workId: string;
    investigationId: string;
    version: number;
    instruction: string | null;
    title: string;
    findingsSnapshot: WorkInvestigationRevisionFindingSnapshot[];
    assetSummary: WorkInvestigationRevisionAssetSummary;
    runId: string | null;
    createdBy: 'user' | 'agent' | 'automation';
    createdAt: string;
};

export type WorkInvestigationFinding = {
    id: string;
    workId: string;
    investigationId: string;
    organizationId: string;
    content: string;
    whyItMatters: string | null;
    sourceTabId: string | null;
    sourceRunEventId: string | null;
    createdBy: 'user' | 'agent' | 'automation';
    orderIndex: number;
    createdAt: string;
    updatedAt: string;
};

export type WorkRunStatus = 'running' | 'completed' | 'failed';
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

export type WorkRun = {
    id: string;
    workId: string;
    organizationId: string;
    connectionId: string;
    status: WorkRunStatus;
    previousWorkStatus: WorkStatus;
    createdByUserId: string;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
};

export type WorkRunEvent = {
    id: string;
    runId: string;
    workId: string;
    organizationId: string;
    type: WorkRunEventType;
    role: WorkRunEventRole;
    content: string | null;
    payload: Record<string, unknown> | null;
    createdAt: string;
};

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

export type WorkWorkspaceSnapshot = {
    id: string;
    organizationId: string;
    workId: string;
    investigationId: string;
    workspaceId: string;
    previousAgentStepId: string | null;
    intent: 'continue_analysis';
    humanEdits: WorkWorkspaceSnapshotHumanEdits;
    createdByUserId: string;
    createdAt: string;
};

export type WorkTimelineEvent = {
    id: string;
    kind: 'run_event' | 'workspace_snapshot';
    runEvent: WorkRunEvent | null;
    snapshot: WorkWorkspaceSnapshot | null;
    createdAt: string;
};

export type WorkRunTimeline = {
    run: WorkRun;
    events: WorkRunEvent[];
    timelineEvents: WorkTimelineEvent[];
};

export type WorkDetail = {
    work: Work;
    investigations: WorkInvestigation[];
    runs: WorkRun[];
    latestRun: WorkRun | null;
    latestRunEvents: WorkRunEvent[];
    runTimelines: WorkRunTimeline[];
    timelineEvents: WorkTimelineEvent[];
    unlinkedTimelineEvents: WorkTimelineEvent[];
};
