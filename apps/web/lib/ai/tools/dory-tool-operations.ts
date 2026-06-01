import { randomUUID } from 'node:crypto';

import { getDBService } from '@dory/database';
import { buildResultAutoChartProfile } from '@dory/analysis/core/result-chart-profile';
import { buildResultContext } from '@dory/analysis/result-context';
import { isPostgresFamilyConnectionType } from '@dory/drivers/types';
import type { DatabaseObjectRow, DatabaseSummaryEngine, QueryInsightsFilters, QueryType, TableColumnInfo, TimeRange } from '@dory/drivers/types';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { buildTablePreviewPayload } from '@/lib/connection/table-preview';
import { runAnalysis } from '@/lib/server/analysis/run-analysis';
import { getReadonlyMcpStatements } from '@/lib/server/mcp/sql-safety';
import { routing, type Locale } from '@dory/i18n/routing';
import { getSqlAuditConnectionSnapshot, logDeniedSqlAudit, runWithSqlAudit } from '@/lib/server/sql-audit';
import type { QuerySource } from '@dory/shared/types/audit';

export const MAX_DORY_TOOL_RESULT_ROWS = 100;
export const MAX_DORY_SCHEMA_SEARCH_DATABASES = 20;
export const DEFAULT_DORY_SCHEMA_SEARCH_LIMIT = 25;
export const MAX_DORY_SCHEMA_SEARCH_LIMIT = 100;
export const DEFAULT_DORY_MONITORING_PAGE_SIZE = 10;
export const MAX_DORY_MONITORING_PAGE_SIZE = 100;

export type DoryToolOperationContext = {
    organizationId: string;
    userId: string;
    currentConnectionId?: string | null;
    locale?: Locale;
    restrictToCurrentConnection?: boolean;
    auditSource?: QuerySource;
    actionRunId?: string | null;
    requestId?: string | null;
};

export type SchemaSearchItem =
    | {
          kind: 'table' | 'view';
          database: string;
          name: string;
          comment?: string | null;
          totalBytes?: number | null;
          totalRows?: number | null;
          lastModified?: string | null;
      }
    | {
          kind: 'column';
          database: string;
          table: string;
          name: string;
          type?: string | null;
          comment?: string | null;
          isPrimaryKey?: boolean | number | string | null;
      };

export function clampDoryToolLimit(limit: number | null | undefined, defaultValue: number, maxValue: number) {
    if (!Number.isFinite(limit ?? NaN)) return defaultValue;
    return Math.max(1, Math.min(maxValue, Math.floor(limit!)));
}

function clampResultLimit(limit?: number | null) {
    if (!Number.isFinite(limit ?? NaN)) return DEFAULT_TABLE_PREVIEW_LIMIT;
    return Math.max(1, Math.min(MAX_DORY_TOOL_RESULT_ROWS, Math.floor(limit!)));
}

function isTimeRange(value: unknown): value is TimeRange {
    return value === '1h' || value === '6h' || value === '24h' || value === '7d';
}

function isQueryType(value: unknown): value is QueryType {
    return value === 'all' || value === 'select' || value === 'insert' || value === 'ddl' || value === 'other';
}

export function normalizeMonitoringFilters(input?: Partial<QueryInsightsFilters> | null): QueryInsightsFilters {
    return {
        search: typeof input?.search === 'string' ? input.search : '',
        user: typeof input?.user === 'string' && input.user ? input.user : 'all',
        database: typeof input?.database === 'string' && input.database ? input.database : 'all',
        queryType: isQueryType(input?.queryType) ? input.queryType : 'all',
        minDurationMs: Number.isFinite(input?.minDurationMs) ? Math.max(0, Math.floor(input!.minDurationMs!)) : 0,
        timeRange: isTimeRange(input?.timeRange) ? input.timeRange : '1h',
    };
}

function includesQuery(value: unknown, query: string) {
    return typeof value === 'string' && value.toLowerCase().includes(query);
}

