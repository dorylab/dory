import { Locale } from '@dory/i18n/routing';
import { tool } from 'ai';
import { z } from 'zod';

import { translateApi } from '@/app/api/utils/i18n';

type RecordedSqlResult = {
    result: Array<Record<string, unknown>>;
    columns: Array<{ name: string; type?: string | null }>;
    rowCount: number;
    truncated: boolean;
    executionTimeMs: number;
    sessionId: string;
    artifacts: Array<{ artifactId: string }>;
    work: { workId: string };
    workspaceUrl: string;
};

type CreateSqlRunnerOptions = {
    defaultDatabase?: string | null;
    locale?: Locale;
    executeSql: (input: { sql: string; database?: string | null; maxRows: number }, toolCallId: string) => Promise<RecordedSqlResult>;
};

const MAX_SQL_RESULT_ROWS = 100;

export function createSqlRunnerTool({ defaultDatabase, locale, executeSql }: CreateSqlRunnerOptions) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    return tool({
        description: t('Api.Chat.SqlRunner.Description'),
        inputSchema: z.object({ sql: z.string().min(1), database: z.string().optional() }),
        execute: async ({ sql, database }, { toolCallId }) => {
            const targetDatabase = sanitizeDatabase(database) ?? sanitizeDatabase(defaultDatabase);
            const performanceError = await validateSqlPerformance({ sql, database: targetDatabase, t });
            if (performanceError) return performanceError;
            try {
                const result = await executeSql({ sql, database: targetDatabase, maxRows: MAX_SQL_RESULT_ROWS }, toolCallId);
                return {
                    type: 'sql-result' as const,
                    ok: true as const,
                    sql,
                    database: targetDatabase,
                    timestamp: new Date().toISOString(),
                    rowCount: result.rowCount,
                    sampleRowCount: result.result.length,
                    hasMore: result.truncated,
                    previewRows: result.result.map(serializeRow),
                    columns: result.columns.map(column => ({ name: column.name, type: column.type ?? null })),
                    durationMs: result.executionTimeMs,
                    workId: result.work.workId,
                    sessionId: result.sessionId,
                    artifactIds: result.artifacts.map(artifact => artifact.artifactId),
                    workspaceUrl: result.workspaceUrl,
                } satisfies SqlResultOk;
            } catch (error) {
                const message = error instanceof Error ? error.message : t('Api.Chat.SqlRunner.ExecuteFailed');
                const readOnlyDenied = /only read.only SQL|read.only.*(reject|allow)|not read.only/i.test(message);
                return buildErrorResult(sql, targetDatabase, message, undefined, readOnlyDenied ? { required: true, reason: 'non-readonly-query' } : undefined);
            }
        },
    });
}

type SqlResultBase = {
    type: 'sql-result';
    sql: string;
    database: string | null;
    timestamp: string;
};

export type SqlResultOk = SqlResultBase & {
    ok: true;
    rowCount: number;
    sampleRowCount: number;
    hasMore: boolean;
    previewRows: Array<Record<string, unknown>>;
    columns: Array<{ name: string; type: string | null }>;
    durationMs: number;
    workId: string;
    sessionId: string;
    artifactIds: string[];
    workspaceUrl: string;
};

export type SqlResultError = SqlResultBase & {
    ok: false;
    manualExecution?: {
        required: boolean;
        reason: 'non-readonly-query';
    };
    error: {
        message: string;
        code?: number | null;
        raw?: string;
    };
};

export type SqlResult = SqlResultOk | SqlResultError;

function buildErrorResult(sql: string, database: string | null, message: string, code?: number | null, manualExecution?: SqlResultError['manualExecution']): SqlResultError {
    return {
        type: 'sql-result',
        sql,
        database,
        ok: false,
        manualExecution,
        error: {
            message,
            code,
            raw: message,
        },
        timestamp: new Date().toISOString(),
    };
}

export function isManualExecutionRequiredSqlResult(value: unknown): value is SqlResultError {
    if (!value || typeof value !== 'object') return false;
    if ((value as SqlResultError).type !== 'sql-result') return false;
    if ((value as SqlResultError).ok !== false) return false;
    return (value as SqlResultError).manualExecution?.required === true;
}

function sanitizeDatabase(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

export function enforceSqlResultRowLimit(sql: string, maxRows = MAX_SQL_RESULT_ROWS): string {
    const limit = Math.max(1, Math.floor(maxRows));

    let nextSql = sql
        .replace(/\blimit\s+(\d+)\s*,\s*(\d+)/gi, (match, offset, count) => {
            const countValue = Number(count);
            if (!Number.isFinite(countValue) || countValue <= limit) return match;
            return `LIMIT ${offset}, ${limit}`;
        })
        .replace(/\blimit\s+(\d+)/gi, (match, count) => {
            const countValue = Number(count);
            if (!Number.isFinite(countValue) || countValue <= limit) return match;
            return `LIMIT ${limit}`;
        })
        .replace(/\b(fetch\s+(?:first|next)\s+)(\d+)(\s+rows?\s+only\b)/gi, (match, prefix, count, suffix) => {
            const countValue = Number(count);
            if (!Number.isFinite(countValue) || countValue <= limit) return match;
            return `${prefix}${limit}${suffix}`;
        })
        .replace(/\b(top\s*\(?\s*)(\d+)(\s*\)?)/i, (match, prefix, count, suffix) => {
            const countValue = Number(count);
            if (!Number.isFinite(countValue) || countValue <= limit) return match;
            return `${prefix}${limit}${suffix}`;
        });

    if (nextSql.endsWith(';')) {
        nextSql = `${nextSql.slice(0, -1).trimEnd()};`;
    }

    return nextSql;
}

async function validateSqlPerformance(params: {
    sql: string;
    database: string | null;
    t: (key: string, values?: Record<string, unknown>) => string;
}): Promise<SqlResultError | null> {
    const { sql, database, t } = params;

    if (containsSelectWildcard(sql)) {
        return buildErrorResult(sql, database, t('Api.Chat.SqlRunner.SelectAllNotAllowed'));
    }

    return null;
}

function containsSelectWildcard(sql: string): boolean {
    const match = sql.match(/^\s*select\s+([\s\S]+?)\s+from\b/i);
    if (!match) return false;

    const selectList = match[1];
    return /(^|,)\s*(?:[a-zA-Z_][\w$]*\s*\.\s*)?\*(\s*(,|$))/i.test(selectList);
}

function serializeRow(row: unknown): Record<string, unknown> {
    if (!row || typeof row !== 'object') {
        return { value: stringify(row) };
    }

    if (Array.isArray(row)) {
        const result: Record<string, unknown> = {};
        row.forEach((value, index) => {
            result[`col_${index}`] = stringify(value);
        });
        return result;
    }

    const obj = row as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        result[key] = stringify(value);
    }
    return result;
}

function stringify(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}
