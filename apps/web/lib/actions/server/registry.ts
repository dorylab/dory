import { z } from 'zod';

import { ActionRegistry, defineAction } from '@dory/actions';
import type { ActionActorType, ActionAuditPolicy, ActionContext, ActionDefinition, ActionExposurePolicy, ActionMcpMetadata, ActionPermissionRequirement } from '@dory/actions';
import type { QuerySource, QueryStatus } from '@dory/shared/types/audit';
import { testConnectService } from '@/lib/connection/test-connect-service';
import {
    buildChartProfileOperation,
    buildResultContextOperation,
    getDatabaseSummaryOperation,
    getMonitoringSummaryOperation,
    getSavedQueryOperation,
    getTableProfileOperation,
    listDatabasesOperation,
    listSavedQueriesOperation,
    listTablesOperation,
    previewTableOperation,
    runAnalysisOperation,
    runReadonlySqlOperation,
    searchSchemaOperation,
    describeTableOperation,
} from '@/lib/ai/tools/dory-tool-operations';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import type { ActionIntent } from '@/lib/copilot/action/types';
import type { WebActionServices } from './types';
import { executeSqlAction } from './query-operation';
import {
    columnInputSchema,
    runResultInsightsAction,
    runSchemaExplanationsAction,
    runSchemaTagsAction,
    runTabTitleAction,
    runTableStatsInsightsAction,
    runTableSummaryAction,
} from './ai-operations';

const readWorkspace: ActionPermissionRequirement[] = [{ resource: 'workspace', action: 'read' }];
const writeWorkspace: ActionPermissionRequirement[] = [{ resource: 'workspace', action: 'write' }];
const readConnection: ActionPermissionRequirement[] = [
    { resource: 'workspace', action: 'read' },
    { resource: 'connection', action: 'read' },
];
const createConnection: ActionPermissionRequirement[] = [
    { resource: 'workspace', action: 'write' },
    { resource: 'connection', action: 'create' },
];
const updateConnection: ActionPermissionRequirement[] = [
    { resource: 'workspace', action: 'write' },
    { resource: 'connection', action: 'update' },
];
const deleteConnection: ActionPermissionRequirement[] = [
    { resource: 'workspace', action: 'write' },
    { resource: 'connection', action: 'delete' },
];

const querySources: QuerySource[] = [
    'console',
    'chatbot',
    'api',
    'task',
    'user_sql_console',
    'user_table_preview',
    'dory_schema_metadata',
    'dory_monitoring',
    'ai_sql_runner',
    'ai_table_preview',
    'ai_schema_metadata',
    'ai_analysis',
    'automation_sql',
    'automation_ai_sql',
    'automation_schema_metadata',
    'mcp_sql_runner',
    'mcp_table_preview',
    'mcp_schema_metadata',
    'mcp_monitoring',
    'mcp_analysis',
];
const queryStatuses: QueryStatus[] = ['success', 'error', 'denied', 'canceled'];

const connectionIdInput = z.object({
    connectionId: z.string().min(1).optional(),
    identityId: z.string().min(1).optional(),
});

const unknownOutputSchema = z.unknown();
const connectionListOutputSchema = z.object({
    connections: z.array(z.unknown()),
});
const connectionListToolOutputSchema = z.object({
    connections: z.array(
        z.object({
            id: z.string(),
            name: z.string().nullable().optional(),
            type: z.string().nullable().optional(),
            engine: z.string().nullable().optional(),
            database: z.string().nullable().optional(),
            status: z.string().nullable().optional(),
            environment: z.string().nullable().optional(),
            lastCheckStatus: z.string().nullable().optional(),
            identities: z.array(
                z.object({
                    id: z.string(),
                    name: z.string().nullable().optional(),
                    username: z.string().nullable().optional(),
                    isDefault: z.boolean(),
                    database: z.string().nullable().optional(),
                }),
            ),
        }),
    ),
});
const queryExecutionOutputSchema = z
    .object({
        session: z.record(z.string(), z.unknown()),
        queryResultSets: z.array(z.unknown()),
        results: z.array(z.unknown()),
        meta: z.record(z.string(), z.unknown()),
    })
    .passthrough();

type WebActionRegistration<TInput, TOutput> = Omit<ActionDefinition<TInput, TOutput, WebActionServices>, 'version' | 'outputSchema' | 'permission' | 'exposure' | 'audit'> & {
    outputSchema?: z.ZodType<TOutput>;
    permissions?: ActionPermissionRequirement[];
    scopes?: string[];
    actors: ActionActorType[];
    mcp?: ActionMcpMetadata;
    defaultProjection?: ActionExposurePolicy<TOutput, WebActionServices>['defaultProjection'];
    projections?: ActionExposurePolicy<TOutput, WebActionServices>['projections'];
    audit?: ActionAuditPolicy<TInput, TOutput, WebActionServices>;
};

