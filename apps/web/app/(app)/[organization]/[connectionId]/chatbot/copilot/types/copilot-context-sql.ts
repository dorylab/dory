import type { ResultColumnMeta, ResultSetStatsV1 } from '@/lib/client/type';

export type CopilotResultSetContext = {
    sessionId?: string | null;
    setIndex?: number | null;
    title?: string | null;
    sqlText?: string | null;
    status?: 'success' | 'error' | 'running' | null;
    errorMessage?: string | null;
    errorCode?: string | number | null;
    errorSqlState?: string | null;
    rowCount?: number | null;
    limited?: boolean | null;
    limit?: number | null;
    durationMs?: number | null;
    columns?: ResultColumnMeta[] | null;
    stats?: ResultSetStatsV1 | null;
    aiProfileVersion?: number | null;
};

export type CopilotContextSQL = {
    baseline: {
        database?: string | null;
        dialect?: 'clickhouse' | 'duckdb' | 'mysql' | 'postgres' | 'sqlite' | 'sqlserver' | 'unknown';
    };

    draft: {
        editorText: string;
        selection?: { start: number; end: number } | null;

        inferred: {
            tables: Array<{
                database?: string | null;
                schema?: string | null;
                name: string;
                raw?: string;
            }>;
            database?: string | null;
            schema?: string | null;
            confidence: 'high' | 'mid' | 'low';
        };
    };

    resultSet?: CopilotResultSetContext | null;
};