export function matchSchemaSearch(item: SchemaSearchItem, query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    if (item.kind === 'column') {
        return (
            includesQuery(item.database, normalized) ||
            includesQuery(item.table, normalized) ||
            includesQuery(item.name, normalized) ||
            includesQuery(item.type, normalized) ||
            includesQuery(item.comment, normalized)
        );
    }

    return (
        includesQuery(item.database, normalized) || includesQuery(item.name, normalized) || includesQuery(item.comment, normalized) || includesQuery(item.lastModified, normalized)
    );
}

function toSavedQueryPayload(record: {
    id: string;
    title: string;
    description?: string | null;
    folderId?: string | null;
    sqlText: string;
    context?: unknown;
    tags?: unknown;
    workId?: string | null;
    connectionId?: string | null;
    position?: number | null;
    createdAt?: Date | string | null;
    updatedAt?: Date | string | null;
    archivedAt?: Date | string | null;
}) {
    return {
        id: record.id,
        title: record.title,
        description: record.description ?? null,
        folderId: record.folderId ?? null,
        sqlText: record.sqlText,
        context: record.context ?? {},
        tags: Array.isArray(record.tags) ? record.tags : [],
        workId: record.workId ?? null,
        connectionId: record.connectionId ?? null,
        position: record.position ?? null,
        createdAt: record.createdAt ?? null,
        updatedAt: record.updatedAt ?? null,
        archivedAt: record.archivedAt ?? null,
    };
}

function toSchemaObject(kind: 'table' | 'view', database: string, item: DatabaseObjectRow): SchemaSearchItem {
    return {
        kind,
        database,
        name: item.name,
        comment: item.comment ?? null,
        totalBytes: item.totalBytes ?? null,
        totalRows: item.totalRows ?? null,
        lastModified: item.lastModified ?? null,
    };
}

function toSchemaColumn(database: string, table: string, column: TableColumnInfo): SchemaSearchItem {
    return {
        kind: 'column',
        database,
        table,
        name: column.columnName,
        type: column.columnType ?? null,
        comment: column.comment ?? null,
        isPrimaryKey: column.isPrimaryKey ?? null,
    };
}

function toResultContextColumn(column: { name?: unknown; type?: unknown; dbType?: unknown; normalizedType?: unknown; semanticRole?: unknown }) {
    const name = typeof column.name === 'string' ? column.name : '';
    const normalizedType =
        typeof column.normalizedType === 'string'
            ? column.normalizedType
            : typeof column.type === 'string'
              ? column.type
              : typeof column.dbType === 'string'
                ? column.dbType
                : 'unknown';

    return {
        name,
        type: typeof column.type === 'string' ? column.type : null,
        dbType: typeof column.dbType === 'string' ? column.dbType : null,
        normalizedType,
        semanticRole: typeof column.semanticRole === 'string' ? column.semanticRole : undefined,
    };
}

function resolveConnectionId(context: DoryToolOperationContext, connectionId?: string | null) {
    const requested = connectionId?.trim() || context.currentConnectionId?.trim() || null;
    if (!requested) {
        throw new Error('A connectionId is required for this tool.');
    }
    if (context.restrictToCurrentConnection && context.currentConnectionId && requested !== context.currentConnectionId) {
        throw new Error('This chat tool can only access the current chat connection.');
    }
    return requested;
}

async function getConnectionEntry(context: DoryToolOperationContext, connectionId?: string | null, identityId?: string | null) {
    const resolvedConnectionId = resolveConnectionId(context, connectionId);
    return ensureConnectionPoolForUser(context.userId, context.organizationId, resolvedConnectionId, identityId ?? null);
}

function withDoryToolSqlAudit<T>(
    context: DoryToolOperationContext,
    input: { connectionId?: string | null; database?: string | null; databaseName?: string | null; identityId?: string | null },
    source: QuerySource,
    operation: () => Promise<T> | T,
) {
    return runWithSqlAudit(
        {
            organizationId: context.organizationId,
            userId: context.userId,
            source,
            connectionId: resolveConnectionId(context, input.connectionId),
            identityId: input.identityId ?? null,
            databaseName: input.database ?? input.databaseName ?? null,
            extraJson: {
                identityId: input.identityId ?? null,
                actionRunId: context.actionRunId ?? null,
                requestId: context.requestId ?? null,
            },
        },
        operation,
    );
}

