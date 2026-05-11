export type TimeRange = '1h' | '6h' | '24h' | '7d';
export type QueryType = 'all' | 'select' | 'insert' | 'ddl' | 'other';

export type QueryInsightsFilters = {
    user: string;
    database: string;
    queryType: QueryType;
    timeRange: TimeRange;
    search?: string;
    thresholdMode?: 'dynamic' | 'fixed';
    minDurationMs?: number;
};
export interface QueryInsightsSummary {
    totalQueries: number;
    slowQueries: number;
    errorQueries: number;
    activeUsers: number;
    p95DurationMs: number;
}

export type QueryTimelinePoint = {
    ts: number;
    p50Ms: number;
    p95Ms: number;
    qpm: number;
    errorCount: number;
    slowCount: number;
};


export interface QueryInsightsRow {
    queryId: string;
    eventTime: string;
    user: string;
    address: string;
    database: string | null;
    durationMs: number;
    readRows: number;
    readBytes: number;
    writtenBytes: number;
    memoryUsage: number;
    query: string;
    exception?: string | null;
}

export interface QueryInsightsResponse {
    summary: {
        totalQueries: number;
        slowQueries: number;
        errorQueries: number;
        activeUsers: number;
    };
    timeline: Array<{
        ts: string;
        p50Ms: number;
        p95Ms: number;
        qps: number;
    }>;
    query_logs: Array<QueryInsightsRow>;
}

export type PaginationState = {
    pageIndex: number;
    pageSize: number;
};

export type QueryListKey = 'logs' | 'slow' | 'errors';
export interface QueryTableProps {
    onRowClick?: (row: QueryInsightsRow) => void;
}