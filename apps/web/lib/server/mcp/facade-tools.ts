import { z } from 'zod';
import type { ActionContext } from '@dory/actions';
import { toActionError } from '@dory/actions';
import { executeAction } from '@/lib/actions/server/execute';
import type { WebActionServices } from '@/lib/actions/server/types';

const DEFAULT_APPEND_SEPARATOR = '\n\n';

const connectionListInputSchema = z.object({
    includeRecent: z.boolean().optional(),
});

const schemaExploreInputSchema = z
    .object({
        operation: z.enum(['search', 'list_databases', 'list_tables', 'describe_table', 'preview_table', 'table_profile', 'get_ddl']),
        connectionId: z.string().min(1),
        database: z.string().min(1).optional(),
        table: z.string().min(1).optional(),
        query: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional(),
        offset: z.number().int().min(0).optional(),
        includeColumns: z.boolean().optional(),
        identityId: z.string().min(1).optional(),
        sort: z.unknown().optional(),
        filters: z.unknown().optional(),
        search: z.string().max(200).nullable().optional(),
        searchColumns: z.array(z.string().min(1)).max(200).optional(),
    })
    .passthrough();

const readonlySqlInputSchema = z.object({
    connectionId: z.string().min(1),
    sql: z.string().min(1),
    reason: z.string().optional(),
    workspaceMode: z.enum(['none', 'create_tab', 'append_to_tab', 'replace_tab']).default('none'),
    targetTabId: z.string().min(1).optional(),
    tabName: z.string().min(1).optional(),
    appendSeparator: z.string().optional(),
    maxRows: z.number().int().positive().max(1000).optional(),
    database: z.string().optional().nullable(),
    identityId: z.string().min(1).optional(),
});

const workspaceTabsInputSchema = z
    .object({
        operation: z.enum(['list', 'create_sql', 'append_sql', 'replace_sql', 'delete', 'open_table']),
        connectionId: z.string().min(1),
        tabId: z.string().min(1).optional(),
        sql: z.string().optional(),
        tabName: z.string().min(1).optional(),
        databaseName: z.string().min(1).optional(),
        tableName: z.string().min(1).optional(),
        activeSubTab: z.enum(['overview', 'data', 'structure', 'indexes', 'stats']).optional(),
        appendSeparator: z.string().optional(),
    })
    .passthrough();

const savedQueriesInputSchema = z
    .object({
        operation: z.enum(['list', 'get', 'create', 'update', 'delete']),
        connectionId: z.string().min(1),
        id: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        folderId: z.string().nullable().optional(),
        sqlText: z.string().min(1).optional(),
        context: z.record(z.string(), z.unknown()).nullable().optional(),
        tags: z.array(z.string()).nullable().optional(),
        workId: z.string().nullable().optional(),
        patch: z.record(z.string(), z.unknown()).optional(),
        limit: z.number().int().positive().max(100).optional(),
        includeArchived: z.boolean().optional(),
    })
    .passthrough();

const connectionListOutputSchema = z.object({
    connections: z.array(
        z.object({
            connectionId: z.string(),
            name: z.string().nullable().optional(),
            type: z.string().nullable().optional(),
            environment: z.string().nullable().optional(),
            defaultDatabase: z.string().nullable().optional(),
            lastUsedAt: z.string().nullable().optional(),
            permissionsSummary: z.string().nullable().optional(),
        }),
    ),
});

const readonlySqlOutputSchema = z.object({
    result: z.array(z.record(z.string(), z.unknown())),
    columns: z.array(z.unknown()),
    rowCount: z.number(),
    truncated: z.boolean(),
    executionTimeMs: z.number(),
    workspaceAction: z
        .object({
            mode: z.enum(['none', 'create_tab', 'append_to_tab', 'replace_tab']),
            tabId: z.string().optional(),
            tabName: z.string().optional(),
            status: z.enum(['created', 'updated', 'skipped']),
        })
        .optional(),
});

const unknownObjectOutputSchema = z.object({}).passthrough();

type McpFacadeTool = {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodTypeAny;
    outputSchema: z.ZodTypeAny;
    annotations?: Record<string, unknown>;
    execute: (ctx: ActionContext<WebActionServices>, input: unknown) => Promise<unknown>;
};