function metadataAuditSource(context: DoryToolOperationContext): QuerySource {
    return context.auditSource ?? 'ai_schema_metadata';
}

function monitoringAuditSource(context: DoryToolOperationContext): QuerySource {
    return context.auditSource === 'mcp_schema_metadata' ? 'mcp_monitoring' : (context.auditSource ?? 'ai_schema_metadata');
}

function previewAuditSource(inputSource?: string | null): QuerySource {
    if (inputSource === 'mcp-table-preview') return 'mcp_table_preview';
    if (inputSource === 'chat-table-preview') return 'ai_table_preview';
    return 'user_table_preview';
}

function readonlySqlAuditSource(inputSource?: string | null): QuerySource {
    if (inputSource === 'mcp') return 'mcp_sql_runner';
    return 'ai_sql_runner';
}

function getConnectionEngine(value?: string | null): DatabaseSummaryEngine {
    if (isPostgresFamilyConnectionType(value)) return 'postgres';
    if (value === 'clickhouse' || value === 'duckdb' || value === 'mariadb' || value === 'mysql' || value === 'oracle' || value === 'sqlite' || value === 'sqlserver') return value;
    return 'unknown';
}

export async function listConnectionsOperation(context: DoryToolOperationContext) {
    const db = await getDBService();
    const records = await db.connections.list(context.organizationId);
    return {
        connections: records.map(item => ({
            id: item.connection.id,
            name: item.connection.name,
            type: item.connection.type,
            engine: item.connection.engine,
            database: item.connection.database,
            status: item.connection.status,
            environment: item.connection.environment,
            lastCheckStatus: item.connection.lastCheckStatus,
            identities: item.identities.map(identity => ({
                id: identity.id,
                name: identity.name,
                username: identity.username,
                isDefault: identity.isDefault,
                database: identity.database,
            })),
        })),
    };
}

export async function listDatabasesOperation(context: DoryToolOperationContext, input: { connectionId?: string | null; identityId?: string | null }) {
    const { entry } = await getConnectionEntry(context, input.connectionId, input.identityId);
    return withDoryToolSqlAudit(context, input, metadataAuditSource(context), async () => ({ databases: await entry.instance.listDatabases() }));
}

export async function listTablesOperation(context: DoryToolOperationContext, input: { connectionId?: string | null; database: string; identityId?: string | null }) {
    const { entry } = await getConnectionEntry(context, input.connectionId, input.identityId);
    return withDoryToolSqlAudit(context, input, metadataAuditSource(context), async () => ({ tables: await entry.instance.listTablesOnly(input.database) }));
}

export async function describeTableOperation(
    context: DoryToolOperationContext,
    input: { connectionId?: string | null; database: string; table: string; identityId?: string | null },
) {
    const { entry } = await getConnectionEntry(context, input.connectionId, input.identityId);
    return withDoryToolSqlAudit(context, input, metadataAuditSource(context), async () => ({ columns: await entry.instance.describeTable(input.database, input.table) }));
}

export async function getDatabaseSummaryOperation(
    context: DoryToolOperationContext,
    input: { connectionId?: string | null; database: string; catalog?: string | null; schema?: string | null; identityId?: string | null },
) {
    const { entry, config } = await getConnectionEntry(context, input.connectionId, input.identityId);
    return withDoryToolSqlAudit(context, input, metadataAuditSource(context), async () => ({
        summary: await entry.instance.getDatabaseSummary({
            database: input.database,
            catalogName: input.catalog ?? null,
            schemaName: input.schema ?? null,
            engine: getConnectionEngine(config.type),
            cluster: config.port ? `${config.host}:${config.port}` : (config.host ?? null),
        }),
    }));
}

export async function getTableProfileOperation(
    context: DoryToolOperationContext,
    input: { connectionId?: string | null; database: string; table: string; identityId?: string | null },
) {
    const { entry } = await getConnectionEntry(context, input.connectionId, input.identityId);
    return withDoryToolSqlAudit(context, input, metadataAuditSource(context), async () => ({
        connectionId: resolveConnectionId(context, input.connectionId),
        database: input.database,
        table: input.table,
        ...(await entry.instance.getTableProfile(input.database, input.table)),
    }));
}