function defineWebAction<TInput, TOutput>(action: WebActionRegistration<TInput, TOutput>) {
    const { outputSchema, permissions, scopes, actors, mcp, defaultProjection, projections, audit, ...definition } = action;
    return defineAction({
        ...definition,
        version: 1,
        outputSchema: outputSchema ?? (unknownOutputSchema as z.ZodType<TOutput>),
        permission: {
            organization: permissions ?? [],
            scopes: scopes ?? [],
            destructive: definition.risk === 'destructive' ? { requireConfirmation: true } : undefined,
        },
        exposure: {
            actors,
            mcp,
            defaultProjection,
            projections,
        },
        audit: audit ?? defaultActionAuditPolicy(definition.domain),
    });
}

function defaultActionAuditPolicy(domain: string): ActionAuditPolicy<any, any, WebActionServices> {
    if (domain === 'query') {
        return {
            sourceByActor: {
                user: 'user_sql_console',
                agent: 'ai_sql_runner',
                mcp: 'mcp_sql_runner',
                automation: 'automation_sql',
            },
            allowInputFields: ['connectionId', 'identityId', 'database', 'sessionId', 'tabId', 'source'],
        };
    }

    if (domain === 'table') {
        return {
            sourceByActor: {
                user: 'user_table_preview',
                agent: 'ai_table_preview',
                mcp: 'mcp_table_preview',
                automation: 'automation_schema_metadata',
            },
            allowInputFields: ['connectionId', 'identityId', 'database', 'table', 'limit'],
        };
    }

    return {
        sourceByActor: {
            user: 'dory_schema_metadata',
            agent: 'ai_schema_metadata',
            mcp: 'mcp_schema_metadata',
            automation: 'automation_schema_metadata',
        },
        allowInputFields: ['connectionId', 'identityId', 'database', 'schema', 'table', 'id'],
    };
}

function projectConnectionListForTools(output: { connections?: any[] }) {
    return {
        connections: (output.connections ?? []).map(item => ({
            id: item.connection?.id,
            name: item.connection?.name ?? null,
            type: item.connection?.type ?? null,
            engine: item.connection?.engine ?? null,
            database: item.connection?.database ?? null,
            status: item.connection?.status ?? null,
            environment: item.connection?.environment ?? null,
            lastCheckStatus: item.connection?.lastCheckStatus ?? null,
            identities: Array.isArray(item.identities)
                ? item.identities.map((identity: any) => ({
                      id: identity.id,
                      name: identity.name ?? null,
                      username: identity.username ?? null,
                      isDefault: Boolean(identity.isDefault),
                      database: identity.database ?? null,
                  }))
                : [],
        })),
    };
}

function isQuerySource(value?: string | null): value is QuerySource {
    return Boolean(value && querySources.includes(value as QuerySource));
}

const actionOperationContext = (ctx: ActionContext<WebActionServices>, auditSource?: QuerySource) => ({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    currentConnectionId: ctx.currentConnectionId ?? null,
    locale: ctx.locale as any,
    restrictToCurrentConnection: ctx.actor.type === 'agent',
    auditSource: auditSource ?? (isQuerySource(ctx.auditSource) ? ctx.auditSource : undefined),
    actionRunId: ctx.actionRunId ?? null,
    requestId: ctx.requestId ?? null,
});

function actorAuditSource(ctx: { actor: { type: string } }, fallback: QuerySource): QuerySource {
    if (ctx.actor.type === 'mcp') return 'mcp_schema_metadata';
    if (ctx.actor.type === 'automation') return 'automation_schema_metadata';
    if (ctx.actor.type === 'agent') return 'ai_schema_metadata';
    return fallback;
}

function resolveConnectionId(ctx: { currentConnectionId?: string | null }, input: { connectionId?: string | null }) {
    const connectionId = input.connectionId?.trim() || ctx.currentConnectionId?.trim();
    if (!connectionId) throw new Error('Missing connectionId.');
    return connectionId;
}

export const webActionRegistry = new ActionRegistry<WebActionServices>();