function requireString(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${name} is required for this operation.`);
    }
    return value;
}

function firstResultSet(output: any) {
    const firstRows = Array.isArray(output?.results?.[0]) ? output.results[0] : [];
    const firstSet = output?.queryResultSets?.[0] && typeof output.queryResultSets[0] === 'object' ? output.queryResultSets[0] : {};
    return {
        rows: firstRows as Array<Record<string, unknown>>,
        columns: Array.isArray(firstSet.columns) ? firstSet.columns : [],
        rowCount: Number.isFinite(firstSet.rowCount) ? Number(firstSet.rowCount) : firstRows.length,
        truncated: Boolean(firstSet.limited),
        executionTimeMs: Number.isFinite(firstSet.durationMs) ? Number(firstSet.durationMs) : 0,
    };
}

async function executeInternal<T = unknown>(ctx: ActionContext<WebActionServices>, actionId: Parameters<typeof executeAction>[1], input: unknown): Promise<T> {
    const { data } = await executeAction<T>(ctx, actionId, input);
    return data;
}

function toPublicConnection(item: any) {
    const connection = item?.connection ?? item;
    const identities = Array.isArray(item?.identities) ? item.identities : Array.isArray(connection?.identities) ? connection.identities : [];
    const defaultIdentity = identities.find((identity: any) => identity?.isDefault) ?? identities[0] ?? null;
    const defaultDatabase = connection?.database ?? defaultIdentity?.database ?? null;
    const lastUsedAt = connection?.lastUsedAt ?? connection?.updatedAt ?? null;

    return {
        connectionId: String(connection?.id ?? item?.id ?? ''),
        name: connection?.name ?? null,
        type: connection?.type ?? connection?.engine ?? null,
        environment: connection?.environment ?? null,
        defaultDatabase,
        lastUsedAt: lastUsedAt instanceof Date ? lastUsedAt.toISOString() : (lastUsedAt ?? null),
        permissionsSummary: 'read-only SQL, schema exploration, workspace tabs, and saved queries according to granted scopes',
    };
}

async function findSqlTab(ctx: ActionContext<WebActionServices>, connectionId: string, tabId: string) {
    const tabs = await executeInternal<any[]>(ctx, 'tab.list', { connectionId });
    const tab = tabs.find(item => item?.tabId === tabId);
    if (!tab) {
        throw new Error(`SQL tab not found: ${tabId}`);
    }
    if (tab.tabType !== 'sql') {
        throw new Error(`Target tab must be a SQL tab: ${tabId}`);
    }
    return tab;
}

async function applySqlWorkspaceAction(
    ctx: ActionContext<WebActionServices>,
    input: {
        connectionId: string;
        sql: string;
        workspaceMode?: 'none' | 'create_tab' | 'append_to_tab' | 'replace_tab';
        targetTabId?: string;
        tabName?: string;
        appendSeparator?: string;
        resultMeta?: Record<string, unknown> | null;
    },
) {
    const mode = input.workspaceMode ?? 'none';
    if (mode === 'none') {
        return {
            mode,
            status: 'skipped' as const,
        };
    }

    if (mode === 'create_tab') {
        const tab = await executeInternal<any>(ctx, 'tab.create', {
            connectionId: input.connectionId,
            tabType: 'sql',
            tabName: input.tabName ?? 'MCP query',
            content: input.sql,
            resultMeta: input.resultMeta ?? null,
        });
        return {
            mode,
            tabId: tab.tabId,
            tabName: tab.tabName ?? input.tabName,
            status: 'created' as const,
        };
    }

    const targetTabId = requireString(input.targetTabId, 'targetTabId');
    const existing = await findSqlTab(ctx, input.connectionId, targetTabId);
    const content =
        mode === 'append_to_tab' ? `${typeof existing.content === 'string' ? existing.content : ''}${input.appendSeparator ?? DEFAULT_APPEND_SEPARATOR}${input.sql}` : input.sql;
    const tabName = input.tabName ?? existing.tabName ?? null;

    await executeInternal(ctx, 'tab.save', {
        connectionId: input.connectionId,
        tabId: targetTabId,
        state: {
            ...existing,
            content,
            tabName,
            tabType: 'sql',
        },
        resultMeta: input.resultMeta ?? existing.resultMeta ?? null,
    });

    return {
        mode,
        tabId: targetTabId,
        tabName: tabName ?? undefined,
        status: 'updated' as const,
    };
}

async function runReadonlySqlFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown) {
    const input = readonlySqlInputSchema.parse(rawInput);
    const output = await executeInternal<any>(ctx, 'query.readOnlyExecute', {
        connectionId: input.connectionId,
        database: input.database,
        sql: input.sql,
        limit: input.maxRows,
        identityId: input.identityId,
    });
    const firstSet = firstResultSet(output);
    const workspaceAction = await applySqlWorkspaceAction(ctx, {
        connectionId: input.connectionId,
        sql: input.sql,
        workspaceMode: input.workspaceMode,
        targetTabId: input.targetTabId,
        tabName: input.tabName,
        appendSeparator: input.appendSeparator,
        resultMeta: {
            rows: firstSet.rowCount,
            columns: firstSet.columns.length,
            durationMs: firstSet.executionTimeMs,
        },
    });

    return {
        result: firstSet.rows,
        columns: firstSet.columns,
        rowCount: firstSet.rowCount,
        truncated: firstSet.truncated,
        executionTimeMs: firstSet.executionTimeMs,
        workspaceAction,
    };
}

async function exploreSchemaFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown) {
    const input = schemaExploreInputSchema.parse(rawInput);
    switch (input.operation) {
        case 'search':
            return executeInternal(ctx, 'schema.search', {
                connectionId: input.connectionId,
                query: input.query ?? '',
                database: input.database,
                limit: input.limit,
                includeColumns: input.includeColumns,
                identityId: input.identityId,
            });
        case 'list_databases':
            return executeInternal(ctx, 'schema.listDatabases', {
                connectionId: input.connectionId,
                identityId: input.identityId,
            });
        case 'list_tables':
            return executeInternal(ctx, 'schema.listTables', {
                connectionId: input.connectionId,
                database: requireString(input.database, 'database'),
                identityId: input.identityId,
            });
        case 'describe_table':
            return executeInternal(ctx, 'schema.describeTable', {
                connectionId: input.connectionId,
                database: requireString(input.database, 'database'),
                table: requireString(input.table, 'table'),
                identityId: input.identityId,
            });
        case 'preview_table':
            return executeInternal(ctx, 'table.preview', {
                connectionId: input.connectionId,
                database: requireString(input.database, 'database'),
                table: requireString(input.table, 'table'),
                limit: input.limit,
                offset: input.offset,
                sort: input.sort,
                filters: input.filters,
                search: input.search,
                searchColumns: input.searchColumns,
                identityId: input.identityId,
            });
        case 'table_profile':
            return executeInternal(ctx, 'table.getProfile', {
                connectionId: input.connectionId,
                database: requireString(input.database, 'database'),
                table: requireString(input.table, 'table'),
                identityId: input.identityId,
            });
        case 'get_ddl':
            return executeInternal(ctx, 'table.getDdl', {
                connectionId: input.connectionId,
                database: requireString(input.database, 'database'),
                table: requireString(input.table, 'table'),
                identityId: input.identityId,
            });
    }
}

async function workspaceTabsFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown) {
    const input = workspaceTabsInputSchema.parse(rawInput);
    switch (input.operation) {
        case 'list':
            return {
                tabs: await executeInternal(ctx, 'tab.list', {
                    connectionId: input.connectionId,
                }),
            };
        case 'create_sql':
            return executeInternal(ctx, 'tab.create', {
                connectionId: input.connectionId,
                tabType: 'sql',
                tabName: input.tabName ?? 'MCP query',
                content: requireString(input.sql, 'sql'),
            });
        case 'append_sql': {
            const tabId = requireString(input.tabId, 'tabId');
            const sql = requireString(input.sql, 'sql');
            const workspaceAction = await applySqlWorkspaceAction(ctx, {
                connectionId: input.connectionId,
                sql,
                workspaceMode: 'append_to_tab',
                targetTabId: tabId,
                tabName: input.tabName,
                appendSeparator: input.appendSeparator,
            });
            return { workspaceAction };
        }
        case 'replace_sql': {
            const tabId = requireString(input.tabId, 'tabId');
            const sql = requireString(input.sql, 'sql');
            const workspaceAction = await applySqlWorkspaceAction(ctx, {
                connectionId: input.connectionId,
                sql,
                workspaceMode: 'replace_tab',
                targetTabId: tabId,
                tabName: input.tabName,
            });
            return { workspaceAction };
        }
        case 'delete':
            return executeInternal(ctx, 'tab.delete', {
                connectionId: input.connectionId,
                tabId: requireString(input.tabId, 'tabId'),
            });
        case 'open_table':
            return executeInternal(ctx, 'tab.create', {
                connectionId: input.connectionId,
                tabType: 'table',
                tabName: input.tabName ?? input.tableName,
                databaseName: requireString(input.databaseName, 'databaseName'),
                tableName: requireString(input.tableName, 'tableName'),
                activeSubTab: input.activeSubTab ?? 'data',
            });
    }
}

async function savedQueriesFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown) {
    const input = savedQueriesInputSchema.parse(rawInput);
    switch (input.operation) {
        case 'list':
            return executeInternal(ctx, 'savedQuery.list', {
                connectionId: input.connectionId,
                limit: input.limit,
                includeArchived: input.includeArchived,
            });
        case 'get':
            return executeInternal(ctx, 'savedQuery.get', {
                connectionId: input.connectionId,
                id: requireString(input.id, 'id'),
                includeArchived: input.includeArchived,
            });
        case 'create':
            return executeInternal(ctx, 'savedQuery.create', {
                connectionId: input.connectionId,
                id: input.id,
                title: requireString(input.title, 'title'),
                description: input.description,
                folderId: input.folderId,
                sqlText: requireString(input.sqlText, 'sqlText'),
                context: input.context,
                tags: input.tags,
                workId: input.workId,
            });
        case 'update':
            return executeInternal(ctx, 'savedQuery.update', {
                connectionId: input.connectionId,
                id: requireString(input.id, 'id'),
                patch: input.patch ?? {
                    ...(typeof input.title !== 'undefined' ? { title: input.title } : {}),
                    ...(typeof input.description !== 'undefined' ? { description: input.description } : {}),
                    ...(typeof input.folderId !== 'undefined' ? { folderId: input.folderId } : {}),
                    ...(typeof input.sqlText !== 'undefined' ? { sqlText: input.sqlText } : {}),
                    ...(typeof input.context !== 'undefined' ? { context: input.context } : {}),
                    ...(typeof input.tags !== 'undefined' ? { tags: input.tags } : {}),
                },
            });
        case 'delete':
            return executeInternal(ctx, 'savedQuery.delete', {
                connectionId: input.connectionId,
                id: requireString(input.id, 'id'),
            });
    }
}

export function structuredMcpFacadeResult(data: unknown) {
    const structuredContent = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : { value: data };

    return {
        isError: false as const,
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
        structuredContent,
    };
}

export function structuredMcpFacadeError(error: unknown) {
    const actionError = toActionError(error);
    const output = {
        ok: false,
        error: {
            code: actionError.code,
            message: actionError.message,
            details: actionError.details ?? null,
        },
    };

    return {
        isError: true as const,
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(output, null, 2),
            },
        ],
        structuredContent: output,
    };
}

export function getPublicDoryMcpTools(): McpFacadeTool[] {
    return [
        {
            name: 'dory_list_connections',
            title: 'List Dory connections',
            description: 'List available Dory database connections with enough context to choose the likely target connection.',
            inputSchema: connectionListInputSchema,
            outputSchema: connectionListOutputSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
            execute: async ctx => {
                const output = await executeInternal<any>(ctx, 'connection.list', {});
                return {
                    connections: (Array.isArray(output?.connections) ? output.connections : []).map(toPublicConnection).filter((item: any) => item.connectionId),
                };
            },
        },
        {
            name: 'dory_explore_schema',
            title: 'Explore Dory schema',
            description: 'Explore available data, find business fields, inspect table structure, preview table rows, get table profiles, and fetch table DDL.',
            inputSchema: schemaExploreInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
            execute: exploreSchemaFacade,
        },
        {
            name: 'dory_run_readonly_sql',
            title: 'Run read-only SQL',
            description: 'Run read-only SQL against a Dory connection. Optionally create, append to, or replace a SQL workspace tab only when explicitly requested.',
            inputSchema: readonlySqlInputSchema,
            outputSchema: readonlySqlOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: runReadonlySqlFacade,
        },
        {
            name: 'dory_workspace_tabs',
            title: 'Manage Dory workspace tabs',
            description: 'Manage Dory workspace tabs: list tabs, create SQL tabs, append or replace SQL tab content, delete tabs, or open a table tab.',
            inputSchema: workspaceTabsInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: workspaceTabsFacade,
        },
        {
            name: 'dory_saved_queries',
            title: 'Manage Dory saved queries',
            description:
                'Low-priority saved query facade for listing, reading, creating, updating, or deleting reusable saved SQL. Do not use this for ordinary one-off SQL execution.',
            inputSchema: savedQueriesInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: savedQueriesFacade,
        },
    ];
}
