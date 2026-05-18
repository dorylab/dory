import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDBService } from '@dory/database';
import { buildResultContext } from '@dory/analysis/result-context';
import { buildResultAutoChartProfile } from '@dory/analysis/core/result-chart-profile';
import { hasMetadataCapability, hasTableInfoCapability, isPostgresFamilyConnectionType } from '@dory/drivers/types';
import type { DatabaseObjectRow, DatabaseSummaryEngine, QueryInsightsFilters, QueryType, TableColumnInfo, TimeRange } from '@dory/drivers/types';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';
import { ensureConnectionPoolForUser } from '@/app/api/connection/utils';
import { buildTablePreviewPayload } from '@/lib/connection/table-preview';
import { runAnalysis } from '@/lib/server/analysis/run-analysis';
import { routing } from '@dory/i18n/routing';
import type { McpAuthContext } from './auth';
import { hasMcpScope } from './auth';
import { getReadonlyMcpStatements } from './sql-safety';

const MAX_MCP_RESULT_ROWS = 1000;
const MAX_MCP_SCHEMA_SEARCH_DATABASES = 20;
const DEFAULT_MCP_SCHEMA_SEARCH_LIMIT = 25;
const MAX_MCP_SCHEMA_SEARCH_LIMIT = 100;
const DEFAULT_MCP_MONITORING_PAGE_SIZE = 10;
const MAX_MCP_MONITORING_PAGE_SIZE = 100;

const timeRangeSchema = z.union([z.literal('1h'), z.literal('6h'), z.literal('24h'), z.literal('7d')]);
const queryTypeSchema = z.union([z.literal('all'), z.literal('select'), z.literal('insert'), z.literal('ddl'), z.literal('other')]);

const monitoringFiltersInputSchema = z
    .object({
        search: z.string().optional(),
        user: z.string().min(1).optional(),
        database: z.string().min(1).optional(),
        queryType: queryTypeSchema.optional(),
        minDurationMs: z.number().min(0).optional(),
        timeRange: timeRangeSchema.optional(),
    })
    .optional();

function structured(data: unknown) {
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
        structuredContent: data as Record<string, unknown>,
    };
}

function requireScope(context: McpAuthContext, scope: string) {
    if (!hasMcpScope(context, scope)) {
        throw new Error(`MCP token is missing required scope: ${scope}`);
    }
}

function requireAnyScope(context: McpAuthContext, scopes: string[]) {
    if (!scopes.some(scope => hasMcpScope(context, scope))) {
        throw new Error(`MCP token is missing one of the required scopes: ${scopes.join(', ')}`);
    }
}

function clampLimit(limit?: number | null) {
    if (!Number.isFinite(limit ?? NaN)) return DEFAULT_TABLE_PREVIEW_LIMIT;
    return Math.max(1, Math.min(MAX_MCP_RESULT_ROWS, Math.floor(limit!)));
}

export function clampMcpLimit(limit: number | null | undefined, defaultValue: number, maxValue: number) {
    if (!Number.isFinite(limit ?? NaN)) return defaultValue;
    return Math.max(1, Math.min(maxValue, Math.floor(limit!)));
}

