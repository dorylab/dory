import { QueryResult, SessionStatus } from './sql-console';


export type TabType = 'sql' | 'table';

export interface BaseTabPayload {
    tabId: string;

    userId: string;

    connectionId: string;

    tabType: TabType;

    tabName?: string;

    orderIndex?: number;

    createdAt?: string;

    updatedAt?: string;
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
