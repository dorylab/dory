export type QuerySource =
    | 'console'
    | 'chatbot'
    | 'api'
    | 'task'
    | 'user_sql_console'
    | 'user_table_preview'
    | 'dory_schema_metadata'
    | 'dory_monitoring'
    | 'ai_sql_runner'
    | 'ai_table_preview'
    | 'ai_schema_metadata'
    | 'ai_analysis'
    | 'automation_sql'
    | 'automation_ai_sql'
    | 'automation_schema_metadata'
    | 'mcp_sql_runner'
    | 'mcp_table_preview'
    | 'mcp_schema_metadata'
    | 'mcp_monitoring'
    | 'mcp_analysis';
export type QueryStatus = 'success' | 'error' | 'denied' | 'canceled';
export type AuditSourceGroup = 'user' | 'dory_system' | 'ai' | 'automation' | 'mcp';

const QUERY_SOURCE_GROUPS: Record<QuerySource, AuditSourceGroup> = {
    console: 'user',
    chatbot: 'ai',
    api: 'dory_system',
    task: 'automation',
    user_sql_console: 'user',
    user_table_preview: 'user',
    dory_schema_metadata: 'dory_system',
    dory_monitoring: 'dory_system',
    ai_sql_runner: 'ai',
    ai_table_preview: 'ai',
    ai_schema_metadata: 'ai',
    ai_analysis: 'ai',
    automation_sql: 'automation',
    automation_ai_sql: 'automation',
    automation_schema_metadata: 'automation',
    mcp_sql_runner: 'mcp',
    mcp_table_preview: 'mcp',
    mcp_schema_metadata: 'mcp',
    mcp_monitoring: 'mcp',
    mcp_analysis: 'mcp',
};

export function getAuditSourceGroup(source: QuerySource): AuditSourceGroup {
    return QUERY_SOURCE_GROUPS[source];
}

export type AuditSource = QuerySource;
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
    organizationId: string;
    user_id: string;
    source: QuerySource;
    status: QueryStatus;
    duration_ms?: number | null;
    error_message?: string | null;
    rows_read?: number | null;
    bytes_read?: number | null;
    rows_written?: number | null;
    connection_id?: string | null;
    connection_name?: string | null;
    identity_id?: string | null;
    identity_name?: string | null;
    identity_username?: string | null;
    identity_role?: string | null;
    identity_database?: string | null;
    database_name?: string | null;
    sql_text: string;
    extra_json?: Record<string, unknown> | null;
};

export type AuditSearchResponse = {
    items: AuditItem[];
    nextCursor?: string | null;
};

export type OverviewFilters = {
    organizationId: string;
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
    organizationId: string;
    tabId?: string | null;
    userId: string;

    source: QuerySource;

    connectionId?: string | null;
    connectionName?: string | null;
    identityId?: string | null;
    identityName?: string | null;
    identityUsername?: string | null;
    identityRole?: string | null;
    identityDatabase?: string | null;
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

    organizationId: string;
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
    log(payload: AuditPayload & { status: QueryStatus }): Promise<void>;
    logSuccess(payload: AuditPayload): Promise<void>;
    logError(payload: AuditPayload & { errorMessage: string }): Promise<void>;
    logDenied(payload: AuditPayload & { errorMessage: string }): Promise<void>;
    logCanceled(payload: AuditPayload & { errorMessage?: string | null }): Promise<void>;

    search(params: AuditSearchParams): Promise<AuditSearchResult>;
    overview(filters: OverviewFilters): Promise<OverviewResponse>;

    readById(organizationId: string, id: string): Promise<AuditItem | null>;
}
