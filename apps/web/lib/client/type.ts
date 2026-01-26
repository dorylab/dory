// ==== Row data (for frontend rendering) ====
export interface TabResult {
    tabId: string; // Source tab (lookup from session)
    rid: number; // Stable row id/key (first_row_index + page offset)
    rowData: any;
}

// ==== Read options ====
export interface GetResultRowsOptions {
    onChunk?: (rows: TabResult[]) => void; // Incremental row callback after decode
    pageFetchLimit?: number; // Pages per batch (currently single page, kept for future)
    signal?: AbortSignal; // External abort
    rowBudget?: number; // Max rows to emit
    emitChunkRows?: number; // Rows per onChunk batch (default 1000)
    yieldUi?: boolean; // Yield to event loop between chunks/pages
    log?: boolean; // Debug logging
}

// ==== useDB hook interface (new API) ====
export interface DBHook {
    dbReady: boolean;
    dataVersion: number;

    setUserId(id: string | null): Promise<void>;

    createQuerySession(p: {
        tabId: string;
        sqlText: string;
        database?: string | null;
        stopOnError?: boolean;
        source?: string | null;
        connectionId?: string | null; // ★ New: pass-through supported
        sessionId?: string; // Allow external sessionId (same as old queryId)
    }): Promise<string>;

    finishQuerySession(
        sessionId: string,
        p: {
            status: 'success' | 'error' | 'canceled';
            errorMessage?: string | null;
            durationMs?: number | null;
            resultSetCount?: number | null;
        },
    ): Promise<void>;

    // ★ New: align with backend query_result_set fields
    upsertResultSetMeta(
        sessionId: string,
        setIndex: number,
        meta: {
            sqlText?: string; // Required column; empty string fallback
            sqlOp?: string | null;

            title?: string | null;
            columns?: unknown; // Suggested shape: [{name,type,...}]
            rowCount?: number | null;
            affectedRows?: number | null;
            status?: 'success' | 'error';
            errorMessage?: string | null;
            errorCode?: string | null;
            errorSqlState?: string | null;
            errorMeta?: unknown | null;
            warnings?: unknown | null;

            startedAt?: Date | null;
            finishedAt?: Date | null;
            durationMs?: number | null;
        },
    ): Promise<void>;

    // Write rows in batches; split pages and compress into query_result_page
    // ★ Supports both any[] (raw rows) and {rowData:any}[]
    insertResultRows(sessionId: string, setIndex: number, rows: Array<any> | Array<{ rowData: any }>): Promise<void>;

    // Read rows: page fetch + worker decode, row callback/return
    getResultRows(sessionId: string, setIndex?: number, opts?: GetResultRowsOptions): Promise<TabResult[]>;

    // List existing result sets (ascending)
    listResultSetIndices(sessionId: string): Promise<number[]>;

    // Clear all or specific result set for a session (meta + page)
    clearResults(sessionId: string, setIndex?: number): Promise<void>;

    getSession: (sessionId: string) => Promise<{
        status: string;
        startedAt: Date;
        finishedAt: Date | null;
    } | null>;

    // ★ New: persist /api/sql response into three tables (recommended)
    applyServerResult(payload: {
        session: {
            sessionId: string;
            userId?: string | null;
            tabId?: string | null;
            connectionId?: string | null;
            database?: string | null;
            sqlText: string;
            status: 'running' | 'success' | 'error' | 'canceled';
            errorMessage?: string | null;
            startedAt?: string | Date | null;
            finishedAt?: string | Date | null;
            durationMs?: number | null;
            resultSetCount?: number;
            stopOnError?: boolean;
            source?: string | null;
        };
        queryResultSets: Array<{
            sessionId: string;
            setIndex: number;
            sqlText: string;
            sqlOp?: string | null;
            title?: string | null;
            columns?: unknown | null;
            rowCount?: number | null;
            affectedRows?: number | null;
            status: 'success' | 'error';
            errorMessage?: string | null;
            errorCode?: string | null;
            errorSqlState?: string | null;
            errorMeta?: unknown | null;
            warnings?: unknown | null;
            startedAt?: string | Date | null;
            finishedAt?: string | Date | null;
            durationMs?: number | null;
        }>;
        results: any[][];
    }): Promise<void>;
}

// =============== Row types for three tables (aligned with schema) ================

// query_session
export type SessionStatus = 'running' | 'success' | 'error' | 'canceled';
export interface QuerySessionRow {
    sessionId: string;
    userId: string;
    tabId: string;
    connectionId: string | null; // ★ New
    database: string | null;
    sqlText: string;
    status: SessionStatus;
    errorMessage: string | null;
    startedAt: Date; // drizzle timestamp => Date
    finishedAt: Date | null;
    durationMs: number | null;
    resultSetCount: number; // Default 0
    stopOnError: boolean;
    source: string | null;
}

// query_result_set
export type ResultSetStatus = 'success' | 'error';
export interface QueryResultSetRow {
    sessionId: string;
    setIndex: number;

    sqlText: string; // ★ New: raw SQL statement
    sqlOp: string | null; // ★ New: operation type

    title: string | null;
    columns: unknown; // Your column definition shape
    rowCount: number | null;
    affectedRows: number | null;

    status: ResultSetStatus;
    errorMessage: string | null;

    errorCode: string | null; // ★ New
    errorSqlState: string | null; // ★ New
    errorMeta: unknown | null; // ★ New
    warnings: unknown | null; // ★ New

    startedAt: Date | null;
    finishedAt: Date | null;
    durationMs: number | null;
}

// query_result_page (read)
export interface QueryResultPageRow {
    sessionId: string;
    setIndex: number;
    pageNo: number;
    firstRowIndex: number; // Global row index of first row in page
    rowCount: number; // Row count in page
    rowsData: Uint8Array; // Compressed binary
    isGzip: boolean;
    createdAt: Date;
}

// query_result_page (insert shape for useDB.safeInsertPages)
export type PageInsert = {
    session_id: string;
    set_index: number;
    page_no: number;
    first_row_index: number;
    row_count: number;
    rows_data: Uint8Array; // Key: use Uint8Array, not Node Buffer
    is_gzip: boolean;
};

// (Extend worker decode return type if needed)
export type DecodedPage = any[]; // "rows decoded from one page"

export type ResultSetMeta = {
    sessionId: string;
    setIndex: number; // 0-based
    sqlText: string;
    sqlOp: string | null;

    title: string | null;
    columns: unknown | null;
    rowCount: number | null;

    limited: boolean;
    limit: number | null;
    
    affectedRows: number | null;
    status: 'success' | 'error' | 'running'; // For UI, you may map running to session running
    errorMessage: string | null;
    errorCode: string | null;
    errorSqlState: string | null;
    errorMeta: unknown | null;
    warnings: unknown | null;

    startedAt?: number | null; // Return ms for direct frontend use
    finishedAt?: number | null; // Return ms
    durationMs: number | null;
};