function getConnectionEngine(value?: string | null): DatabaseSummaryEngine {
    if (isPostgresFamilyConnectionType(value)) return 'postgres';
    if (value === 'clickhouse' || value === 'duckdb' || value === 'mariadb' || value === 'mysql' || value === 'sqlite' || value === 'sqlserver') return value;
    return 'unknown';
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

function isTimeRange(value: unknown): value is TimeRange {
    return value === '1h' || value === '6h' || value === '24h' || value === '7d';
}

function isQueryType(value: unknown): value is QueryType {
    return value === 'all' || value === 'select' || value === 'insert' || value === 'ddl' || value === 'other';
}

type SchemaSearchItem =
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

async function getConnectionEntry(context: McpAuthContext, connectionId: string, identityId?: string | null) {
    return ensureConnectionPoolForUser(context.userId, context.organizationId, connectionId, identityId ?? null);
}

export function registerDoryMcpTools(server: McpServer, context: McpAuthContext) {
    server.registerTool(
        'dory_list_connections',
        {
            title: 'List Dory connections',
            description: 'List database connections available to this Dory organization without returning secrets.',
        },
        async () => {
            requireScope(context, 'connections:read');
            const db = await getDBService();
            const records = await db.connections.list(context.organizationId);
            return structured({
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
            });
        },
    );

    server.registerTool(
        'dory_list_databases',
        {
            title: 'List databases',
            description: 'List databases for a Dory connection.',
            inputSchema: {
                connectionId: z.string().min(1),
                identityId: z.string().min(1).optional(),
            },
        },
        async ({ connectionId, identityId }) => {
            requireScope(context, 'connections:read');
            const { entry } = await getConnectionEntry(context, connectionId, identityId);
            const metadata = entry.instance.capabilities.metadata;
            if (!hasMetadataCapability(metadata, 'getDatabases')) {
                throw new Error('This connection does not support database listing.');
            }
            return structured({ databases: await metadata.getDatabases() });
        },
    );

    server.registerTool(
        'dory_list_tables',
        {
            title: 'List tables',
            description: 'List tables for a database in a Dory connection.',
            inputSchema: {
                connectionId: z.string().min(1),
                database: z.string().min(1),
                identityId: z.string().min(1).optional(),
            },
        },
        async ({ connectionId, database, identityId }) => {
            requireScope(context, 'connections:read');
            const { entry } = await getConnectionEntry(context, connectionId, identityId);
            const metadata = entry.instance.capabilities.metadata;
            if (!hasMetadataCapability(metadata, 'getTablesOnly')) {
                throw new Error('This connection does not support table listing.');
            }
            return structured({ tables: await metadata.getTablesOnly(database) });
        },
    );

    server.registerTool(
        'dory_describe_table',
        {
            title: 'Describe table',
            description: 'Return column metadata for a table in a Dory connection.',
            inputSchema: {
                connectionId: z.string().min(1),
                database: z.string().min(1),
                table: z.string().min(1),
                identityId: z.string().min(1).optional(),
            },
        },
        async ({ connectionId, database, table, identityId }) => {
            requireScope(context, 'connections:read');
            const { entry } = await getConnectionEntry(context, connectionId, identityId);
            const metadata = entry.instance.capabilities.metadata;
            if (!hasMetadataCapability(metadata, 'getTableColumns')) {
                throw new Error('This connection does not support table column metadata.');
            }
            return structured({ columns: await metadata.getTableColumns(database, table) });
        },
    );

    server.registerTool(
        'dory_get_database_summary',
        {
            title: 'Get database summary',
            description: 'Return a compact database summary for a Dory connection, including table counts, size estimates, and recommended starting tables.',
            inputSchema: {
                connectionId: z.string().min(1),
                database: z.string().min(1),
                catalog: z.string().min(1).optional(),
                schema: z.string().min(1).optional(),
                identityId: z.string().min(1).optional(),
            },
        },
        async ({ connectionId, database, catalog, schema, identityId }) => {
            requireAnyScope(context, ['schema:read', 'connections:read']);
            const { entry, config } = await getConnectionEntry(context, connectionId, identityId);
            const metadata = entry.instance.capabilities.metadata;
            if (!hasMetadataCapability(metadata, 'getDatabaseSummary')) {
                throw new Error('This connection does not support database summaries.');
            }

            const summary = await metadata.getDatabaseSummary({
                database,
                catalogName: catalog ?? null,
                schemaName: schema ?? null,
                engine: getConnectionEngine(config.type),
                cluster: config.port ? `${config.host}:${config.port}` : (config.host ?? null),
            });

            return structured({ summary });
        },
    );

    server.registerTool(
        'dory_get_table_profile',
        {
            title: 'Get table profile',
            description: 'Return metadata, stats, indexes, properties, and DDL for a table when supported by the connection.',
            inputSchema: {
                connectionId: z.string().min(1),
                database: z.string().min(1),
                table: z.string().min(1),
                identityId: z.string().min(1).optional(),
            },
        },
        async ({ connectionId, database, table, identityId }) => {
            requireAnyScope(context, ['schema:read', 'connections:read']);
            const { entry } = await getConnectionEntry(context, connectionId, identityId);
            const metadata = entry.instance.capabilities.metadata;
            const tableInfo = entry.instance.capabilities.tableInfo;
            let hasColumnsCapability = false;
            let hasPropertiesCapability = false;
            let hasStatsCapability = false;
            let hasIndexesCapability = false;
            let hasDdlCapability = false;
            let columns: TableColumnInfo[] = [];
            let properties: unknown = null;
            let stats: unknown = null;
            let indexes: unknown[] = [];
            let ddl: string | null = null;

            if (hasMetadataCapability(metadata, 'getTableColumns')) {
                hasColumnsCapability = true;
                columns = await metadata.getTableColumns(database, table);
            }
            if (hasTableInfoCapability(tableInfo, 'properties')) {
                hasPropertiesCapability = true;
                properties = await tableInfo.properties(database, table);
            }
            if (hasTableInfoCapability(tableInfo, 'stats')) {
                hasStatsCapability = true;
                stats = await tableInfo.stats(database, table);
            }
            if (hasTableInfoCapability(tableInfo, 'indexes')) {
                hasIndexesCapability = true;
                indexes = await tableInfo.indexes(database, table);
            }
            if (hasTableInfoCapability(tableInfo, 'ddl')) {
                hasDdlCapability = true;
                ddl = await tableInfo.ddl(database, table);
            }

            const capabilities = {
                columns: hasColumnsCapability,
                properties: hasPropertiesCapability,
                stats: hasStatsCapability,
                indexes: hasIndexesCapability,
                ddl: hasDdlCapability,
            };

            return structured({
                connectionId,
                database,
                table,
                capabilities,
                columns,
                properties,
                stats,
                indexes,
                ddl,
            });
        },
    );

    server.registerTool(
        'dory_search_schema',
        {
            title: 'Search schema',
            description: 'Search tables, views, and columns by name, type, or comment using Dory driver metadata.',
            inputSchema: {
                connectionId: z.string().min(1),
                query: z.string(),
                database: z.string().min(1).optional(),
                limit: z.number().int().positive().max(MAX_MCP_SCHEMA_SEARCH_LIMIT).optional(),
                includeColumns: z.boolean().optional(),
                identityId: z.string().min(1).optional(),
            },
        },
        async ({ connectionId, query, database, limit, includeColumns, identityId }) => {
            requireAnyScope(context, ['schema:read', 'connections:read']);
            const { entry } = await getConnectionEntry(context, connectionId, identityId);
            const metadata = entry.instance.capabilities.metadata;
            if (!metadata) {
                throw new Error('This connection does not support schema metadata.');
            }

            const maxResults = clampMcpLimit(limit, DEFAULT_MCP_SCHEMA_SEARCH_LIMIT, MAX_MCP_SCHEMA_SEARCH_LIMIT);
            const shouldIncludeColumns = includeColumns !== false;
            let databases: string[];

            if (database) {
                databases = [database];
            } else {
                if (!hasMetadataCapability(metadata, 'getDatabases')) {
                    throw new Error('This connection does not support database discovery. Provide a database input.');
                }
                databases = (await metadata.getDatabases())
                    .map(item => item.value)
                    .filter(Boolean)
                    .slice(0, MAX_MCP_SCHEMA_SEARCH_DATABASES);
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

                const tables = hasMetadataCapability(metadata, 'getTablesOnly') ? await metadata.getTablesOnly(databaseName) : [];
                const views = hasMetadataCapability(metadata, 'getViews') ? await metadata.getViews(databaseName) : [];
                const tableObjects = tables.map(item => toSchemaObject('table', databaseName, item));
                const viewObjects = views.map(item => toSchemaObject('view', databaseName, item));

                scanned.tables += tableObjects.length;
                scanned.views += viewObjects.length;

                for (const object of [...tableObjects, ...viewObjects]) {
                    if (results.length >= maxResults) break;
                    if (matchSchemaSearch(object, query)) {
                        results.push(object);
                    }
                }

                if (!shouldIncludeColumns || !hasMetadataCapability(metadata, 'getTableColumns')) {
                    continue;
                }

                for (const object of [...tableObjects, ...viewObjects]) {
                    if (results.length >= maxResults) break;
                    const columns = await metadata.getTableColumns(databaseName, object.name).catch(() => [] as TableColumnInfo[]);
                    scanned.columns += columns.length;

                    for (const column of columns) {
                        if (results.length >= maxResults) break;
                        const item = toSchemaColumn(databaseName, object.name, column);
                        if (matchSchemaSearch(item, query)) {
                            results.push(item);
                        }
                    }
                }
            }

            return structured({
                query,
                connectionId,
                databases,
                results,
                meta: {
                    limit: maxResults,
                    truncated: results.length >= maxResults,
                    includeColumns: shouldIncludeColumns,
                    scanned,
                },
            });
        },
    );

    server.registerTool(
        'dory_list_saved_queries',
        {
            title: 'List saved queries',
            description: 'List saved SQL queries for a Dory connection.',
            inputSchema: {
                connectionId: z.string().min(1),
                limit: z.number().int().positive().max(MAX_MCP_SCHEMA_SEARCH_LIMIT).optional(),
                includeArchived: z.boolean().optional(),
            },
        },
        async ({ connectionId, limit, includeArchived }) => {
            requireScope(context, 'saved_queries:read');
            const db = await getDBService();
            const records = await db.savedQueries.list({
                organizationId: context.organizationId,
                userId: context.userId,
                connectionId,
                includeArchived: includeArchived === true,
                limit: clampMcpLimit(limit, DEFAULT_MCP_SCHEMA_SEARCH_LIMIT, MAX_MCP_SCHEMA_SEARCH_LIMIT),
            });

            return structured({
                savedQueries: records.map(toSavedQueryPayload),
            });
        },
    );

    server.registerTool(
        'dory_get_saved_query',
        {
            title: 'Get saved query',
            description: 'Get a saved SQL query by id for a Dory connection.',
            inputSchema: {
                connectionId: z.string().min(1),
                id: z.string().min(1),
                includeArchived: z.boolean().optional(),
            },
        },
        async ({ connectionId, id, includeArchived }) => {
            requireScope(context, 'saved_queries:read');
            const db = await getDBService();
            const record = await db.savedQueries.getById({
                organizationId: context.organizationId,
                userId: context.userId,
                connectionId,
                id,
                includeArchived: includeArchived === true,
            });

            if (!record) {
                throw new Error('Saved query not found.');
            }

            return structured({
                savedQuery: toSavedQueryPayload(record),
            });
        },
    );

    server.registerTool(
        'dory_get_monitoring_summary',
        {
            title: 'Get monitoring summary',
            description: 'Return query monitoring summary and optionally timeline, slow query, and error query samples for a Dory connection.',
            inputSchema: {
                connectionId: z.string().min(1),
                filters: monitoringFiltersInputSchema,
                includeTimeline: z.boolean().optional(),
                includeSlowQueries: z.boolean().optional(),
                includeErrorQueries: z.boolean().optional(),
                pageSize: z.number().int().positive().max(MAX_MCP_MONITORING_PAGE_SIZE).optional(),
                identityId: z.string().min(1).optional(),
            },
        },
        async ({ connectionId, filters, includeTimeline, includeSlowQueries, includeErrorQueries, pageSize, identityId }) => {
            requireScope(context, 'monitoring:read');
            const { entry } = await getConnectionEntry(context, connectionId, identityId);
            const insights = entry.instance.capabilities.queryInsights;
            if (!insights) {
                throw new Error('This connection does not support query monitoring insights.');
            }

            const normalizedFilters = normalizeMonitoringFilters(filters);
            const pagination = {
                pageIndex: 0,
                pageSize: clampMcpLimit(pageSize, DEFAULT_MCP_MONITORING_PAGE_SIZE, MAX_MCP_MONITORING_PAGE_SIZE),
            };
            const [summary, timeline, slowQueries, errorQueries] = await Promise.all([
                insights.summary(normalizedFilters),
                includeTimeline === true ? insights.timeline(normalizedFilters) : Promise.resolve(null),
                includeSlowQueries === true ? insights.slowQueries(normalizedFilters, pagination) : Promise.resolve(null),
                includeErrorQueries === true ? insights.errorQueries(normalizedFilters, pagination) : Promise.resolve(null),
            ]);

            return structured({
                connectionId,
                filters: normalizedFilters,
                summary,
                timeline,
                slowQueries,
                errorQueries,
            });
        },
    );

    server.registerTool(
        'dory_preview_table',
        {
            title: 'Preview table',
            description: 'Preview rows from a table with a hard row limit.',
            inputSchema: {
                connectionId: z.string().min(1),
                database: z.string().min(1),
                table: z.string().min(1),
                limit: z.number().int().positive().max(MAX_MCP_RESULT_ROWS).optional(),
                offset: z.number().int().min(0).optional(),
                identityId: z.string().min(1).optional(),
            },
        },
        async ({ connectionId, database, table, limit, offset, identityId }) => {
            requireScope(context, 'query:read');
            const { entry } = await getConnectionEntry(context, connectionId, identityId);
            const payload = await buildTablePreviewPayload({
                connection: entry.instance,
                connectionId,
                database,
                table,
                limit: clampLimit(limit),
                offset: offset ?? 0,
                userId: context.userId,
                source: 'mcp-table-preview',
            });
            return structured(payload);
        },
    );

    server.registerTool(
        'dory_run_readonly_sql',
        {
            title: 'Run read-only SQL',
            description: 'Run read-only SQL against a Dory connection. Write statements are rejected.',
            inputSchema: {
                connectionId: z.string().min(1),
                database: z.string().min(1).optional(),
                sql: z.string().min(1),
                limit: z.number().int().positive().max(MAX_MCP_RESULT_ROWS).optional(),
                identityId: z.string().min(1).optional(),
            },
        },
        async ({ connectionId, database, sql, limit, identityId }) => {
            requireScope(context, 'query:read');
            const { entry } = await getConnectionEntry(context, connectionId, identityId);
            const statements = getReadonlyMcpStatements(sql);
            const maxRows = clampLimit(limit);
            const sessionId = randomUUID();
            const queryResultSets: unknown[] = [];
            const results: Array<Array<Record<string, unknown>>> = [];

            for (let index = 0; index < statements.length; index += 1) {
                const statement = statements[index]!;
                const startedAt = new Date();
                const perfStart = performance.now();
                const result = await entry.instance.queryWithContext<Record<string, unknown>>(statement, {
                    database,
                    queryId: sessionId,
                });
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

            return structured({
                session: {
                    sessionId,
                    userId: context.userId,
                    connectionId,
                    database: database ?? null,
                    sqlText: sql,
                    status: 'success',
                    errorMessage: null,
                    resultSetCount: queryResultSets.length,
                    source: 'mcp',
                },
                queryResultSets,
                results,
                meta: {
                    refId: randomUUID(),
                    totalSets: queryResultSets.length,
                    maxRows,
                },
            });
        },
    );

    server.registerTool(
        'dory_build_result_context',
        {
            title: 'Build Dory result context',
            description: 'Build Dory analysis result context from SQL result metadata.',
            inputSchema: {
                sessionId: z.string().min(1),
                setIndex: z.number().int().min(0).default(0),
                sqlText: z.string().optional(),
                databaseName: z.string().nullable().optional(),
                rowCount: z.number().int().min(0).optional(),
                columns: z.array(z.record(z.string(), z.unknown())).optional(),
                stats: z.record(z.string(), z.unknown()).nullable().optional(),
            },
        },
        async input => {
            requireScope(context, 'analysis:run');
            return structured({
                resultContext: buildResultContext({
                    sessionId: input.sessionId,
                    setIndex: input.setIndex,
                    sqlText: input.sqlText,
                    databaseName: input.databaseName,
                    rowCount: input.rowCount,
                    columns: input.columns?.map(toResultContextColumn),
                    stats: input.stats as any,
                }),
            });
        },
    );

    server.registerTool(
        'dory_build_chart_profile',
        {
            title: 'Build Dory chart profile',
            description: 'Build Dory automatic chart profile from result rows and columns.',
            inputSchema: {
                rows: z.array(z.record(z.string(), z.unknown())),
                columns: z.unknown().optional(),
                stats: z.record(z.string(), z.unknown()).nullable().optional(),
                overrides: z.record(z.string(), z.unknown()).optional(),
            },
        },
        async input => {
            requireScope(context, 'analysis:run');
            return structured({
                profile: buildResultAutoChartProfile({
                    rows: input.rows.slice(0, MAX_MCP_RESULT_ROWS),
                    columns: input.columns,
                    stats: input.stats as any,
                    overrides: input.overrides as any,
                }),
            });
        },
    );

    server.registerTool(
        'dory_run_analysis',
        {
            title: 'Run Dory analysis',
            description: 'Run a Dory analysis action against a result context and connection.',
            inputSchema: {
                connectionId: z.string().min(1),
                databaseName: z.string().nullable().optional(),
                resultRef: z.object({
                    sessionId: z.string().min(1),
                    setIndex: z.number().int().min(0),
                }),
                resultContext: z.record(z.string(), z.unknown()),
                insight: z.record(z.string(), z.unknown()),
                trigger: z.record(z.string(), z.unknown()),
                tabId: z.string().min(1).optional(),
                identityId: z.string().min(1).optional(),
            },
        },
        async input => {
            requireScope(context, 'analysis:run');
            const { entry } = await getConnectionEntry(context, input.connectionId, input.identityId);
            const result = await runAnalysis({
                request: {
                    context: {
                        connectionId: input.connectionId,
                        databaseName: input.databaseName,
                        resultRef: input.resultRef,
                        resultContext: input.resultContext as any,
                        insight: input.insight,
                    },
                    trigger: input.trigger as any,
                },
                connection: entry.instance,
                connectionId: input.connectionId,
                tabId: input.tabId ?? null,
                locale: routing.defaultLocale,
                organizationId: context.organizationId,
                userId: context.userId,
            });

            return structured(result);
        },
    );
}
