import { randomUUID } from 'node:crypto';

import { splitMultiSQL } from '@dory/shared/utils/split-multi-sql';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { runWithSqlAudit } from '@/lib/server/sql-audit';
import type { ActionContext } from '@dory/actions';
import type { BaseConnection } from '@dory/drivers/core';
import type { ColumnMeta, DriverQueryRowStream } from '@dory/drivers/types';
import { newEntityId } from '@dory/shared/id';
import type { QuerySource } from '@dory/shared/types/audit';
import type { WebActionServices } from '../../types';

export const MAX_ACTION_STATEMENTS = 100;
const DEFAULT_RESULT_PREVIEW_ROWS = 200;

type PersistableResultSet = Record<string, unknown> & {
    sessionId: string;
    setIndex: number;
    sqlText: string;
    status: 'success' | 'error' | string;
};

export type QueryExecuteInput = {
    connectionId?: string | null;
    identityId?: string | null;
    database?: string | null;
    sql: string;
    stopOnError?: boolean | null;
    sessionId?: string | null;
    tabId?: string | null;
    source?: string | null;
    refId?: string | null;
};

export type QueryExecutePayload = {
    session: Record<string, unknown>;
    queryResultSets: Array<Record<string, unknown>>;
    results: unknown[][];
    meta: Record<string, unknown>;
};

export type QueryExecutionStreamEvent =
    | { type: 'session-started'; payload: QueryExecutePayload }
    | { type: 'result-started'; payload: QueryExecutePayload }
    | {
          type: 'result-progress';
          payload: {
              sessionId: string;
              setIndex: number;
              rowsWritten: number;
              previewRowCount: number;
              elapsedMs: number;
          };
      }
    | { type: 'result-completed'; payload: QueryExecutePayload }
    | { type: 'session-finished'; payload: QueryExecutePayload };

type QueryExecutionEventSink = (event: QueryExecutionStreamEvent) => Promise<void> | void;

function preciseDateNow(): Date {
    return new Date(performance.timeOrigin + performance.now());
}

