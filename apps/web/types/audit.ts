export type QuerySource = 'console' | 'chatbot' | 'api' | 'task';
export type QueryStatus = 'success' | 'error' | 'denied' | 'canceled';

export type AuditSource = 'console' | 'chatbot' | 'api' | 'task';
export type AuditStatus = 'success' | 'error' | 'denied' | 'canceled';

export type AuditSearchQuery = {
    from?: string; 
    to?: string;
    sources?: AuditSource[]; 
    statuses?: AuditStatus[]; 
    user_id?: string;
    datasource_id?: string;
    database_name?: string;
    chat_id?: string;
    q?: string;
    limit?: number;
    cursor?: string | null;
};

export type AuditItem = {
    id: string;
    created_at: string;
    teamId: string;
    user_id: string;
    source: QuerySource;
    status: QueryStatus;
    duration_ms?: number | null;
    rows_read?: number | null;
    bytes_read?: number | null;
    rows_written?: number | null;
    connection_id?: string | null;
    database_name?: string | null;
    sql_text: string;
    extra_json?: Record<string, unknown> | null;
};

export type AuditSearchResponse = {
    items: AuditItem[];
    nextCursor?: string | null;
};

export type OverviewFilters = {
    from: string; // ISO
    to: string; // ISO
    sources?: QuerySource[];
    statuses?: QueryStatus[];
    user_id?: string;
    connection_id?: string;
    database_name?: string;
};

export type OverviewResponse = {
    kpis: {
        total: number;
        success: number;
        error: number;
        successRate: number;
        p50DurationMs: number;
        p95DurationMs: number;
        avgRowsRead: number | null;
        avgBytesRead: number | null;
    };
    timeseries: Array<{ ts: string; total: number; success: number; error: number }>;
    bySource: Array<{ source: QuerySource; count: number }>;
    topUsers: Array<{ user_id: string; count: number; error: number }>;
    topConnection: Array<{ connection_id: string; count: number }>;
    topErrors: Array<{ message: string; count: number }>;
};

export type AuditSearchResult = { items: AuditItem[]; nextCursor?: string | null };

export interface AuditPayload {
    teamId: string;
    tabId: string;
    userId: string;

    source: QuerySource;

    connectionId?: string | null;
    connectionName?: string | null;
    databaseName?: string | null;

    queryId?: string | null;
    sqlText: string;

    status?: QueryStatus;
    errorMessage?: string | null;

    durationMs?: number | null;
    rowsRead?: number | null;
    bytesRead?: number | null;
    rowsWritten?: number | null;

    extraJson?: Record<string, unknown> | null;
}

export type AuditSearchParams = {
    from?: string;
    to?: string;

    sources?: QuerySource[];
    statuses?: QueryStatus[];

    teamId?: string;
    tabId?: string;
    userId?: string;

    connectionId?: string;
    databaseName?: string;

    chatId?: string;

    q?: string;
    limit?: number;
    cursor?: string | null;
};

export interface IAuditService {
    logSuccess(payload: AuditPayload): Promise<void>;
    logError(payload: AuditPayload & { errorMessage: string }): Promise<void>;

    search(params: AuditSearchParams): Promise<AuditSearchResult>;
    overview(filters: OverviewFilters): Promise<OverviewResponse>;

    readById(id: string): Promise<AuditItem | null>;
}
