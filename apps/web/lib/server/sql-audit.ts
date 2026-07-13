import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextRequest } from 'next/server';

import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { getDBService } from '@dory/database';
import type { BaseConnection, DriverPoolEntry, DriverQueryParams } from '@dory/drivers/core';
import { pickConnectionIdentity } from '@dory/drivers/config';
import type { DriverQueryContext, DriverQueryResult, DriverQueryRowStream } from '@dory/drivers/types';
import type { AuditPayload, QuerySource, QueryStatus } from '@dory/shared/types/audit';
import type { ConnectionListItem } from '@dory/shared/types/connections';

type SqlAuditContext = {
    organizationId: string;
    userId: string;
    source: QuerySource;
    connectionId?: string | null;
    connectionName?: string | null;
    identityId?: string | null;
    databaseName?: string | null;
    tabId?: string | null;
    queryId?: string | null;
    extraJson?: Record<string, unknown> | null;
    connectionSnapshot?: SqlAuditConnectionSnapshot | null;
};

type SqlAuditStore = SqlAuditContext & {
    inDriverCall?: boolean;
};

type SqlAuditMethod = 'query' | 'queryWithContext' | 'queryRowsStreamWithContext' | 'command';
type AuditResultStats = {
    rows?: unknown[];
    rowCount?: number | null;
    statistics?: Record<string, unknown>;
};

const sqlAuditStore = new AsyncLocalStorage<SqlAuditStore>();
const SQL_AUDIT_PATCHED = Symbol.for('dory.sqlAudit.patched');
const SQL_AUDIT_CONNECTION_SNAPSHOT = Symbol.for('dory.sqlAudit.connectionSnapshot');
let auditWriteOverrideForTests: ((payload: AuditPayload & { status: QueryStatus }) => Promise<void> | void) | null = null;

export type RunSqlAuditContext = SqlAuditContext;

export type SqlAuditConnectionSnapshot = {
    connectionId: string;
    connectionName: string | null;
    identityId: string | null;
    identityName: string | null;
    identityUsername: string | null;
    identityRole: string | null;
    identityDatabase: string | null;
    identityUpdatedAt: string | null;
    identityFingerprint: string;
};

type SqlAuditSnapshotIdentity = {
    id?: string | null;
    name?: string | null;
    username?: string | null;
    role?: string | null;
    database?: string | null;
    updatedAt?: Date | string | null;
};

export function runWithSqlAudit<T>(context: SqlAuditContext | null | undefined, operation: () => Promise<T> | T): Promise<T> {
    if (!context?.organizationId || !context.userId || !context.source) {
        return Promise.resolve(operation());
    }

    return sqlAuditStore.run({ ...context, inDriverCall: false }, async () => operation());
}

export function getCurrentSqlAuditContext(): SqlAuditContext | null {
    const store = sqlAuditStore.getStore();
    if (!store) return null;
    return {
        organizationId: store.organizationId,
        userId: store.userId,
        source: store.source,
        connectionId: store.connectionId,
        connectionName: store.connectionName,
        identityId: store.identityId,
        databaseName: store.databaseName,
        tabId: store.tabId,
        queryId: store.queryId,
        extraJson: store.extraJson,
        connectionSnapshot: store.connectionSnapshot,
    };
}

export function setSqlAuditWriteOverrideForTests(handler: ((payload: AuditPayload & { status: QueryStatus }) => Promise<void> | void) | null) {
    auditWriteOverrideForTests = handler;
}

export function patchDriverPoolForSqlAudit<T extends DriverPoolEntry | undefined>(entry: T, snapshot?: SqlAuditConnectionSnapshot | null): T {
    if (!entry?.instance) return entry;
    if (snapshot) {
        attachSqlAuditConnectionSnapshot(entry, snapshot);
    }
    patchDriverInstanceForSqlAudit(entry.instance);
    return entry;
}