export function parseSqlOp(s: string): string {
    const first = s.trim().split(/\s+/)[0]?.toUpperCase() || 'SQL';
    if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(first)) return first;
    if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(first)) return 'DDL';
    if (['BEGIN', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'].includes(first)) return 'TXN';
    return first;
}

function makeTitle(s: string): string {
    const op = parseSqlOp(s);
    const preview = s.trim().slice(0, 40).replace(/\s+/g, ' ');
    return `${op}: ${preview}`;
}

function errorField(error: unknown, field: string): unknown {
    return error && typeof error === 'object' && field in error ? (error as Record<string, unknown>)[field] : undefined;
}

function errorMessage(error: unknown) {
    const message = errorField(error, 'message');
    return String(typeof message === 'string' && message ? message : error);
}

function getAffectedRows(rows: unknown) {
    if (!Array.isArray(rows) && rows && typeof rows === 'object' && 'affectedRows' in rows) {
        const affectedRows = (rows as { affectedRows?: unknown }).affectedRows;
        return typeof affectedRows === 'number' ? affectedRows : null;
    }
    return null;
}

function isStreamableResultStatement(sql: string) {
    return /^\s*(select|with|from|show|describe|explain|pragma)\b/i.test(sql);
}

function supportsStreamingResultSets(connection: BaseConnection) {
    return (
        connection.config.type === 'clickhouse' ||
        connection.config.type === 'cloudflare-d1' ||
        connection.config.type === 'duckdb' ||
        connection.config.type === 'mariadb' ||
        connection.config.type === 'mysql' ||
        connection.config.type === 'neon' ||
        connection.config.type === 'oracle' ||
        connection.config.type === 'postgres' ||
        connection.config.type === 'sqlite' ||
        connection.config.type === 'snowflake' ||
        connection.config.type === 'supabase' ||
        connection.config.type === 'sqlserver'
    );
}

function toResultSetColumns(columns: ColumnMeta[] | undefined | null) {
    return (columns ?? []).map(column => ({
        name: column.name,
        databaseType: column.type,
        logicalType: 'unknown' as const,
    }));
}

function buildPayload(input: {
    sessionId: string;
    userId: string;
    tabId?: string | null;
    connectionId: string;
    database?: string | null;
    sqlText: string;
    status: 'running' | 'success' | 'error';
    errorMessage?: string | null;
    startedAt: number;
    finishedAt?: number | null;
    durationMs?: number | null;
    resultSetCount: number;
    stopOnError: boolean;
    source?: string | null;
    queryResultSets: Array<Record<string, unknown>>;
    results: unknown[][];
    refId: string;
}) {
    return {
        session: {
            sessionId: input.sessionId,
            userId: input.userId,
            tabId: input.tabId ?? null,
            connectionId: input.connectionId,
            database: input.database ?? null,
            sqlText: input.sqlText,
            status: input.status,
            errorMessage: input.errorMessage ?? null,
            startedAt: input.startedAt,
            finishedAt: input.finishedAt ?? null,
            durationMs: input.durationMs ?? null,
            resultSetCount: input.resultSetCount,
            stopOnError: input.stopOnError,
            source: input.source ?? null,
        },
        queryResultSets: input.queryResultSets,
        results: input.results,
        meta: {
            refId: input.refId,
            durationMs: input.durationMs ?? 0,
            totalSets: input.resultSetCount,
            stopOnError: input.stopOnError,
            resultStorage: 'artifact',
            previewRows: DEFAULT_RESULT_PREVIEW_ROWS,
        },
    };
}

function queryAuditSource(ctx: ActionContext<WebActionServices>, source?: string | null): QuerySource {
    if (isQuerySource(ctx.auditSource)) return ctx.auditSource;
    if (ctx.actor.type === 'mcp') return 'mcp_sql_runner';
    if (ctx.actor.type === 'automation') return source === 'ai' ? 'automation_ai_sql' : 'automation_sql';
    if (ctx.actor.type === 'agent') return 'ai_sql_runner';
    return 'user_sql_console';
}

function isQuerySource(value?: string | null): value is QuerySource {
    return (
        value === 'console' ||
        value === 'chatbot' ||
        value === 'api' ||
        value === 'task' ||
        value === 'user_sql_console' ||
        value === 'user_table_preview' ||
        value === 'dory_schema_metadata' ||
        value === 'dory_monitoring' ||
        value === 'ai_sql_runner' ||
        value === 'ai_table_preview' ||
        value === 'ai_schema_metadata' ||
        value === 'ai_analysis' ||
        value === 'automation_sql' ||
        value === 'automation_ai_sql' ||
        value === 'automation_schema_metadata' ||
        value === 'mcp_sql_runner' ||
        value === 'mcp_table_preview' ||
        value === 'mcp_schema_metadata' ||
        value === 'mcp_monitoring' ||
        value === 'mcp_analysis'
    );
}

async function executeOne(connection: BaseConnection, statement: string, context: { database?: string | null }, options?: { queryId?: string; statementIndex?: number }) {
    const startedAt = preciseDateNow();
    const perfStart = performance.now();

    try {
        const result = await connection.queryWithContext(statement, {
            database: context.database ?? undefined,
            queryId: options?.queryId,
            statementIndex: options?.statementIndex,
        });
        const rows = result.rows ?? [];
        const finishedAt = preciseDateNow();
        const durationMs = performance.now() - perfStart;
        const isArrayRows = Array.isArray(rows);
        const affectedRows = getAffectedRows(rows);
        const rowCount = result.rowCount ?? (isArrayRows ? rows.length : affectedRows != null ? 1 : 0);

        return {
            ok: true as const,
            resultRows: isArrayRows ? rows : affectedRows != null ? [{ ok: true, affectedRows }] : [],
            qrs: {
                sqlText: statement,
                sqlOp: parseSqlOp(statement),
                title: makeTitle(statement),
                columns: result.columns ?? null,
                rowCount,
                limited: result.limited ?? false,
                limit: result.limit ?? null,
                affectedRows,
                status: 'success' as const,
                errorMessage: null,
                errorCode: null,
                errorSqlState: null,
                errorMeta: null,
                warnings: null,
                startedAt,
                finishedAt,
                durationMs: Math.round(durationMs),
            },
        };
    } catch (err: unknown) {
        const finishedAt = preciseDateNow();
        const durationMs = performance.now() - perfStart;
        const message = errorMessage(err);
        return {
            ok: false as const,
            resultRows: [{ error: message, code: errorField(err, 'code'), sql: statement }],
            qrs: {
                sqlText: statement,
                sqlOp: parseSqlOp(statement),
                title: makeTitle(statement),
                columns: null,
                rowCount: 0,
                affectedRows: null,
                status: 'error' as const,
                errorMessage: message,
                errorCode: errorField(err, 'code') ?? null,
                errorSqlState: errorField(err, 'sqlState') ?? errorField(err, 'sqlstate') ?? null,
                errorMeta: err
                    ? {
                          errno: errorField(err, 'errno') ?? null,
                          name: errorField(err, 'name') ?? null,
                      }
                    : null,
                warnings: null,
                startedAt,
                finishedAt,
                durationMs: Math.round(durationMs),
            },
        };
    }
}

async function executeOneStream(connection: BaseConnection, statement: string, context: { database?: string | null }, options?: { queryId?: string; statementIndex?: number }) {
    const startedAt = preciseDateNow();
    const perfStart = performance.now();

    try {
        const result = await connection.queryRowsStreamWithContext(statement, {
            database: context.database ?? undefined,
            queryId: options?.queryId,
            statementIndex: options?.statementIndex,
        });
        const finishedAt = preciseDateNow();
        const durationMs = performance.now() - perfStart;

        return {
            ok: true as const,
            resultStream: result,
            qrs: {
                sqlText: statement,
                sqlOp: parseSqlOp(statement),
                title: makeTitle(statement),
                columns: result.columns ?? null,
                rowCount: result.rowCount ?? null,
                limited: false,
                limit: result.limit ?? null,
                affectedRows: null,
                status: 'success' as const,
                errorMessage: null,
                errorCode: null,
                errorSqlState: null,
                errorMeta: null,
                warnings: null,
                startedAt,
                finishedAt,
                durationMs: Math.round(durationMs),
            },
        };
    } catch (err: unknown) {
        const finishedAt = preciseDateNow();
        const durationMs = performance.now() - perfStart;
        const message = errorMessage(err);
        return {
            ok: false as const,
            resultRows: [{ error: message, code: errorField(err, 'code'), sql: statement }],
            qrs: {
                sqlText: statement,
                sqlOp: parseSqlOp(statement),
                title: makeTitle(statement),
                columns: null,
                rowCount: 0,
                affectedRows: null,
                status: 'error' as const,
                errorMessage: message,
                errorCode: errorField(err, 'code') ?? null,
                errorSqlState: errorField(err, 'sqlState') ?? errorField(err, 'sqlstate') ?? null,
                errorMeta: err
                    ? {
                          errno: errorField(err, 'errno') ?? null,
                          name: errorField(err, 'name') ?? null,
                      }
                    : null,
                warnings: null,
                startedAt,
                finishedAt,
                durationMs: Math.round(durationMs),
            },
        };
    }
}

export async function executeSqlAction(
    ctx: ActionContext<WebActionServices>,
    input: QueryExecuteInput,
) {
    return runSqlExecution(ctx, input);
}

export async function executeSqlActionStream(ctx: ActionContext<WebActionServices>, input: QueryExecuteInput, options: { signal?: AbortSignal; onEvent: QueryExecutionEventSink }) {
    return runSqlExecution(ctx, input, options);
}

async function runSqlExecution(
    ctx: ActionContext<WebActionServices>,
    input: QueryExecuteInput,
    options?: {
        signal?: AbortSignal;
        onEvent?: QueryExecutionEventSink;
    },
) {
    const connectionId = input.connectionId?.trim() || ctx.currentConnectionId?.trim();
    if (!connectionId) {
        throw new Error('Missing connectionId.');
    }

    const statements = splitMultiSQL(input.sql).filter(s => !!s.trim());
    const stopOnError = input.stopOnError ?? false;
    const sessionId = input.sessionId || randomUUID();
    const auditSource = queryAuditSource(ctx, input.source);
    const refId = input.refId || randomUUID();

    if (!statements.length) {
        const now = Math.round(performance.timeOrigin + performance.now());
        return {
            session: {
                sessionId,
                userId: ctx.userId,
                tabId: input.tabId ?? null,
                connectionId,
                database: input.database ?? null,
                sqlText: input.sql,
                status: 'success',
                errorMessage: null,
                startedAt: now,
                finishedAt: now,
                durationMs: 0,
                resultSetCount: 0,
                stopOnError,
                source: input.source ?? null,
            },
            queryResultSets: [],
            results: [],
            meta: {
                refId,
                durationMs: 0,
                totalSets: 0,
                stopOnError,
            },
        };
    }

    if (statements.length > MAX_ACTION_STATEMENTS) {
        throw new Error(`Too many statements (${statements.length}). Maximum is ${MAX_ACTION_STATEMENTS}.`);
    }

    const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
    return runWithSqlAudit(
        {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            source: auditSource,
            connectionId,
            identityId: input.identityId ?? null,
            databaseName: input.database ?? null,
            tabId: input.tabId ?? null,
            queryId: sessionId,
            extraJson: {
                actionId: 'query.execute',
                actorType: ctx.actor.type,
                actionRunId: ctx.actionRunId ?? null,
                requestId: ctx.requestId ?? null,
            },
        },
        async () => {
            const sessT0 = performance.now();
            const overallStartedAt = Math.round(performance.timeOrigin + sessT0);
            const queryResultSets: Array<Record<string, unknown>> = [];
            const results: unknown[][] = [];
            let hitError = false;
            let firstErrorMsg: string | null = null;
            await options?.onEvent?.({
                type: 'session-started',
                payload: buildPayload({
                    sessionId,
                    userId: ctx.userId,
                    tabId: input.tabId ?? null,
                    connectionId,
                    database: input.database ?? null,
                    sqlText: input.sql,
                    status: 'running',
                    startedAt: overallStartedAt,
                    resultSetCount: 0,
                    stopOnError,
                    source: input.source ?? null,
                    queryResultSets: [],
                    results: [],
                    refId,
                }),
            });

            for (let i = 0; i < statements.length; i += 1) {
                if (options?.signal?.aborted) {
                    throw Object.assign(new Error('Query canceled'), { name: 'AbortError', code: 'ABORT_ERR' });
                }

                const statement = statements[i]!;
                const useStreaming = supportsStreamingResultSets(entry.instance) && isStreamableResultStatement(statement);

                await options?.onEvent?.({
                    type: 'result-started',
                    payload: buildPayload({
                        sessionId,
                        userId: ctx.userId,
                        tabId: input.tabId ?? null,
                        connectionId,
                        database: input.database ?? null,
                        sqlText: input.sql,
                        status: 'running',
                        startedAt: overallStartedAt,
                        resultSetCount: queryResultSets.length,
                        stopOnError,
                        source: input.source ?? null,
                        queryResultSets: queryResultSets.slice(),
                        results: results.slice(),
                        refId,
                    }),
                });

                const execOne = useStreaming
                    ? await executeOneStream(entry.instance, statement, { database: input.database }, { queryId: sessionId, statementIndex: i })
                    : await executeOne(entry.instance, statement, { database: input.database }, { queryId: sessionId, statementIndex: i });
                let qrs: Record<string, unknown> = {
                    sessionId,
                    setIndex: i,
                    ...execOne.qrs,
                };

                const stream = (execOne as { resultStream?: DriverQueryRowStream }).resultStream;
                let rowsForPersist = stream?.rows;
                const streamResultSetId = stream ? `rs_${newEntityId()}` : null;
                const streamQueryRunId = stream ? `qr_${newEntityId()}` : null;
                if (stream && options?.onEvent) {
                    let observedRows = 0;
                    let lastProgressAt = 0;

                    rowsForPersist = (async function* () {
                        try {
                            for await (const row of stream.rows) {
                                if (options.signal?.aborted) {
                                    throw Object.assign(new Error('Query canceled'), { name: 'AbortError', code: 'ABORT_ERR' });
                                }
                                observedRows += 1;
                                const now = performance.now();
                                if (observedRows > 0 && now - lastProgressAt > 500) {
                                    lastProgressAt = now;
                                    await options.onEvent?.({
                                        type: 'result-progress',
                                        payload: {
                                            sessionId,
                                            setIndex: i,
                                            rowsWritten: observedRows,
                                            previewRowCount: 0,
                                            elapsedMs: Math.max(0, Math.round(now - sessT0)),
                                        },
                                    });
                                }
                                yield row;
                            }
                        } finally {
                            await stream.close?.();
                        }
                    })();
                }
                const persisted = stream
                    ? await ctx.services.db.resultSets.persistQueryResultSetStream({
                          organizationId: ctx.organizationId,
                          userId: ctx.userId,
                          connectionId,
                          tabId: input.tabId ?? null,
                          sessionId,
                          database: input.database ?? null,
                          sessionSqlText: input.sql,
                          source: input.source ?? null,
                          resultSet: qrs as PersistableResultSet,
                          rows: rowsForPersist ?? stream.rows,
                          columns: toResultSetColumns(stream.columns),
                          rowCount: stream.rowCount ?? null,
                          resultSetId: streamResultSetId,
                          queryRunId: streamQueryRunId,
                          previewRows: DEFAULT_RESULT_PREVIEW_ROWS,
                      })
                    : await ctx.services.db.resultSets.persistQueryResultSet({
                          organizationId: ctx.organizationId,
                          userId: ctx.userId,
                          connectionId,
                          tabId: input.tabId ?? null,
                          sessionId,
                          database: input.database ?? null,
                          sessionSqlText: input.sql,
                          source: input.source ?? null,
                          resultSet: qrs as PersistableResultSet,
                          rows: (execOne as { resultRows: unknown[] }).resultRows,
                          previewRows: DEFAULT_RESULT_PREVIEW_ROWS,
                      });

                qrs = {
                    ...qrs,
                    resultSetId: persisted.resultSetId,
                    dataAvailability: persisted.dataAvailability,
                    previewRowCount: persisted.previewRowCount,
                    rowCount: persisted.rowCount,
                    columns: persisted.schema,
                };
                if (stream) {
                    const finishedAt = preciseDateNow();
                    const startedAt = qrs.startedAt instanceof Date ? qrs.startedAt : null;
                    qrs = {
                        ...qrs,
                        finishedAt,
                        durationMs: startedAt ? Math.max(0, Math.round(finishedAt.getTime() - startedAt.getTime())) : qrs.durationMs,
                        limited: typeof stream.limit === 'number' ? persisted.rowCount >= stream.limit : qrs.limited,
                    };
                }
                results.push(persisted.previewRows);

                queryResultSets.push(qrs);

                await options?.onEvent?.({
                    type: 'result-completed',
                    payload: buildPayload({
                        sessionId,
                        userId: ctx.userId,
                        tabId: input.tabId ?? null,
                        connectionId,
                        database: input.database ?? null,
                        sqlText: input.sql,
                        status: 'running',
                        startedAt: overallStartedAt,
                        resultSetCount: queryResultSets.length,
                        stopOnError,
                        source: input.source ?? null,
                        queryResultSets: queryResultSets.slice(),
                        results: results.slice(),
                        refId,
                    }),
                });

                if (!execOne.ok) {
                    hitError = true;
                    if (!firstErrorMsg) firstErrorMsg = typeof qrs.errorMessage === 'string' ? qrs.errorMessage : null;
                    if (stopOnError) break;
                }
            }

            const sessT1 = performance.now();
            const overallDuration = Math.max(0, Math.round(sessT1 - sessT0));
            const overallFinishedAt = Math.max(overallStartedAt, Math.round(performance.timeOrigin + sessT1));
            const status: 'success' | 'error' = hitError ? 'error' : 'success';

            const payload = buildPayload({
                sessionId,
                userId: ctx.userId,
                tabId: input.tabId ?? null,
                connectionId,
                database: input.database ?? null,
                sqlText: input.sql,
                status,
                errorMessage: hitError ? firstErrorMsg : null,
                startedAt: overallStartedAt,
                finishedAt: overallFinishedAt,
                durationMs: overallDuration,
                resultSetCount: queryResultSets.length,
                stopOnError,
                source: input.source ?? null,
                queryResultSets,
                results,
                refId,
            });
            await options?.onEvent?.({ type: 'session-finished', payload });
            return payload;
        },
    );
}