export async function searchSchemaOperation(
    context: DoryToolOperationContext,
    input: { connectionId?: string | null; query: string; database?: string | null; limit?: number | null; includeColumns?: boolean | null; identityId?: string | null },
) {
    const connectionId = resolveConnectionId(context, input.connectionId);
    const { entry } = await getConnectionEntry(context, connectionId, input.identityId);
    const maxResults = clampDoryToolLimit(input.limit, DEFAULT_DORY_SCHEMA_SEARCH_LIMIT, MAX_DORY_SCHEMA_SEARCH_LIMIT);
    const shouldIncludeColumns = input.includeColumns !== false;
    let databases: string[];

    if (input.database) {
        databases = [input.database];
    } else {
        databases = await withDoryToolSqlAudit(context, input, metadataAuditSource(context), async () =>
            (await entry.instance.listDatabases())
                .map(item => item.value)
                .filter(Boolean)
                .slice(0, MAX_DORY_SCHEMA_SEARCH_DATABASES),
        );
    }

    const results: SchemaSearchItem[] = [];
    const scanned = {
        databases: 0,
        tables: 0,
        views: 0,
        columns: 0,
    };

    for (const databaseName of databases) {
        if (results.length >= maxResults) break;
        scanned.databases += 1;

        const tables = await withDoryToolSqlAudit(context, { ...input, database: databaseName }, metadataAuditSource(context), async () =>
            entry.instance.listTablesOnly(databaseName).catch(() => [] as DatabaseObjectRow[]),
        );
        const views = await withDoryToolSqlAudit(context, { ...input, database: databaseName }, metadataAuditSource(context), async () =>
            entry.instance.listViews(databaseName).catch(() => [] as DatabaseObjectRow[]),
        );
        const tableObjects = tables.map(item => toSchemaObject('table', databaseName, item));
        const viewObjects = views.map(item => toSchemaObject('view', databaseName, item));

        scanned.tables += tableObjects.length;
        scanned.views += viewObjects.length;

        for (const object of [...tableObjects, ...viewObjects]) {
            if (results.length >= maxResults) break;
            if (matchSchemaSearch(object, input.query)) {
                results.push(object);
            }
        }

        if (!shouldIncludeColumns) {
            continue;
        }

        for (const object of [...tableObjects, ...viewObjects]) {
            if (results.length >= maxResults) break;
            const columns = await withDoryToolSqlAudit(context, { ...input, database: databaseName }, metadataAuditSource(context), async () =>
                entry.instance.describeTable(databaseName, object.name).catch(() => [] as TableColumnInfo[]),
            );
            scanned.columns += columns.length;

            for (const column of columns) {
                if (results.length >= maxResults) break;
                const item = toSchemaColumn(databaseName, object.name, column);
                if (matchSchemaSearch(item, input.query)) {
                    results.push(item);
                }
            }
        }
    }

    return {
        query: input.query,
        connectionId,
        databases,
        results,
        meta: {
            limit: maxResults,
            truncated: results.length >= maxResults,
            includeColumns: shouldIncludeColumns,
            scanned,
        },
    };
}

export async function listSavedQueriesOperation(
    context: DoryToolOperationContext,
    input: { connectionId?: string | null; limit?: number | null; includeArchived?: boolean | null },
) {
    const db = await getDBService();
    const records = await db.savedQueries.list({
        organizationId: context.organizationId,
        userId: context.userId,
        connectionId: resolveConnectionId(context, input.connectionId),
        includeArchived: input.includeArchived === true,
        limit: clampDoryToolLimit(input.limit, DEFAULT_DORY_SCHEMA_SEARCH_LIMIT, MAX_DORY_SCHEMA_SEARCH_LIMIT),
    });

    return {
        savedQueries: records.map(toSavedQueryPayload),
    };
}