export function patchDriverInstanceForSqlAudit(instance: BaseConnection): BaseConnection {
    const record = instance as BaseConnection & { [SQL_AUDIT_PATCHED]?: boolean };
    if (record[SQL_AUDIT_PATCHED]) return instance;
    record[SQL_AUDIT_PATCHED] = true;

    patchDriverMethod(instance, 'query');
    patchDriverMethod(instance, 'queryWithContext');
    patchDriverMethod(instance, 'queryRowsStreamWithContext');
    patchDriverMethod(instance, 'command');

    return instance;
}

export function createSqlAuditConnectionSnapshot(record: ConnectionListItem, identity: SqlAuditSnapshotIdentity): SqlAuditConnectionSnapshot {
    const identityUpdatedAt = normalizeDate(identity.updatedAt);
    const identityId = identity.id ?? null;
    const identityName = identity.name ?? null;
    const identityUsername = identity.username ?? null;
    const identityRole = identity.role ?? null;
    const identityDatabase = identity.database ?? null;

    return {
        connectionId: record.connection.id,
        connectionName: record.connection.name ?? null,
        identityId,
        identityName,
        identityUsername,
        identityRole,
        identityDatabase,
        identityUpdatedAt,
        identityFingerprint: buildIdentityFingerprint({
            identityId,
            identityUsername,
            identityRole,
            identityDatabase,
            identityUpdatedAt,
        }),
    };
}

export function attachSqlAuditConnectionSnapshot(entry: DriverPoolEntry, snapshot: SqlAuditConnectionSnapshot): DriverPoolEntry {
    (entry as DriverPoolEntry & { [SQL_AUDIT_CONNECTION_SNAPSHOT]?: SqlAuditConnectionSnapshot })[SQL_AUDIT_CONNECTION_SNAPSHOT] = snapshot;
    (entry.instance as BaseConnection & { [SQL_AUDIT_CONNECTION_SNAPSHOT]?: SqlAuditConnectionSnapshot })[SQL_AUDIT_CONNECTION_SNAPSHOT] = snapshot;
    return entry;
}

export function getSqlAuditConnectionSnapshot(source?: DriverPoolEntry | BaseConnection | null): SqlAuditConnectionSnapshot | null {
    if (!source || typeof source !== 'object') return null;
    return ((source as { [SQL_AUDIT_CONNECTION_SNAPSHOT]?: SqlAuditConnectionSnapshot })[SQL_AUDIT_CONNECTION_SNAPSHOT] ?? null) as SqlAuditConnectionSnapshot | null;
}

export function isSqlAuditConnectionSnapshotCurrent(entry: DriverPoolEntry | undefined, snapshot: SqlAuditConnectionSnapshot): boolean {
    const existing = getSqlAuditConnectionSnapshot(entry);
    return Boolean(existing && existing.connectionId === snapshot.connectionId && existing.identityFingerprint === snapshot.identityFingerprint);
}

export async function logDeniedSqlAudit(
    context: SqlAuditContext,
    input: { sqlText: string; databaseName?: string | null; queryId?: string | null; errorMessage: string; extraJson?: Record<string, unknown> | null },
) {
    await insertSqlAudit({
        context,
        sqlText: input.sqlText,
        databaseName: input.databaseName,
        queryId: input.queryId,
        status: 'denied',
        errorMessage: input.errorMessage,
        durationMs: 0,
        extraJson: input.extraJson,
    });
}

export function inferRequestSqlAuditContext(req: NextRequest, input: { organizationId: string; userId: string }): SqlAuditContext | null {
    const source = inferRequestSqlAuditSource(req);
    if (!source) return null;

    return {
        organizationId: input.organizationId,
        userId: input.userId,
        source,
        connectionId: inferRequestConnectionId(req),
        extraJson: {
            path: req.nextUrl.pathname,
        },
    };
}

