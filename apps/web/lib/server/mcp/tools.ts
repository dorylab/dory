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
import {
    buildChartProfileOperation,
    buildResultContextOperation,
    getDatabaseSummaryOperation,
    getMonitoringSummaryOperation,
    getSavedQueryOperation,
    getTableProfileOperation,
    listConnectionsOperation,
    listDatabasesOperation,
    listSavedQueriesOperation,
    listTablesOperation,
    previewTableOperation,
    runAnalysisOperation,
    runReadonlySqlOperation,
    searchSchemaOperation,
    describeTableOperation,
} from '@/lib/ai/tools/dory-tool-operations';

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
    if (value === 'clickhouse' || value === 'duckdb' || value === 'mariadb' || value === 'mysql' || value === 'oracle' || value === 'sqlite' || value === 'sqlserver') return value;
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

function toOperationContext(context: McpAuthContext) {
    return {
        organizationId: context.organizationId,
        userId: context.userId,
    };
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
            return structured(await listConnectionsOperation(toOperationContext(context)));
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
            return structured(await listDatabasesOperation(toOperationContext(context), { connectionId, identityId }));
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
            return structured(await listTablesOperation(toOperationContext(context), { connectionId, database, identityId }));
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
            return structured(await describeTableOperation(toOperationContext(context), { connectionId, database, table, identityId }));
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
            return structured(await getDatabaseSummaryOperation(toOperationContext(context), { connectionId, database, catalog, schema, identityId }));
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
            return structured(await getTableProfileOperation(toOperationContext(context), { connectionId, database, table, identityId }));
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
            return structured(await searchSchemaOperation(toOperationContext(context), { connectionId, query, database, limit, includeColumns, identityId }));
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
            return structured(await listSavedQueriesOperation(toOperationContext(context), { connectionId, limit, includeArchived }));
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
            return structured(await getSavedQueryOperation(toOperationContext(context), { connectionId, id, includeArchived }));
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
            return structured(await getMonitoringSummaryOperation(toOperationContext(context), { connectionId, filters, includeTimeline, includeSlowQueries, includeErrorQueries, pageSize, identityId }));
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
            return structured(await previewTableOperation(toOperationContext(context), { connectionId, database, table, limit, offset, identityId, source: 'mcp-table-preview' }));
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
            return structured(await runReadonlySqlOperation(toOperationContext(context), { connectionId, database, sql, limit, identityId, source: 'mcp' }));
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
            return structured(buildResultContextOperation(input));
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
            return structured(buildChartProfileOperation(input));
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
            return structured(await runAnalysisOperation(toOperationContext(context), input));
        },
    );
}