export async function getSavedQueryOperation(context: DoryToolOperationContext, input: { connectionId?: string | null; id: string; includeArchived?: boolean | null }) {
    const db = await getDBService();
    const record = await db.savedQueries.getById({
        organizationId: context.organizationId,
        userId: context.userId,
        connectionId: resolveConnectionId(context, input.connectionId),
        id: input.id,
        includeArchived: input.includeArchived === true,
    });

    if (!record) {
        throw new Error('Saved query not found.');
    }

    return {
        savedQuery: toSavedQueryPayload(record),
    };
}

export async function getMonitoringSummaryOperation(
    context: DoryToolOperationContext,
    input: {
        connectionId?: string | null;
        filters?: Partial<QueryInsightsFilters> | null;
        includeTimeline?: boolean | null;
        includeSlowQueries?: boolean | null;
        includeErrorQueries?: boolean | null;
        pageSize?: number | null;
        identityId?: string | null;
    },
) {
    const connectionId = resolveConnectionId(context, input.connectionId);
    const { entry } = await getConnectionEntry(context, connectionId, input.identityId);
    const normalizedFilters = normalizeMonitoringFilters(input.filters);
    const pageSize = clampDoryToolLimit(input.pageSize, DEFAULT_DORY_MONITORING_PAGE_SIZE, MAX_DORY_MONITORING_PAGE_SIZE);
    return withDoryToolSqlAudit(context, input, monitoringAuditSource(context), async () => ({
        connectionId,
        ...(await entry.instance.getMonitoringSummary({
            filters: normalizedFilters,
            includeTimeline: input.includeTimeline === true,
            includeSlowQueries: input.includeSlowQueries === true,
            includeErrorQueries: input.includeErrorQueries === true,
            pagination: {
                pageIndex: 0,
                pageSize,
            },
        })),
    }));
}

export async function previewTableOperation(
    context: DoryToolOperationContext,
    input: { connectionId?: string | null; database: string; table: string; limit?: number | null; offset?: number | null; identityId?: string | null; source?: string | null },
) {
    const connectionId = resolveConnectionId(context, input.connectionId);
    const { entry } = await getConnectionEntry(context, connectionId, input.identityId);
    return withDoryToolSqlAudit(context, input, previewAuditSource(input.source), async () =>
        buildTablePreviewPayload({
            connection: entry.instance,
            connectionId,
            database: input.database,
            table: input.table,
            limit: clampResultLimit(input.limit),
            offset: input.offset ?? 0,
            userId: context.userId,
            source: input.source ?? 'tool-table-preview',
        }),
    );
}

export async function runReadonlySqlOperation(
    context: DoryToolOperationContext,
    input: { connectionId?: string | null; database?: string | null; sql: string; limit?: number | null; identityId?: string | null; source?: string | null },
) {
    const connectionId = resolveConnectionId(context, input.connectionId);
    const { entry } = await getConnectionEntry(context, connectionId, input.identityId);
    const auditSource = context.auditSource ?? readonlySqlAuditSource(input.source);
    let statements: string[];
    try {
        statements = getReadonlyMcpStatements(input.sql);
    } catch (error) {
        await logDeniedSqlAudit(
            {
                organizationId: context.organizationId,
                userId: context.userId,
                source: auditSource,
                connectionId,
                identityId: input.identityId ?? null,
                databaseName: input.database ?? null,
                connectionSnapshot: getSqlAuditConnectionSnapshot(entry),
                extraJson: {
                    identityId: input.identityId ?? null,
                    actionRunId: context.actionRunId ?? null,
                    requestId: context.requestId ?? null,
                },
            },
            {
                sqlText: input.sql,
                databaseName: input.database ?? null,
                errorMessage: error instanceof Error ? error.message : String(error ?? 'SQL denied'),
            },
        );
        throw error;
    }
    const maxRows = clampResultLimit(input.limit);
    const sessionId = randomUUID();
    const queryResultSets: unknown[] = [];
    const results: Array<Array<Record<string, unknown>>> = [];

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index]!;
        const startedAt = new Date();
        const perfStart = performance.now();
        const result = await runWithSqlAudit(
            {
                organizationId: context.organizationId,
                userId: context.userId,
                source: auditSource,
                connectionId,
                identityId: input.identityId ?? null,
                databaseName: input.database ?? null,
                queryId: sessionId,
                extraJson: {
                    identityId: input.identityId ?? null,
                    actionRunId: context.actionRunId ?? null,
                    requestId: context.requestId ?? null,
                },
            },
            () =>
                entry.instance.queryWithContext<Record<string, unknown>>(statement, {
                    database: input.database ?? undefined,
                    queryId: sessionId,
                }),
        );
        const rows = Array.isArray(result.rows) ? result.rows.slice(0, maxRows) : [];
        const durationMs = Math.round(performance.now() - perfStart);
        const finishedAt = new Date();

        queryResultSets.push({
            sessionId,
            setIndex: index,
            sqlText: statement,
            sqlOp: statement.trim().split(/\s+/)[0]?.toUpperCase() ?? 'SQL',
            title: statement.trim().slice(0, 80),
            columns: result.columns ?? null,
            rowCount: result.rowCount ?? rows.length,
            limited: rows.length < (result.rows?.length ?? rows.length) || (result.limited ?? false),
            limit: maxRows,
            affectedRows: null,
            status: 'success',
            errorMessage: null,
            startedAt,
            finishedAt,
            durationMs,
        });
        results.push(rows);
    }

    return {
        session: {
            sessionId,
            userId: context.userId,
            connectionId,
            database: input.database ?? null,
            sqlText: input.sql,
            status: 'success',
            errorMessage: null,
            resultSetCount: queryResultSets.length,
            source: input.source ?? 'tool',
        },
        queryResultSets,
        results,
        meta: {
            refId: randomUUID(),
            totalSets: queryResultSets.length,
            maxRows,
        },
    };
}