webActionRegistry.registerMany([
    defineWebAction({
        id: 'connection.list',
        domain: 'connection',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({}),
        outputSchema: connectionListOutputSchema,
        permissions: readConnection,
        scopes: ['connections:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        projections: {
            ui: {
                schema: connectionListOutputSchema,
            },
            agent: {
                schema: connectionListToolOutputSchema,
                project: projectConnectionListForTools,
            },
            mcp: {
                schema: connectionListToolOutputSchema,
                project: projectConnectionListForTools,
            },
        },
        mcp: {
            name: 'dory_list_connections',
            title: 'List Dory connections',
            description: 'List database connections available to this Dory organization without returning secrets.',
        },
        handler: async ctx => ({
            connections: await ctx.services.db.connections.list(ctx.organizationId),
        }),
    }),
    defineWebAction({
        id: 'connection.get',
        domain: 'connection',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ id: z.string().min(1) }),
        permissions: readConnection,
        scopes: ['connections:read'],
        actors: ['user', 'agent', 'automation'],
        handler: async (ctx, input) => {
            const record = await ctx.services.db.connections.getById(ctx.organizationId, input.id);
            if (!record) throw new Error('Connection not found.');
            return record;
        },
    }),
    defineWebAction({
        id: 'connection.create',
        domain: 'connection',
        kind: 'command',
        risk: 'write',
        inputSchema: z.object({ payload: z.record(z.string(), z.unknown()) }),
        permissions: createConnection,
        scopes: ['connections:write'],
        actors: ['user', 'automation'],
        handler: async (ctx, input) => {
            const created = await ctx.services.db.connections.create(ctx.userId, ctx.organizationId, input.payload as any);
            await ctx.services.db.syncOperations.enqueue({
                organizationId: ctx.organizationId,
                entityType: 'connection',
                entityId: created.connection.id,
                operation: 'create',
                payload: input.payload,
            });
            return created;
        },
    }),
    defineWebAction({
        id: 'connection.update',
        domain: 'connection',
        kind: 'command',
        risk: 'write',
        inputSchema: z.object({ id: z.string().min(1), patch: z.record(z.string(), z.unknown()) }),
        permissions: updateConnection,
        scopes: ['connections:write'],
        actors: ['user', 'automation'],
        handler: async (ctx, input) => {
            const updated = await ctx.services.db.connections.update(ctx.organizationId, input.id, input.patch as any);
            await ctx.services.db.syncOperations.enqueue({
                organizationId: ctx.organizationId,
                entityType: 'connection',
                entityId: input.id,
                operation: 'update',
                payload: input.patch,
            });
            return updated;
        },
    }),
    defineWebAction({
        id: 'connection.delete',
        domain: 'connection',
        kind: 'command',
        risk: 'destructive',
        inputSchema: z.object({ id: z.string().min(1) }),
        permissions: deleteConnection,
        scopes: ['connections:write'],
        actors: ['user'],
        handler: async (ctx, input) => {
            await ctx.services.db.connections.delete(ctx.organizationId, input.id);
            await ctx.services.db.syncOperations.enqueue({
                organizationId: ctx.organizationId,
                entityType: 'connection',
                entityId: input.id,
                operation: 'delete',
                payload: { id: input.id },
            });
            return { deleted: [input.id] };
        },
    }),
    defineWebAction({
        id: 'connection.test',
        domain: 'connection',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ payload: z.any() }),
        permissions: readConnection,
        scopes: ['connections:read'],
        actors: ['user', 'automation'],
        handler: (ctx, input) => testConnectService(ctx.organizationId, input.payload),
    }),
    defineWebAction({
        id: 'connection.connect',
        domain: 'connection',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['connections:read'],
        actors: ['user', 'automation'],
        handler: async (ctx, input) => {
            const startedAt = Date.now();
            const { entry, identity, config } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, input.connectionId, input.identityId ?? null);
            const health = await entry.instance.ping();
            const tookMs = typeof health?.tookMs === 'number' ? health.tookMs : Date.now() - startedAt;
            await ctx.services.db.connections.updateLastCheck(input.connectionId, {
                status: 'ok',
                tookMs,
                error: null,
                checkedAt: new Date(),
                organizationId: ctx.organizationId,
            });
            return {
                connectionId: config.id,
                identityId: identity.id ?? null,
                status: 'Connected',
                lastCheckStatus: 'ok',
                lastCheckAt: new Date().toISOString(),
                lastCheckLatencyMs: tookMs,
                lastCheckError: null,
            };
        },
    }),
    defineWebAction({
        id: 'schema.listDatabases',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: connectionIdInput,
        permissions: readConnection,
        scopes: ['connections:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_list_databases',
            title: 'List databases',
            description: 'List databases for a Dory connection.',
        },
        handler: (ctx, input) => listDatabasesOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
    }),
    defineWebAction({
        id: 'schema.listTables',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['connections:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_list_tables',
            title: 'List tables',
            description: 'List tables for a database in a Dory connection.',
        },
        handler: (ctx, input) => listTablesOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
    }),
    defineWebAction({
        id: 'schema.listSchemas',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'automation'],
        handler: async (ctx, input) => {
            const connectionId = resolveConnectionId(ctx, input);
            const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
            if (!entry.instance.capabilities.metadata?.getSchemas) return [];
            return await entry.instance.listSchemas(input.database);
        },
    }),
    defineWebAction({
        id: 'schema.get',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().optional(), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'automation'],
        handler: async (ctx, input) => {
            const connectionId = resolveConnectionId(ctx, input);
            const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
            return { ok: true, schema: await entry.instance.getSchema(input.database) };
        },
    }),
    defineWebAction({
        id: 'schema.listViews',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'automation'],
        handler: async (ctx, input) => {
            const connectionId = resolveConnectionId(ctx, input);
            const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
            return { views: await entry.instance.listViews(input.database) };
        },
    }),
    defineWebAction({
        id: 'schema.listMaterializedViews',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'automation'],
        handler: async (ctx, input) => {
            const connectionId = resolveConnectionId(ctx, input);
            const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
            return { materializedViews: await entry.instance.listMaterializedViews(input.database).catch(() => []) };
        },
    }),
    defineWebAction({
        id: 'schema.listFunctions',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1).optional(), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'automation'],
        handler: async (ctx, input) => {
            const connectionId = resolveConnectionId(ctx, input);
            const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
            return { functions: await entry.instance.listFunctions(input.database).catch(() => []) };
        },
    }),
    defineWebAction({
        id: 'schema.getFunctionDetail',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            database: z.string().min(1),
            functionName: z.string().min(1),
            schema: z.string().optional().nullable(),
            identityId: z.string().min(1).optional(),
        }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'automation'],
        handler: async (ctx, input) => {
            const connectionId = resolveConnectionId(ctx, input);
            const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
            return { function: await entry.instance.getFunctionDetail(input.database, input.functionName, input.schema ?? null) };
        },
    }),
    defineWebAction({
        id: 'schema.listSequences',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1).optional(), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'automation'],
        handler: async (ctx, input) => {
            const connectionId = resolveConnectionId(ctx, input);
            const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
            return { sequences: await entry.instance.listSequences(input.database).catch(() => []) };
        },
    }),
    defineWebAction({
        id: 'schema.listExtensions',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1).optional(), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'automation'],
        handler: async (ctx, input) => {
            const connectionId = resolveConnectionId(ctx, input);
            const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
            return { extensions: await entry.instance.listExtensions(input.database).catch(() => []) };
        },
    }),
    defineWebAction({
        id: 'schema.describeTable',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), table: z.string().min(1), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['connections:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_describe_table',
            title: 'Describe table',
            description: 'Return column metadata for a table in a Dory connection.',
        },
        handler: (ctx, input) => describeTableOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
    }),
    defineWebAction({
        id: 'schema.search',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            query: z.string(),
            database: z.string().min(1).optional(),
            limit: z.number().int().positive().max(100).optional(),
            includeColumns: z.boolean().optional(),
            identityId: z.string().min(1).optional(),
        }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_search_schema',
            title: 'Search schema',
            description: 'Search tables, views, and columns by name, type, or comment.',
        },
        handler: (ctx, input) => searchSchemaOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
    }),
    defineWebAction({
        id: 'schema.getDatabaseSummary',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            database: z.string().min(1),
            catalog: z.string().min(1).optional(),
            schema: z.string().min(1).optional(),
            identityId: z.string().min(1).optional(),
        }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_get_database_summary',
            title: 'Get database summary',
            description: 'Return a compact database summary for a Dory connection.',
        },
        handler: (ctx, input) => getDatabaseSummaryOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
    }),
    defineWebAction({
        id: 'table.getProfile',
        domain: 'table',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), table: z.string().min(1), identityId: z.string().min(1).optional() }),
        permissions: readConnection,
        scopes: ['schema:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_get_table_profile',
            title: 'Get table profile',
            description: 'Return metadata, stats, indexes, properties, and DDL for a table when supported.',
        },
        handler: (ctx, input) => getTableProfileOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
    }),
    ...(['indexes', 'properties', 'stats', 'ddl'] as const).map(part =>
        defineWebAction<any, any>({
            id: `table.get${part[0].toUpperCase()}${part.slice(1)}` as any,
            domain: 'table',
            kind: 'query',
            risk: 'read',
            inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), table: z.string().min(1), identityId: z.string().min(1).optional() }),
            permissions: readConnection,
            scopes: ['schema:read'],
            actors: ['user', 'agent', 'automation'],
            handler: async (ctx, input) => {
                const profile = await getTableProfileOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input);
                return { [part]: (profile as any)[part] ?? (part === 'indexes' ? [] : null) };
            },
        }),
    ),
    defineWebAction({
        id: 'table.preview',
        domain: 'table',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            database: z.string().min(1),
            table: z.string().min(1),
            limit: z.number().int().positive().max(1000).optional(),
            offset: z.number().int().min(0).optional(),
            identityId: z.string().min(1).optional(),
        }),
        permissions: readConnection,
        scopes: ['query:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_preview_table',
            title: 'Preview table',
            description: 'Preview rows from a table with a hard row limit.',
        },
        handler: (ctx, input) =>
            previewTableOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), {
                ...input,
                source: ctx.actor.type === 'mcp' ? 'mcp-table-preview' : ctx.actor.type === 'agent' ? 'chat-table-preview' : 'user-table-preview',
            }),
    }),
    defineWebAction({
        id: 'query.execute',
        domain: 'query',
        kind: 'command',
        risk: 'write',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            identityId: z.string().min(1).optional(),
            database: z.string().optional().nullable(),
            sql: z.string(),
            stopOnError: z.boolean().optional(),
            sessionId: z.string().optional(),
            tabId: z.string().optional(),
            source: z.string().optional(),
            refId: z.string().optional(),
        }),
        outputSchema: queryExecutionOutputSchema,
        permissions: writeWorkspace,
        scopes: ['query:write'],
        actors: ['user', 'automation'],
        audit: {
            sourceByActor: {
                user: 'user_sql_console',
                automation: 'automation_sql',
            },
            allowInputFields: ['connectionId', 'identityId', 'database', 'sessionId', 'tabId', 'source', 'refId'],
            inputSummary: input => ({
                connectionId: input.connectionId ?? null,
                identityId: input.identityId ?? null,
                database: input.database ?? null,
                sessionId: input.sessionId ?? null,
                tabId: input.tabId ?? null,
                source: input.source ?? null,
                refId: input.refId ?? null,
                sqlLength: input.sql.length,
            }),
            resource: (_ctx, input) => ({
                type: 'connection',
                id: input.connectionId ?? null,
                metadata: {
                    database: input.database ?? null,
                },
            }),
            outputSummary: output => ({
                status: (output as any).session?.status ?? null,
                resultSetCount: (output as any).session?.resultSetCount ?? null,
            }),
        },
        handler: executeSqlAction,
    }),
    defineWebAction({
        id: 'query.readOnlyExecute',
        domain: 'query',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            database: z.string().optional().nullable(),
            sql: z.string().min(1),
            limit: z.number().int().positive().max(1000).optional(),
            identityId: z.string().min(1).optional(),
        }),
        outputSchema: queryExecutionOutputSchema,
        permissions: readConnection,
        scopes: ['query:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        audit: {
            sourceByActor: {
                user: 'ai_sql_runner',
                agent: 'ai_sql_runner',
                mcp: 'mcp_sql_runner',
                automation: 'automation_sql',
            },
            allowInputFields: ['connectionId', 'identityId', 'database', 'limit'],
            inputSummary: input => ({
                connectionId: input.connectionId ?? null,
                identityId: input.identityId ?? null,
                database: input.database ?? null,
                limit: input.limit ?? null,
                sqlLength: input.sql.length,
            }),
            resource: (_ctx, input) => ({
                type: 'connection',
                id: input.connectionId ?? null,
                metadata: {
                    database: input.database ?? null,
                },
            }),
            outputSummary: output => ({
                resultSetCount: (output as any).session?.resultSetCount ?? null,
                totalSets: (output as any).meta?.totalSets ?? null,
            }),
        },
        mcp: {
            name: 'dory_run_readonly_sql',
            title: 'Run read-only SQL',
            description: 'Run read-only SQL against a Dory connection. Write statements are rejected.',
        },
        handler: (ctx, input) =>
            runReadonlySqlOperation(actionOperationContext(ctx), {
                ...input,
                source: ctx.actor.type === 'mcp' ? 'mcp' : 'ai',
            }),
    }),
    defineWebAction({
        id: 'query.cancel',
        domain: 'query',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), sessionId: z.string().min(1), identityId: z.string().min(1).optional() }),
        permissions: writeWorkspace,
        scopes: ['query:write'],
        actors: ['user', 'automation'],
        handler: async (ctx, input) => {
            const connectionId = resolveConnectionId(ctx, input);
            const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
            if (typeof entry.instance.cancelQuery !== 'function') {
                throw new Error('Cancel is not supported by this connection.');
            }
            await entry.instance.cancelQuery(input.sessionId);
            return { ok: true };
        },
    }),
    defineWebAction({
        id: 'query.auditSearch',
        domain: 'query',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            sources: z.array(z.enum(querySources as [QuerySource, ...QuerySource[]])).optional(),
            statuses: z.array(z.enum(queryStatuses as [QueryStatus, ...QueryStatus[]])).optional(),
            userId: z.string().optional(),
            connectionId: z.string().optional(),
            databaseName: z.string().optional(),
            chatId: z.string().optional(),
            q: z.string().optional(),
            cursor: z.string().optional(),
            limit: z.number().int().positive().max(200).optional(),
            offset: z.number().int().min(0).optional(),
        }),
        permissions: readWorkspace,
        scopes: ['query:read'],
        actors: ['user', 'agent', 'automation'],
        handler: (ctx, input) =>
            ctx.services.db.audit.search({
                organizationId: ctx.organizationId,
                from: input.from,
                to: input.to,
                sources: input.sources,
                statuses: input.statuses,
                userId: input.userId,
                connectionId: input.connectionId,
                databaseName: input.databaseName,
                chatId: input.chatId,
                q: input.q,
                cursor: input.cursor,
                limit: input.limit ?? 50,
                offset: input.offset,
            }),
    }),
    defineWebAction({
        id: 'tab.list',
        domain: 'tab',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional() }),
        permissions: readWorkspace,
        scopes: ['tabs:read'],
        actors: ['user', 'automation'],
        handler: (ctx, input) => ctx.services.db.tabState.loadAllTab(ctx.userId, resolveConnectionId(ctx, input)),
    }),
    defineWebAction({
        id: 'tab.save',
        domain: 'tab',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), tabId: z.string().min(1), state: z.any(), resultMeta: z.any().optional().nullable() }),
        permissions: writeWorkspace,
        scopes: ['tabs:write'],
        actors: ['user', 'automation'],
        handler: async (ctx, input) => {
            const isTable = input.state.tabType === 'table';
            await ctx.services.db.tabState.saveTabState({
                tabId: input.tabId,
                userId: ctx.userId,
                connectionId: resolveConnectionId(ctx, input),
                state: {
                    content: isTable ? '' : input.state.content || null,
                    databaseName: isTable ? input.state.databaseName : (input.state.databaseName ?? null),
                    tableName: isTable ? input.state.tableName : (input.state.tableName ?? null),
                    activeSubTab: isTable ? (input.state.activeSubTab ?? 'data') : (input.state.activeSubTab ?? null),
                    tabType: input.state.tabType ?? input.state.type,
                    tabName: input.state.tabName ?? null,
                    orderIndex: input.state.orderIndex,
                    createdAt: input.state.createdAt,
                },
                resultMeta: input.resultMeta ?? input.state.resultMeta ?? null,
            });
            if (typeof input.state.tabName === 'string') {
                await ctx.services.db.tabState.updateTabName({
                    tabId: input.tabId,
                    userId: ctx.userId,
                    connectionId: resolveConnectionId(ctx, input),
                    newName: input.state.tabName,
                });
            }
            return { ok: true };
        },
    }),
    defineWebAction({
        id: 'tab.delete',
        domain: 'tab',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), tabId: z.string().min(1) }),
        permissions: writeWorkspace,
        scopes: ['tabs:write'],
        actors: ['user', 'automation'],
        handler: async (ctx, input) => {
            await ctx.services.db.tabState.deleteTabState(input.tabId, ctx.userId, resolveConnectionId(ctx, input));
            return { deleted: [input.tabId] };
        },
    }),
    defineWebAction({
        id: 'savedQuery.list',
        domain: 'savedQuery',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), limit: z.number().int().positive().optional(), includeArchived: z.boolean().optional() }),
        permissions: readWorkspace,
        scopes: ['saved_queries:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_list_saved_queries',
            title: 'List saved queries',
            description: 'List saved SQL queries for a Dory connection.',
        },
        handler: (ctx, input) => listSavedQueriesOperation(actionOperationContext(ctx), input),
    }),
    defineWebAction({
        id: 'savedQuery.get',
        domain: 'savedQuery',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1), includeArchived: z.boolean().optional() }),
        permissions: readWorkspace,
        scopes: ['saved_queries:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_get_saved_query',
            title: 'Get saved query',
            description: 'Get a saved SQL query by id for a Dory connection.',
        },
        handler: (ctx, input) => getSavedQueryOperation(actionOperationContext(ctx), input),
    }),
    defineWebAction({
        id: 'savedQuery.create',
        domain: 'savedQuery',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            id: z.string().optional(),
            title: z.string().min(1),
            description: z.string().optional().nullable(),
            folderId: z.string().optional().nullable(),
            sqlText: z.string().min(1),
            context: z.record(z.string(), z.unknown()).optional().nullable(),
            tags: z.array(z.string()).optional().nullable(),
            workId: z.string().optional().nullable(),
        }),
        permissions: writeWorkspace,
        scopes: ['saved_queries:write'],
        actors: ['user', 'automation'],
        handler: (ctx, input) =>
            ctx.services.db.savedQueries.create({
                ...input,
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                connectionId: resolveConnectionId(ctx, input),
            }),
    }),
    defineWebAction({
        id: 'savedQuery.update',
        domain: 'savedQuery',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1), patch: z.record(z.string(), z.unknown()) }),
        permissions: writeWorkspace,
        scopes: ['saved_queries:write'],
        actors: ['user', 'automation'],
        handler: (ctx, input) =>
            ctx.services.db.savedQueries.update({
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                id: input.id,
                connectionId: resolveConnectionId(ctx, input),
                patch: input.patch as any,
            }),
    }),
    defineWebAction({
        id: 'savedQuery.delete',
        domain: 'savedQuery',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1) }),
        permissions: writeWorkspace,
        scopes: ['saved_queries:write'],
        actors: ['user', 'automation'],
        handler: async (ctx, input) => {
            await ctx.services.db.savedQueries.delete({ organizationId: ctx.organizationId, userId: ctx.userId, id: input.id, connectionId: resolveConnectionId(ctx, input) });
            return { deleted: [input.id] };
        },
    }),
    defineWebAction({
        id: 'savedQuery.reorder',
        domain: 'savedQuery',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), folderId: z.string().nullable().optional(), orderedIds: z.array(z.string()) }),
        permissions: writeWorkspace,
        scopes: ['saved_queries:write'],
        actors: ['user', 'automation'],
        handler: async (ctx, input) => {
            await ctx.services.db.savedQueries.reorder({
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                connectionId: resolveConnectionId(ctx, input),
                folderId: input.folderId ?? null,
                orderedIds: input.orderedIds,
            });
            return { ok: true };
        },
    }),
    defineWebAction({
        id: 'savedQuery.listFolders',
        domain: 'savedQuery',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({ connectionId: z.string().min(1).optional() }),
        permissions: readWorkspace,
        scopes: ['saved_queries:read'],
        actors: ['user', 'automation'],
        handler: (ctx, input) => ctx.services.db.savedQueryFolders.list({ organizationId: ctx.organizationId, userId: ctx.userId, connectionId: resolveConnectionId(ctx, input) }),
    }),
    defineWebAction({
        id: 'savedQuery.createFolder',
        domain: 'savedQuery',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), name: z.string().min(1).max(100) }),
        permissions: writeWorkspace,
        scopes: ['saved_queries:write'],
        actors: ['user', 'automation'],
        handler: (ctx, input) =>
            ctx.services.db.savedQueryFolders.create({
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                connectionId: resolveConnectionId(ctx, input),
                name: input.name,
            }),
    }),
    defineWebAction({
        id: 'savedQuery.updateFolder',
        domain: 'savedQuery',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1), patch: z.object({ name: z.string().min(1).max(100).optional() }) }),
        permissions: writeWorkspace,
        scopes: ['saved_queries:write'],
        actors: ['user', 'automation'],
        handler: (ctx, input) =>
            ctx.services.db.savedQueryFolders.update({
                id: input.id,
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                connectionId: resolveConnectionId(ctx, input),
                patch: input.patch,
            }),
    }),
    defineWebAction({
        id: 'savedQuery.deleteFolder',
        domain: 'savedQuery',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1) }),
        permissions: writeWorkspace,
        scopes: ['saved_queries:write'],
        actors: ['user', 'automation'],
        handler: async (ctx, input) => {
            await ctx.services.db.savedQueryFolders.delete({ id: input.id, organizationId: ctx.organizationId, userId: ctx.userId, connectionId: resolveConnectionId(ctx, input) });
            return { deleted: [input.id] };
        },
    }),
    defineWebAction({
        id: 'savedQuery.reorderFolders',
        domain: 'savedQuery',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ connectionId: z.string().min(1).optional(), orderedIds: z.array(z.string()) }),
        permissions: writeWorkspace,
        scopes: ['saved_queries:write'],
        actors: ['user', 'automation'],
        handler: async (ctx, input) => {
            await ctx.services.db.savedQueryFolders.reorder({
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                connectionId: resolveConnectionId(ctx, input),
                orderedIds: input.orderedIds,
            });
            return { ok: true };
        },
    }),
    defineWebAction({
        id: 'chart.buildResultContext',
        domain: 'chart',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({
            sessionId: z.string().min(1),
            setIndex: z.number().int().min(0).default(0),
            sqlText: z.string().optional(),
            databaseName: z.string().nullable().optional(),
            rowCount: z.number().int().min(0).optional(),
            columns: z.array(z.record(z.string(), z.unknown())).optional(),
            stats: z.record(z.string(), z.unknown()).nullable().optional(),
        }),
        permissions: readWorkspace,
        scopes: ['analysis:run'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_build_result_context',
            title: 'Build Dory result context',
            description: 'Build Dory analysis result context from SQL result metadata.',
        },
        handler: (_ctx, input) => buildResultContextOperation(input),
    }),
    defineWebAction({
        id: 'chart.buildChartProfile',
        domain: 'chart',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({
            rows: z.array(z.record(z.string(), z.unknown())),
            columns: z.unknown().optional(),
            stats: z.record(z.string(), z.unknown()).nullable().optional(),
            overrides: z.record(z.string(), z.unknown()).optional(),
        }),
        permissions: readWorkspace,
        scopes: ['analysis:run'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_build_chart_profile',
            title: 'Build Dory chart profile',
            description: 'Build Dory automatic chart profile from result rows and columns.',
        },
        handler: (_ctx, input) => buildChartProfileOperation(input),
    }),
    defineWebAction({
        id: 'chart.runAnalysis',
        domain: 'chart',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            databaseName: z.string().nullable().optional(),
            resultRef: z.object({ sessionId: z.string().min(1), setIndex: z.number().int().min(0) }),
            resultContext: z.record(z.string(), z.unknown()),
            insight: z.record(z.string(), z.unknown()),
            trigger: z.record(z.string(), z.unknown()),
            tabId: z.string().min(1).optional(),
            identityId: z.string().min(1).optional(),
        }),
        permissions: readWorkspace,
        scopes: ['analysis:run'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_run_analysis',
            title: 'Run Dory analysis',
            description: 'Run a Dory analysis insight for a SQL result context.',
        },
        handler: (ctx, input) => runAnalysisOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'ai_analysis')), input),
    }),
    defineWebAction({
        id: 'schema.getMonitoringSummary',
        domain: 'schema',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            filters: z.record(z.string(), z.unknown()).optional().nullable(),
            includeTimeline: z.boolean().optional(),
            includeSlowQueries: z.boolean().optional(),
            includeErrorQueries: z.boolean().optional(),
            pageSize: z.number().int().positive().max(100).optional(),
            identityId: z.string().min(1).optional(),
        }),
        permissions: readConnection,
        scopes: ['monitoring:read'],
        actors: ['user', 'agent', 'mcp', 'automation'],
        mcp: {
            name: 'dory_get_monitoring_summary',
            title: 'Get monitoring summary',
            description: 'Return query monitoring summary and query samples for a Dory connection.',
        },
        handler: (ctx, input) => getMonitoringSummaryOperation(actionOperationContext(ctx, ctx.actor.type === 'mcp' ? 'mcp_monitoring' : 'dory_monitoring'), input as any),
    }),
    defineWebAction({
        id: 'ai.schemaTags',
        domain: 'ai',
        kind: 'query',
        risk: 'low',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            columns: z.array(columnInputSchema).min(1),
            database: z.string().nullable().optional(),
            table: z.string().nullable().optional(),
            model: z.string().nullable().optional(),
            catalog: z.string().nullable().optional(),
            dbType: z.string().nullable().optional(),
        }),
        permissions: readWorkspace,
        scopes: ['analysis:run'],
        actors: ['user', 'agent', 'automation'],
        handler: runSchemaTagsAction,
    }),
    defineWebAction({
        id: 'ai.schemaExplanations',
        domain: 'ai',
        kind: 'query',
        risk: 'low',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            columns: z.array(columnInputSchema).min(1),
            database: z.string().nullable().optional(),
            table: z.string().nullable().optional(),
            model: z.string().nullable().optional(),
            catalog: z.string().nullable().optional(),
            dbType: z.string().nullable().optional(),
        }),
        permissions: readWorkspace,
        scopes: ['analysis:run'],
        actors: ['user', 'agent', 'automation'],
        handler: runSchemaExplanationsAction,
    }),
    defineWebAction({
        id: 'ai.tableSummary',
        domain: 'ai',
        kind: 'query',
        risk: 'low',
        inputSchema: z.object({
            connectionId: z.string().min(1).optional(),
            database: z.string().nullable().optional(),
            table: z.string().nullable().optional(),
            columns: z.array(columnInputSchema).optional(),
            properties: z.record(z.string(), z.unknown()).nullable().optional(),
            model: z.string().nullable().optional(),
            catalog: z.string().nullable().optional(),
            dbType: z.string().nullable().optional(),
            ignoreCache: z.boolean().optional(),
        }),
        permissions: readWorkspace,
        scopes: ['analysis:run'],
        actors: ['user', 'agent', 'automation'],
        handler: runTableSummaryAction,
    }),
    defineWebAction({
        id: 'ai.tableStatsInsights',
        domain: 'ai',
        kind: 'query',
        risk: 'low',
        inputSchema: z.object({
            stats: z.record(z.string(), z.unknown()).nullable(),
            database: z.string().nullable().optional(),
            table: z.string().nullable().optional(),
        }),
        permissions: readWorkspace,
        scopes: ['analysis:run'],
        actors: ['user', 'agent', 'automation'],
        handler: (ctx, input) => runTableStatsInsightsAction(ctx, input as any),
    }),
    defineWebAction({
        id: 'ai.tabTitle',
        domain: 'ai',
        kind: 'query',
        risk: 'low',
        inputSchema: z.object({
            sql: z.string(),
            database: z.string().nullable().optional(),
            model: z.string().nullable().optional(),
        }),
        permissions: readWorkspace,
        scopes: ['analysis:run'],
        actors: ['user', 'agent', 'automation'],
        handler: runTabTitleAction,
    }),
    defineWebAction({
        id: 'ai.resultInsights',
        domain: 'ai',
        kind: 'query',
        risk: 'low',
        inputSchema: z.record(z.string(), z.unknown()),
        permissions: readWorkspace,
        scopes: ['analysis:run'],
        actors: ['user', 'agent', 'automation'],
        handler: (ctx, input) => runResultInsightsAction(ctx, input),
    }),
    ...(['fix-sql-error', 'optimize-performance', 'rewrite-sql', 'to-aggregation'] as ActionIntent[]).map(intent =>
        defineWebAction<any, any>({
            id: `ai.${intent}` as const,
            domain: 'ai',
            kind: 'command',
            risk: 'low',
            inputSchema: z.object({ input: z.any(), model: z.string().nullable().optional() }),
            permissions: readWorkspace,
            scopes: ['analysis:run'],
            actors: ['user', 'agent', 'automation'],
            handler: async (ctx, input) => {
                const { runQuickActionServer } = await import('@/lib/copilot/action/server/runQuickActionServer');
                return runQuickActionServer(
                    intent,
                    { ...input.input, model: input.model ?? input.input?.model ?? null },
                    { locale: ctx.locale as any, organizationId: ctx.organizationId, userId: ctx.userId },
                );
            },
        }),
    ),
]);