export function inferAutomationSqlAuditContext(req: NextRequest, input: { organizationId: string; userId: string }): SqlAuditContext | null {
    const path = req.nextUrl.pathname;
    let source: QuerySource | null = null;

    if (path.startsWith('/api/automation/query/execute')) {
        source = 'automation_sql';
    } else if (path.startsWith('/api/automation/ai/ask')) {
        source = 'automation_ai_sql';
    } else if (path.startsWith('/api/automation/schema')) {
        source = 'automation_schema_metadata';
    }

    if (!source) return null;

    return {
        organizationId: input.organizationId,
        userId: input.userId,
        source,
        connectionId: inferRequestConnectionId(req),
        extraJson: {
            path,
        },
    };
}

function patchDriverMethod(instance: BaseConnection, method: SqlAuditMethod) {
    const original = instance[method];
    if (typeof original !== 'function') return;

    Object.defineProperty(instance, method, {
        configurable: true,
        writable: true,
        value: async function auditedDriverMethod(this: BaseConnection, sql: string, ...args: unknown[]) {
            return executeAuditedDriverMethod(this, original as (...callArgs: unknown[]) => Promise<unknown>, method, sql, args);
        },
    });
}

async function executeAuditedDriverMethod(instance: BaseConnection, original: (...callArgs: unknown[]) => Promise<unknown>, method: SqlAuditMethod, sql: string, args: unknown[]) {
    const store = sqlAuditStore.getStore();
    if (!store || store.inDriverCall || typeof sql !== 'string') {
        return original.call(instance, sql, ...args);
    }

    const queryContext = extractQueryContext(method, args);
    const started = performance.now();

    if (method === 'queryRowsStreamWithContext') {
        try {
            const stream = (await sqlAuditStore.run({ ...store, inDriverCall: true }, async () => original.call(instance, sql, ...args))) as DriverQueryRowStream<unknown>;
            return wrapAuditedRowStream({
                stream,
                store,
                instance,
                sql,
                queryContext,
                started,
            });
        } catch (error) {
            const durationMs = Math.round(performance.now() - started);
            await insertSqlAudit({
                context: store,
                instance,
                sqlText: sql,
                databaseName: queryContext.database ?? store.databaseName ?? instance.config.database ?? null,
                queryId: queryContext.queryId ?? store.queryId ?? null,
                status: 'error',
                errorMessage: error instanceof Error ? error.message : String(error ?? 'SQL execution failed'),
                durationMs,
                extraJson: {
                    auditMethod: method,
                    ...(typeof queryContext.statementIndex === 'number' ? { statementIndex: queryContext.statementIndex } : {}),
                    ...(store.extraJson ?? {}),
                },
            });
            throw error;
        }
    }

    try {
        const result = await sqlAuditStore.run({ ...store, inDriverCall: true }, async () => original.call(instance, sql, ...args));
        const durationMs = Math.round(performance.now() - started);
        await insertSqlAudit({
            context: store,
            instance,
            sqlText: sql,
            databaseName: queryContext.database ?? store.databaseName ?? instance.config.database ?? null,
            queryId: queryContext.queryId ?? store.queryId ?? null,
            status: 'success',
            durationMs,
            result: method === 'command' ? null : (result as DriverQueryResult<unknown> | null),
            extraJson: {
                auditMethod: method,
                ...(typeof queryContext.statementIndex === 'number' ? { statementIndex: queryContext.statementIndex } : {}),
                ...(store.extraJson ?? {}),
            },
        });
        return result;
    } catch (error) {
        const durationMs = Math.round(performance.now() - started);
        await insertSqlAudit({
            context: store,
            instance,
            sqlText: sql,
            databaseName: queryContext.database ?? store.databaseName ?? instance.config.database ?? null,
            queryId: queryContext.queryId ?? store.queryId ?? null,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : String(error ?? 'SQL execution failed'),
            durationMs,
            extraJson: {
                auditMethod: method,
                ...(typeof queryContext.statementIndex === 'number' ? { statementIndex: queryContext.statementIndex } : {}),
                ...(store.extraJson ?? {}),
            },
        });
        throw error;
    }
}