export function buildResultContextOperation(input: {
    sessionId: string;
    setIndex: number;
    sqlText?: string | null;
    databaseName?: string | null;
    rowCount?: number | null;
    columns?: Array<Record<string, unknown>> | null;
    stats?: Record<string, unknown> | null;
}) {
    return {
        resultContext: buildResultContext({
            sessionId: input.sessionId,
            setIndex: input.setIndex,
            sqlText: input.sqlText ?? undefined,
            databaseName: input.databaseName ?? undefined,
            rowCount: input.rowCount ?? undefined,
            columns: input.columns?.map(toResultContextColumn),
            stats: input.stats as any,
        }),
    };
}

export function buildChartProfileOperation(input: {
    rows: Array<Record<string, unknown>>;
    columns?: unknown;
    stats?: Record<string, unknown> | null;
    overrides?: Record<string, unknown>;
}) {
    return {
        profile: buildResultAutoChartProfile({
            rows: input.rows.slice(0, MAX_DORY_TOOL_RESULT_ROWS),
            columns: input.columns,
            stats: input.stats as any,
            overrides: input.overrides as any,
        }),
    };
}

export async function runAnalysisOperation(
    context: DoryToolOperationContext,
    input: {
        connectionId?: string | null;
        databaseName?: string | null;
        resultRef: { sessionId: string; setIndex: number };
        resultContext: Record<string, unknown>;
        insight: Record<string, unknown>;
        trigger: Record<string, unknown>;
        tabId?: string | null;
        identityId?: string | null;
    },
) {
    const connectionId = resolveConnectionId(context, input.connectionId);
    const { entry } = await getConnectionEntry(context, connectionId, input.identityId);
    return runWithSqlAudit(
        {
            organizationId: context.organizationId,
            userId: context.userId,
            source: context.auditSource === 'mcp_schema_metadata' ? 'mcp_analysis' : 'ai_analysis',
            connectionId,
            databaseName: input.databaseName ?? null,
            tabId: input.tabId ?? null,
            extraJson: {
                identityId: input.identityId ?? null,
            },
        },
        () =>
            runAnalysis({
                request: {
                    context: {
                        connectionId,
                        databaseName: input.databaseName,
                        resultRef: input.resultRef,
                        resultContext: input.resultContext as any,
                        insight: input.insight,
                    },
                    trigger: input.trigger as any,
                },
                connection: entry.instance,
                connectionId,
                tabId: input.tabId ?? null,
                locale: context.locale ?? routing.defaultLocale,
                organizationId: context.organizationId,
                userId: context.userId,
            }),
    );
}
