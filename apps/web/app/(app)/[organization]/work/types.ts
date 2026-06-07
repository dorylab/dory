export type WorkStatus = 'draft' | 'running' | 'completed';
export type WorkCreator = 'user' | 'agent';

export type Work = {
    id: string;
    organizationId: string;
    title: string;
    status: WorkStatus;
    goal: string;
    conclusion: string | null;
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
    linkedTabId: string | null;
    lastQueryAt: string | null;
    findings: WorkInvestigationFinding[];
    sqlAssetCount: number;
    createdAt: string;
    updatedAt: string;
};

export type WorkInvestigationFinding = {
    id: string;
    workId: string;
    investigationId: string;
    organizationId: string;
    content: string;
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

export type WorkDetail = {
    work: Work;
    investigations: WorkInvestigation[];
    latestRun: WorkRun | null;
    latestRunEvents: WorkRunEvent[];
};
