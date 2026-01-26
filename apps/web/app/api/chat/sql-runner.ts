import { tool } from 'ai';
import { z } from 'zod';
import { ensureConnectionPoolForUser } from '../connection/utils';
import { getDBService } from '@/lib/database';
import { Locale } from '@/lib/i18n/routing';
import { translateApi } from '@/app/api/utils/i18n';

type CreateSqlRunnerOptions = {
    userId: string;
    teamId: string;
    chatId: string;
    messageId?: string;
    datasourceId: string;
    defaultDatabase?: string | null;
    locale?: Locale;
};

const ROW_LIMIT = parsePositiveInt(process.env.CHATBOT_SQL_ROW_LIMIT, 200);


export function createSqlRunnerTool({
    userId,
    teamId,
    datasourceId,
    messageId,
    chatId,
    defaultDatabase,
    locale,
}: CreateSqlRunnerOptions) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const description = t('Api.Chat.SqlRunner.Description');
    return tool({
        description,
        inputSchema: z.object({
            sql: z.string().min(1, t('Api.Chat.SqlRunner.SqlRequired')),
            database: z.string().optional(),
        }),
        execute: async ({ sql, database }) => {
            const requestedDatabase = sanitizeDatabase(database);

            if (!userId || !datasourceId) {
                return buildErrorResult(sql, requestedDatabase, t('Api.Chat.SqlRunner.MissingConnection'));
            }

            const trimmed = sql.trim();
            if (!trimmed) {
                return buildErrorResult(sql, requestedDatabase, t('Api.Chat.SqlRunner.SqlRequired'));
            }

            
            if (!/^(select|show|describe|desc|explain)\b/i.test(trimmed)) {
                return buildErrorResult(trimmed, requestedDatabase, t('Api.Chat.SqlRunner.ReadOnlyOnly'));
            }

            const baseAudit = {
                teamId,
                user_id: userId,
                source: 'chatbot' as const,
                datasource_id: datasourceId,
                sql_text: sql,
                database_name: requestedDatabase,
                extra_json: {
                    chat_id: chatId,
                    message_id: messageId,
                },
            };
            const db = await getDBService();
            if (!db?.audit) {
                console.warn('[chat] Audit repository not available, skipping audit logging.');
            }

            try {
                
                const { entry, config } = await ensureConnectionPoolForUser(userId, teamId, datasourceId, null);
                const instance = entry.instance;

                const targetDatabase = requestedDatabase ?? sanitizeDatabase(defaultDatabase) ?? sanitizeDatabase(config.database);

                const started = Date.now();
                const result = await instance.queryWithContext(trimmed, {
                    database: targetDatabase ?? undefined,
                });
                const durationMs = Date.now() - started;

                const rows = Array.isArray(result.rows) ? result.rows : [];
                const previewRows = rows.slice(0, ROW_LIMIT).map(row => serializeRow(row));
                const truncated = rows.length > ROW_LIMIT;
                const columns =
                    result.columns && result.columns.length > 0
                        ? result.columns.map(col => ({
                              name: col.name,
                              type: col.type ?? null,
                          }))
                        : inferColumnsFromRows(previewRows);

                if (db?.audit) {
                    await db.audit.logSuccess({
                        ...baseAudit,
                        durationMs: durationMs,
                        rowsRead: result.statistics?.rows_read ?? null,
                        bytesRead: result.statistics?.bytes_read ?? null,
                        tabId: 'chatbot',
                        userId,
                        sqlText: sql,
                    });
                }

                const base: SqlResultBase = {
                    type: 'sql-result',
                    sql: trimmed,
                    database: targetDatabase ?? null,
                    timestamp: new Date().toISOString(),
                };

                const success: SqlResultOk = {
                    ...base,
                    ok: true,
                    rowCount: result.rowCount ?? rows.length,
                    sampleRowCount: previewRows.length,
                    hasMore: truncated,
                    previewRows,
                    columns,
                    durationMs,
                };

                return success;
            } catch (error: any) {
                console.error('[chat] sqlRunner failed', error);

                const rawMessage = String(error?.message ?? error ?? t('Api.Chat.SqlRunner.ExecuteFailed'));
                const code = extractErrorCode(rawMessage);
                const targetDatabase = requestedDatabase ?? sanitizeDatabase(defaultDatabase);

                
                if (db?.audit) {
                    await db.audit.logError({
                        ...baseAudit,
                        errorMessage: rawMessage,
                        tabId: 'chatbot',
                        userId,
                        sqlText: sql
                    });
                }

                return buildErrorResult(trimmed, targetDatabase, rawMessage, code);
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
};

export type SqlResultError = SqlResultBase & {
    ok: false;
    error: {
        message: string;
        code?: number | null;
        raw?: string;
    };
};

export type SqlResult = SqlResultOk | SqlResultError;

function buildErrorResult(sql: string, database: string | null, message: string, code?: number | null): SqlResultError {
    return {
        type: 'sql-result',
        sql,
        database,
        ok: false,
        error: {
            message,
            code,
            raw: message,
        },
        timestamp: new Date().toISOString(),
    };
}

function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
    }
    return fallback;
}

function sanitizeDatabase(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

function extractErrorCode(message: string): number | null {
    const match = message.match(/Code:\s*(\d+)/i);
    if (!match) return null;
    const num = Number(match[1]);
    return Number.isFinite(num) ? num : null;
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

function inferColumnsFromRows(rows: Array<Record<string, unknown>>) {
    if (!rows.length) return [];
    const keys = new Set<string>();
    rows.forEach(row => {
        Object.keys(row).forEach(key => keys.add(key));
    });
    return Array.from(keys).map(key => ({ name: key, type: null as string | null }));
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