function wrapAuditedRowStream(input: {
    stream: DriverQueryRowStream<unknown>;
    store: SqlAuditStore;
    instance: BaseConnection;
    sql: string;
    queryContext: DriverQueryContext;
    started: number;
}): DriverQueryRowStream<unknown> {
    const { stream, store, instance, sql, queryContext, started } = input;
    let observedRows = 0;
    let logged = false;

    const writeAudit = async (status: QueryStatus, errorMessage?: string | null) => {
        if (logged) return;
        logged = true;
        const durationMs = Math.round(performance.now() - started);
        await insertSqlAudit({
            context: store,
            instance,
            sqlText: sql,
            databaseName: queryContext.database ?? store.databaseName ?? instance.config.database ?? null,
            queryId: queryContext.queryId ?? store.queryId ?? null,
            status,
            errorMessage: errorMessage ?? null,
            durationMs,
            result: {
                rowCount: stream.rowCount ?? observedRows,
                statistics: stream.statistics,
            },
            extraJson: {
                auditMethod: 'queryRowsStreamWithContext',
                ...(typeof queryContext.statementIndex === 'number' ? { statementIndex: queryContext.statementIndex } : {}),
                ...(store.extraJson ?? {}),
            },
        });
    };

    async function* rows() {
        try {
            for await (const row of stream.rows) {
                observedRows += 1;
                yield row;
            }
            await writeAudit('success');
        } catch (error) {
            await writeAudit('error', error instanceof Error ? error.message : String(error ?? 'SQL stream failed'));
            throw error;
        } finally {
            await writeAudit('canceled', 'Query stream closed before completion');
        }
    }

    return {
        ...stream,
        rows: rows(),
        close: stream.close ? () => stream.close?.() : undefined,
    };
}

function extractQueryContext(method: SqlAuditMethod, args: unknown[]): DriverQueryContext {
    if (method === 'queryWithContext' || method === 'queryRowsStreamWithContext') {
        return isQueryContext(args[0]) ? args[0] : {};
    }
    return isQueryContext(args[1]) ? args[1] : {};
}

