import { QueryResult, SessionStatus } from './sql-console';

export type WorkspaceScope =
    | {
          type: 'connection';
      }
    | {
          type: 'work';
          workId: string;
      }
    | {
          type: 'work_investigation';
          workId: string;
          investigationId: string;
      };

export const DEFAULT_WORKSPACE_SCOPE: WorkspaceScope = { type: 'connection' };

export function normalizeWorkspaceScope(scope?: WorkspaceScope | null): WorkspaceScope {
    if (scope?.type === 'work' && scope.workId) {
        return {
            type: 'work',
            workId: scope.workId,
        };
    }

    if (scope?.type === 'work_investigation' && scope.workId && scope.investigationId) {
        return {
            type: 'work_investigation',
            workId: scope.workId,
            investigationId: scope.investigationId,
        };
    }

    return DEFAULT_WORKSPACE_SCOPE;
}

export function workspaceScopeKey(scope?: WorkspaceScope | null): string {
    const normalized = normalizeWorkspaceScope(scope);
    if (normalized.type === 'work') {
        return `work:${normalized.workId}`;
    }
    if (normalized.type === 'work_investigation') {
        return `work_investigation:${normalized.workId}:${normalized.investigationId}`;
    }

    return 'connection';
}

export type TabType = 'sql' | 'table';

export interface BaseTabPayload {
    tabId: string;

    userId: string;

    connectionId: string;

    workspaceScope?: WorkspaceScope;

    tabType: TabType;

    tabName?: string;

    orderIndex?: number;

    createdAt?: string;

    updatedAt?: string;

    workSyncState?: WorkTabSyncState;

    lastAgentRunId?: string | null;

    lastAgentEventId?: string | null;

    lastAgentSyncedAt?: string | null;

    lastHumanEditedAt?: string | null;
}
export interface SqlTabPayload extends BaseTabPayload {
    tabType: 'sql';

    content: string;

    status?: 'idle' | 'running' | 'error' | 'success';

    resultMeta?: TabResultMetaPayload;
}

export interface TableTabPayload extends BaseTabPayload {
    tabType: 'table';

    databaseName?: string;

    tableName?: string;

    activeSubTab?: 'overview' | 'data' | 'structure' | 'indexes' | 'stats' | 'overview';

    dataView?: {
        limit?: number;
        orderBy?: string;
        orderDirection?: 'asc' | 'desc';
        where?: string;
        page?: number;
    };
}


export type TabPayload = SqlTabPayload | TableTabPayload;

export type TabStatePayload = TabPayload;


export type TabResultMetaPayload = {
    rows?: number;
    columns?: number;
    durationMs?: number;
    sessionId?: string;
    workId?: string;
    investigationId?: string;
    workRunId?: string;
    workRunEventId?: string;
    sqlAssetGroupKey?: string;
    source?: 'work-run' | string;
};

export type WorkTabSyncState = 'agent_generated' | 'human_edited' | 'unsynced' | 'synced' | 'running' | 'failed';

export type WorkTabMetadata = {
    workSyncState?: WorkTabSyncState;
    lastAgentRunId?: string | null;
    lastAgentEventId?: string | null;
    lastAgentSyncedAt?: string | null;
    lastHumanEditedAt?: string | null;
};

export interface TabRuntimeInfo {
    sessionId?: string;

    activeSet?: number;

    result?: QueryResult;

    queryKey?: string;

    status?: 'idle' | SessionStatus;

    createdAt?: number | string;
    updatedAt?: number | string;
}

export type UITabPayload = TabPayload & TabRuntimeInfo;

export type SQLTab = UITabPayload;
