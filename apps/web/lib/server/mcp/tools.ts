import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDBService } from '@dory/database';
import { buildResultContext } from '@dory/analysis/result-context';
import { buildResultAutoChartProfile } from '@dory/analysis/core/result-chart-profile';
import type { ResultAction } from '@dory/analysis/core/result-actions';
import { hasMetadataCapability } from '@dory/drivers/types';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';
import { ensureConnectionPoolForUser } from '@/app/api/connection/utils';
import { buildTablePreviewPayload } from '@/lib/connection/table-preview';
import { runAnalysis } from '@/lib/server/analysis/run-analysis';
import { routing } from '@dory/i18n/routing';
import type { McpAuthContext } from './auth';
import { hasMcpScope } from './auth';
import { getReadonlyMcpStatements } from './sql-safety';

const MAX_MCP_RESULT_ROWS = 1000;

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

function clampLimit(limit?: number | null) {
    if (!Number.isFinite(limit ?? NaN)) return DEFAULT_TABLE_PREVIEW_LIMIT;
    return Math.max(1, Math.min(MAX_MCP_RESULT_ROWS, Math.floor(limit!)));
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