function isQueryContext(value: unknown): value is DriverQueryContext & { params?: DriverQueryParams } {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function insertSqlAudit(input: {
    context: SqlAuditContext;
    instance?: BaseConnection;
    sqlText: string;
    databaseName?: string | null;
    queryId?: string | null;
    status: QueryStatus;
    errorMessage?: string | null;
    durationMs?: number | null;
    result?: AuditResultStats | null;
    extraJson?: Record<string, unknown> | null;
}) {
    try {
        const stats = input.result?.statistics ?? {};
        const rowCount = resolveRowCount(input.result);
        const sqlOp = parseSqlOp(input.sqlText);
        const isWrite = isWriteOperation(sqlOp);
        const snapshot = await resolveSqlAuditConnectionSnapshot(input.context, input.instance);

        const payload: AuditPayload & { status: QueryStatus } = {
            organizationId: input.context.organizationId,
            tabId: input.context.tabId ?? null,
            userId: input.context.userId,
            source: input.context.source,
            connectionId: snapshot?.connectionId ?? input.context.connectionId ?? input.instance?.config?.id ?? null,
            connectionName: snapshot?.connectionName ?? input.context.connectionName ?? null,
            identityId: snapshot?.identityId ?? input.context.identityId ?? null,
            identityName: snapshot?.identityName ?? null,
            identityUsername: snapshot?.identityUsername ?? null,
            identityRole: snapshot?.identityRole ?? null,
            identityDatabase: snapshot?.identityDatabase ?? null,
            databaseName: input.databaseName ?? input.context.databaseName ?? input.instance?.config?.database ?? null,
            queryId: input.queryId ?? null,
            sqlText: input.sqlText,
            status: input.status,
            errorMessage: input.errorMessage ?? null,
            durationMs: input.durationMs ?? null,
            rowsRead: isWrite ? numberOrNull(stats.rows_read) : (numberOrNull(stats.rows_read) ?? rowCount),
            bytesRead: numberOrNull(stats.bytes_read),
            rowsWritten: isWrite ? (numberOrNull(stats.rows_written) ?? rowCount) : numberOrNull(stats.rows_written),
            extraJson: {
                ...(input.context.extraJson ?? {}),
                ...(input.extraJson ?? {}),
                driverType: input.instance?.config?.type ?? null,
                sqlOp,
            },
        };

        if (auditWriteOverrideForTests) {
            await auditWriteOverrideForTests(payload);
            return;
        }

        const db = await getDBService();
        await db.audit.log(payload);
    } catch (error) {
        console.error('[sql-audit] failed to write query audit record', error);
    }
}

async function resolveSqlAuditConnectionSnapshot(context: SqlAuditContext, instance?: BaseConnection): Promise<SqlAuditConnectionSnapshot | null> {
    const attached = getSqlAuditConnectionSnapshot(instance);
    if (attached) return attached;
    if (context.connectionSnapshot) return context.connectionSnapshot;

    if (!context.connectionId || auditWriteOverrideForTests) return null;

    try {
        const db = await getDBService();
        const record = await db.connections.getById(context.organizationId, context.connectionId);
        if (!record) return null;
        const identity = pickConnectionIdentity(record.identities, context.identityId ?? null);
        if (!identity) return null;
        return createSqlAuditConnectionSnapshot(record, identity);
    } catch (error) {
        console.warn('[sql-audit] failed to resolve connection identity snapshot', error);
        return null;
    }
}

function normalizeDate(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function buildIdentityFingerprint(input: {
    identityId?: string | null;
    identityUsername?: string | null;
    identityRole?: string | null;
    identityDatabase?: string | null;
    identityUpdatedAt?: string | null;
}) {
    return [input.identityId ?? '', input.identityUsername ?? '', input.identityRole ?? '', input.identityDatabase ?? '', input.identityUpdatedAt ?? ''].join('\u001f');
}

function inferRequestSqlAuditSource(req: NextRequest): QuerySource | null {
    const path = req.nextUrl.pathname;

    if (path === '/api/query') return 'user_sql_console';
    if (path.startsWith('/api/monitoring/')) return 'dory_monitoring';
    if (path.startsWith('/api/analysis/run')) return 'ai_analysis';
    if (path.startsWith('/api/chat')) return 'ai_schema_metadata';
    if (path.includes('/tables/') && path.endsWith('/preview')) return 'user_table_preview';
    if (path.startsWith('/api/connection/')) return 'dory_schema_metadata';

    return null;
}

function inferRequestConnectionId(req: NextRequest): string | null {
    const header = req.headers.get(X_CONNECTION_ID_KEY) ?? req.headers.get(X_CONNECTION_ID_KEY.toLowerCase());
    if (header?.trim()) return header.trim();

    const queryValue = req.nextUrl.searchParams.get('connectionId');
    if (queryValue?.trim()) return queryValue.trim();

    const parts = req.nextUrl.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api' && parts[1] === 'connection' && parts[2]) {
        return safeDecode(parts[2]);
    }

    return null;
}

function safeDecode(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function resolveRowCount(result?: AuditResultStats | null): number | null {
    if (!result) return null;
    if (Number.isFinite(result.rowCount)) return Math.max(0, Math.floor(result.rowCount!));
    if (Array.isArray(result.rows)) return result.rows.length;
    return null;
}

function numberOrNull(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseSqlOp(sqlText: string): string {
    const first = sqlText.trim().split(/\s+/)[0]?.toUpperCase() || 'SQL';
    if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(first)) return first;
    if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(first)) return 'DDL';
    if (['BEGIN', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'].includes(first)) return 'TXN';
    if (first === 'WITH') return 'SELECT';
    return first;
}

function isWriteOperation(sqlOp: string) {
    return ['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'DDL'].includes(sqlOp);
}
