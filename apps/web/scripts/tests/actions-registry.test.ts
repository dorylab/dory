import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { ActionError, ActionRegistry, assertActionAllowed, buildActionManifest, defineAction, executeAction, listMcpActions } from '@dory/actions';
import type { ActionActorType, ActionAuditRecord, ActionContext, ActionId } from '@dory/actions';
import { getOrganizationPermissionMap } from '@/lib/auth/organization-ac';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const { webActionRegistry } = await import('@/lib/actions/server/registry');
const { getPublicDoryMcpTools } = await import('@/lib/server/mcp/facade-tools');

const permissions = {
    organization: { read: true, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    invitation: { read: true, create: false, cancel: false },
    workspace: { read: true, write: false },
    connection: { read: true, create: false, update: false, delete: false },
};

function context(scopes: string[] = ['connections:read']): ActionContext {
    return {
        organizationId: 'org',
        userId: 'user',
        access: {
            isMember: true,
            permissions,
        },
        actor: {
            type: 'mcp',
            scopes,
        },
        services: {},
    };
}

function roleContext(
    role: 'viewer' | 'member' | 'admin' | 'owner',
    actorType: ActionActorType = 'user',
    scopes: string[] = ['connections:read', 'schema:read', 'query:read', 'query:write', 'tabs:read', 'tabs:write', 'saved_queries:read', 'saved_queries:write', 'analysis:run'],
): ActionContext {
    return {
        organizationId: 'org',
        userId: 'user',
        access: {
            isMember: true,
            role,
            permissions: getOrganizationPermissionMap(role),
        },
        actor: {
            type: actorType,
            scopes,
            id: actorType === 'mcp' ? 'token' : 'user',
        },
        services: {},
    };
}

async function assertAllowed(actionId: ActionId, ctx: ActionContext, input: unknown = {}) {
    const action = webActionRegistry.get(actionId);
    assert.ok(action, `Expected action ${actionId} to be registered.`);
    await assertActionAllowed(ctx, action, input, { confirmationToken: 'confirm' });
}

async function assertDenied(actionId: ActionId, ctx: ActionContext, pattern: RegExp, input: unknown = {}) {
    const action = webActionRegistry.get(actionId);
    assert.ok(action, `Expected action ${actionId} to be registered.`);
    await assert.rejects(() => assertActionAllowed(ctx, action, input, { confirmationToken: 'confirm' }), pattern);
}

function testAction(overrides: Partial<Parameters<typeof defineAction>[0]> = {}) {
    return defineAction({
        id: 'connection.list',
        version: 1,
        domain: 'connection',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        permission: {
            organization: [],
            scopes: [],
        },
        exposure: {
            actors: ['mcp'],
        },
        audit: {},
        handler: () => ({ ok: true }),
        ...overrides,
    } as any);
}

test('registry rejects duplicate action ids', () => {
    const registry = new ActionRegistry();
    const action = testAction();

    registry.register(action);
    assert.throws(() => registry.register(action), /Duplicate action id/);
});

test('registry requires output schemas and actor exposure', () => {
    const registry = new ActionRegistry();
    assert.throws(
        () =>
            registry.register({
                ...testAction(),
                outputSchema: undefined,
            } as any),
        /output schema/,
    );
    assert.throws(
        () =>
            registry.register({
                ...testAction(),
                exposure: { actors: [] },
            } as any),
        /actor exposure/,
    );
});

test('executeAction validates input and channel scopes', async () => {
    const registry = new ActionRegistry();
    registry.register(
        defineAction({
            id: 'connection.get',
            version: 1,
            domain: 'connection',
            kind: 'query',
            risk: 'read',
            inputSchema: z.object({ id: z.string().min(1) }),
            outputSchema: z.object({ id: z.string() }),
            permission: {
                scopes: ['connections:read'],
            },
            exposure: {
                actors: ['mcp'],
            },
            audit: {},
            handler: (_ctx, input) => ({ id: input.id }),
        }),
    );

    await assert.rejects(() => executeAction(registry, context([]), 'connection.get', { id: 'conn' }), /Missing action scope/);
    await assert.rejects(() => executeAction(registry, context(), 'connection.get', { id: '' }), /Invalid input/);
    assert.deepEqual((await executeAction(registry, context(), 'connection.get', { id: 'conn' })).data, { id: 'conn' });
});

test('executeAction applies actor projection schemas', async () => {
    const registry = new ActionRegistry();
    registry.register(
        defineAction({
            id: 'connection.list',
            version: 1,
            domain: 'connection',
            kind: 'query',
            risk: 'read',
            inputSchema: z.object({}),
            outputSchema: z.object({
                connections: z.array(z.object({ id: z.string(), secret: z.string() })),
            }),
            permission: {
                scopes: ['connections:read'],
            },
            exposure: {
                actors: ['mcp'],
                projections: {
                    mcp: {
                        schema: z.object({
                            connections: z.array(z.object({ id: z.string() })),
                        }),
                        project: output => ({
                            connections: output.connections.map(connection => ({ id: connection.id })),
                        }),
                    },
                },
            },
            audit: {},
            handler: () => ({ connections: [{ id: 'conn', secret: 'hidden' }] }),
        }),
    );

    assert.deepEqual((await executeAction(registry, context(), 'connection.list', {})).data, { connections: [{ id: 'conn' }] });
});

test('executeAction writes denied action audit events', async () => {
    const registry = new ActionRegistry();
    registry.register(
        defineAction({
            id: 'connection.get',
            version: 1,
            domain: 'connection',
            kind: 'query',
            risk: 'read',
            inputSchema: z.object({ id: z.string().min(1) }),
            outputSchema: z.object({ id: z.string() }),
            permission: {
                scopes: ['connections:read'],
            },
            exposure: {
                actors: ['mcp'],
            },
            audit: {
                allowInputFields: ['id'],
            },
            handler: (_ctx, input) => ({ id: input.id }),
        }),
    );
    const events: unknown[] = [];

    await assert.rejects(
        () =>
            executeAction(
                registry,
                {
                    ...context([]),
                    audit: {
                        record: event => {
                            events.push(event);
                        },
                    },
                },
                'connection.get',
                { id: 'conn' },
            ),
        /Missing action scope/,
    );

    assert.equal((events[0] as any).status, 'denied');
    assert.equal((events[0] as any).actionId, 'connection.get');
    assert.deepEqual((events[0] as any).redactedInputSummary, { id: 'conn' });
});

test('executeAction returns execution metadata and writes matching audit events', async () => {
    const registry = new ActionRegistry();
    registry.register(
        defineAction({
            id: 'connection.get',
            version: 1,
            domain: 'connection',
            kind: 'query',
            risk: 'read',
            inputSchema: z.object({ id: z.string().min(1) }),
            outputSchema: z.object({ id: z.string() }),
            permission: {
                scopes: ['connections:read'],
            },
            exposure: {
                actors: ['mcp'],
            },
            audit: {
                sourceByActor: {
                    mcp: 'mcp_connection_lookup',
                },
                allowInputFields: ['id'],
            },
            handler: (_ctx, input) => ({ id: input.id }),
        }),
    );
    const events: unknown[] = [];
    const ctx = {
        ...context(),
        requestId: 'request-1',
        actor: {
            ...context().actor,
            id: 'token-1',
        },
        audit: {
            record: (event: ActionAuditRecord) => {
                events.push(event);
            },
        },
    };

    const envelope = await executeAction<{ id: string }>(registry, ctx, 'connection.get', { id: 'conn' });

    assert.deepEqual(envelope.data, { id: 'conn' });
    assert.equal(envelope.execution.actionId, 'connection.get');
    assert.equal(envelope.execution.requestId, 'request-1');
    assert.equal(envelope.execution.actorType, 'mcp');
    assert.equal(envelope.execution.actorId, 'token-1');
    assert.equal(envelope.execution.source, 'mcp_connection_lookup');
    assert.equal(envelope.execution.status, 'success');
    assert.equal(envelope.execution.projection, 'mcp');
    assert.ok(envelope.execution.actionRunId);
    assert.ok(Date.parse(envelope.execution.startedAt));
    assert.ok(Date.parse(envelope.execution.finishedAt));
    assert.ok(envelope.execution.durationMs >= 0);

    assert.equal(events.length, 1);
    const event = events[0] as any;
    assert.equal(event.actionRunId, envelope.execution.actionRunId);
    assert.equal(event.createdAt, envelope.execution.finishedAt);
    assert.equal(event.durationMs, envelope.execution.durationMs);
    assert.equal(event.source, envelope.execution.source);
    assert.deepEqual(event.redactedInputSummary, { id: 'conn' });
});

test('executeAction writes invalid and error audit metadata', async () => {
    const registry = new ActionRegistry();
    registry.register(
        defineAction({
            id: 'connection.get',
            version: 1,
            domain: 'connection',
            kind: 'query',
            risk: 'read',
            inputSchema: z.object({ id: z.string().min(1) }),
            outputSchema: z.object({ id: z.string() }),
            permission: {
                scopes: ['connections:read'],
            },
            exposure: {
                actors: ['mcp'],
            },
            audit: {
                sourceByActor: {
                    mcp: 'mcp_connection_lookup',
                },
                allowInputFields: ['id'],
            },
            handler: (_ctx, input) => {
                throw new ActionError('ACTION_RESOURCE_FORBIDDEN', `failed ${input.id}`);
            },
        }),
    );
    const events: unknown[] = [];
    const ctx = {
        ...context(),
        audit: {
            record: (event: ActionAuditRecord) => {
                events.push(event);
            },
        },
    };

    await assert.rejects(() => executeAction(registry, ctx, 'connection.get', { id: '' }), /Invalid input/);
    await assert.rejects(() => executeAction(registry, ctx, 'connection.get', { id: 'conn' }), /failed conn/);

    assert.equal((events[0] as any).status, 'invalid');
    assert.equal((events[0] as any).errorCode, 'ACTION_INPUT_INVALID');
    assert.equal((events[0] as any).source, 'mcp_connection_lookup');
    assert.ok(Date.parse((events[0] as any).createdAt));

    assert.equal((events[1] as any).status, 'error');
    assert.equal((events[1] as any).errorCode, 'ACTION_RESOURCE_FORBIDDEN');
    assert.equal((events[1] as any).source, 'mcp_connection_lookup');
    assert.ok(Date.parse((events[1] as any).createdAt));
});

test('destructive actions require write scope and confirmation', async () => {
    const registry = new ActionRegistry();
    registry.register(
        defineAction({
            id: 'connection.delete',
            version: 1,
            domain: 'connection',
            kind: 'command',
            risk: 'destructive',
            inputSchema: z.object({ id: z.string() }),
            outputSchema: z.object({ ok: z.boolean() }),
            permission: {
                scopes: ['connections:write'],
                destructive: { requireConfirmation: true },
            },
            exposure: {
                actors: ['mcp'],
            },
            audit: {},
            handler: () => ({ ok: true }),
        }),
    );

    await assert.rejects(() => executeAction(registry, context(['read']), 'connection.delete', { id: 'conn' }), /Missing action scope "connections:write"/);
    await assert.rejects(() => executeAction(registry, context(['write']), 'connection.delete', { id: 'conn' }), /requires confirmation/);
    assert.deepEqual((await executeAction(registry, context(['write']), 'connection.delete', { id: 'conn' }, { confirmationToken: 'confirm' })).data, {
        ok: true,
    });
});

test('write actions must explicitly declare confirmation policy', async () => {
    const registry = new ActionRegistry();
    registry.register(
        defineAction({
            id: 'connection.update',
            version: 1,
            domain: 'connection',
            kind: 'command',
            risk: 'write',
            inputSchema: z.object({ id: z.string() }),
            outputSchema: z.object({ ok: z.boolean() }),
            permission: {
                scopes: ['connections:write'],
            },
            exposure: {
                actors: ['mcp'],
            },
            audit: {},
            handler: () => ({ ok: true }),
        }),
    );

    await assert.rejects(() => executeAction(registry, context(['connections:write']), 'connection.update', { id: 'conn' }), /confirmation policy/);
});

test('write actions honor explicit confirmation policy', async () => {
    const registry = new ActionRegistry();
    registry.register(
        defineAction({
            id: 'connection.update',
            version: 1,
            domain: 'connection',
            kind: 'command',
            risk: 'write',
            inputSchema: z.object({ id: z.string() }),
            outputSchema: z.object({ ok: z.boolean() }),
            permission: {
                scopes: ['connections:write'],
                confirmation: { required: true },
            },
            exposure: {
                actors: ['mcp'],
            },
            audit: {},
            handler: () => ({ ok: true }),
        }),
    );

    await assert.rejects(() => executeAction(registry, context(['connections:write']), 'connection.update', { id: 'conn' }), /requires confirmation/);
    assert.deepEqual((await executeAction(registry, context(['connections:write']), 'connection.update', { id: 'conn' }, { confirmationToken: 'confirm' })).data, {
        ok: true,
    });
});

test('MCP action listing includes destructive actions when explicitly exposed', () => {
    const registry = new ActionRegistry();
    registry.register(
        defineAction({
            id: 'connection.list',
            version: 1,
            domain: 'connection',
            kind: 'query',
            risk: 'read',
            inputSchema: z.object({}),
            outputSchema: z.object({ ok: z.boolean() }),
            permission: {},
            exposure: {
                actors: ['mcp'],
                mcp: { name: 'dory_list_connections', title: 'List', description: 'List' },
            },
            audit: {},
            handler: () => ({ ok: true }),
        }),
    );
    registry.register(
        defineAction({
            id: 'connection.delete',
            version: 1,
            domain: 'connection',
            kind: 'command',
            risk: 'destructive',
            inputSchema: z.object({ id: z.string() }),
            outputSchema: z.object({ ok: z.boolean() }),
            permission: {},
            exposure: {
                actors: ['mcp'],
                mcp: { name: 'dory_delete_connection', title: 'Delete', description: 'Delete' },
            },
            audit: {},
            handler: () => ({ ok: true }),
        }),
    );

    assert.deepEqual(
        listMcpActions(registry)
            .map(item => item.name)
            .sort(),
        ['dory_delete_connection', 'dory_list_connections'],
    );
});

test('MCP public catalog exposes only high-level facade tools', () => {
    const publicTools = getPublicDoryMcpTools()
        .map((tool: any) => tool.name)
        .sort();

    assert.deepEqual(publicTools, [
        'dory_analyze_database_changes',
        'dory_compare_schema',
        'dory_create_work',
        'dory_explore_schema',
        'dory_finish_work',
        'dory_get_schema_graph',
        'dory_list_connections',
        'dory_read',
        'dory_run_readonly_sql',
        'dory_saved_queries',
        'dory_workspace_tabs',
        'dory_write',
    ]);
    assert.equal(publicTools.includes('dory_create_tab'), false);
    assert.equal(publicTools.includes('dory_save_tab'), false);
    assert.equal(publicTools.includes('dory_create_saved_query'), false);
    assert.equal(publicTools.includes('dory_generate_table_summary'), false);
});

test('web registry keeps the shared non-destructive action catalog available internally to Agent and MCP actors', () => {
    const scopes = ['connections:read', 'schema:read', 'query:read', 'tabs:read', 'tabs:write', 'saved_queries:read', 'saved_queries:write', 'analysis:run', 'monitoring:read'];
    const access = roleContext('member').access;
    const agentTools = listMcpActions(webActionRegistry as any, 'agent', { scopes, access })
        .map(item => item.name)
        .sort();
    const mcpTools = listMcpActions(webActionRegistry as any, 'mcp', { scopes, access })
        .map(item => item.name)
        .sort();

    assert.deepEqual(agentTools, mcpTools);
    assert.ok(mcpTools.includes('dory_get_connection'));
    assert.ok(mcpTools.includes('dory_search_query_audit'));
    assert.ok(mcpTools.includes('dory_generate_table_summary'));
    assert.ok(mcpTools.includes('dory_create_saved_query'));
    assert.ok(mcpTools.includes('dory_save_tab'));
    assert.equal(mcpTools.includes('dory_execute_sql'), false);
    assert.equal(mcpTools.includes('dory_test_connection'), false);
});

test('internal MCP action listing still filters tools by token scopes and organization permissions', () => {
    const access = roleContext('member').access;
    const readOnlySavedQueryTools = listMcpActions(webActionRegistry as any, 'mcp', {
        scopes: ['connections:read', 'schema:read', 'query:read', 'tabs:read', 'saved_queries:read', 'analysis:run', 'monitoring:read'],
        access,
    }).map(item => item.name);
    assert.ok(readOnlySavedQueryTools.includes('dory_list_saved_queries'));
    assert.ok(readOnlySavedQueryTools.includes('dory_list_saved_query_folders'));
    assert.equal(readOnlySavedQueryTools.includes('dory_create_saved_query'), false);
    assert.equal(readOnlySavedQueryTools.includes('dory_save_tab'), false);

    const viewerTools = listMcpActions(webActionRegistry as any, 'mcp', {
        scopes: ['connections:read', 'schema:read', 'query:read', 'tabs:read', 'tabs:write', 'saved_queries:read', 'saved_queries:write', 'analysis:run', 'monitoring:read'],
        access: roleContext('viewer').access,
    }).map(item => item.name);
    assert.equal(viewerTools.includes('dory_create_saved_query'), false);
    assert.equal(viewerTools.includes('dory_create_tab'), false);
    assert.ok(viewerTools.includes('dory_list_connections'));
});

test('web registry enforces role and actor permission matrix', async () => {
    await assertAllowed('query.readOnlyExecute', roleContext('viewer'), { sql: 'select 1' });
    await assertDenied('query.execute', roleContext('viewer'), /Missing permission workspace:write/, { sql: 'select 1' });

    await assertAllowed('query.execute', roleContext('member'), { sql: 'select 1' });
    await assertDenied('connection.create', roleContext('member', 'user', ['connections:write']), /Missing permission connection:create/, { payload: {} });

    await assertAllowed('connection.create', roleContext('admin', 'user', ['connections:write']), { payload: {} });
    await assertAllowed('connection.create', roleContext('owner', 'user', ['connections:write']), { payload: {} });

    await assertDenied('query.execute', roleContext('member', 'agent', ['query:write']), /Actor type "agent" is not allowed/, { sql: 'select 1' });
    await assertDenied('query.execute', roleContext('member', 'mcp', ['query:write']), /Actor type "mcp" is not allowed/, { sql: 'select 1' });
    await assertAllowed('connection.create', roleContext('owner', 'mcp', ['connections:write']), { payload: {} });
    await assertAllowed('connection.create', roleContext('owner', 'mcp', ['write']), { payload: {} });
    await assertDenied('connection.create', roleContext('member', 'mcp', ['connections:write']), /Missing permission connection:create/, { payload: {} });
    await assertDenied('connection.create', roleContext('owner', 'mcp', ['read']), /Missing action scope "connections:write"/, { payload: {} });
    await assertDenied('connection.create', roleContext('owner', 'mcp', ['connections:read']), /Missing action scope "connections:write"/, { payload: {} });
    await assertAllowed('schema.search', roleContext('viewer', 'mcp', ['connections:read']), { query: 'users' });
    await assertAllowed('schema.search', roleContext('viewer', 'mcp', ['read']), { query: 'users' });
    await assertAllowed('schema.search', roleContext('viewer', 'mcp', ['write']), { query: 'users' });
    await assertAllowed('schema.getGraph', roleContext('viewer', 'mcp', ['schema:read']), { database: 'app' });
    await assertDenied('schema.getGraph', roleContext('viewer', 'mcp', ['connections:write']), /Missing action scope "schema:read"/, { database: 'app' });
    await assertAllowed('connection.delete', roleContext('owner', 'user', ['write']), { id: 'conn' });
    await assertAllowed('connection.delete', roleContext('owner', 'mcp', ['write']), { id: 'conn' });
    await assertDenied('connection.delete', roleContext('owner', 'mcp', ['read']), /Missing action scope "connections:write"/, { id: 'conn' });
    await assertDenied('tab.create', roleContext('viewer', 'user', ['tabs:write']), /Missing permission workspace:write/, { connectionId: 'conn', tabType: 'sql' });
    await assertAllowed('tab.create', roleContext('member', 'user', ['tabs:write']), { connectionId: 'conn', tabType: 'sql' });
    await assertAllowed('tab.create', roleContext('member', 'agent', ['tabs:write']), { connectionId: 'conn', tabType: 'sql' });
    await assertAllowed('tab.create', roleContext('member', 'mcp', ['tabs:write']), { connectionId: 'conn', tabType: 'sql' });
});

test('web action manifest exposes tab.create as a single action contract across adapters', () => {
    const manifest = buildActionManifest(webActionRegistry, new Date('2026-06-01T00:00:00.000Z'));
    const tabCreate = manifest.actions.find(action => action.id === 'tab.create');

    assert.ok(tabCreate);
    assert.equal(tabCreate.version, 1);
    assert.equal(tabCreate.domain, 'tab');
    assert.equal(tabCreate.kind, 'command');
    assert.equal(tabCreate.requiresConfirmation, false);
    assert.deepEqual(tabCreate.requiredScopes, ['tabs:write']);
    assert.deepEqual(tabCreate.allowedActors, ['user', 'agent', 'mcp', 'automation']);
    assert.equal(tabCreate.mcp?.name, 'dory_create_tab');
});

test('web action manifest exposes schema.getGraph to agents, MCP, and automation', () => {
    const manifest = buildActionManifest(webActionRegistry, new Date('2026-06-01T00:00:00.000Z'));
    const schemaGraph = manifest.actions.find(action => action.id === 'schema.getGraph');

    assert.ok(schemaGraph);
    assert.equal(schemaGraph.kind, 'query');
    assert.equal(schemaGraph.risk, 'read');
    assert.deepEqual(schemaGraph.requiredScopes, ['schema:read']);
    assert.deepEqual(schemaGraph.allowedActors, ['user', 'agent', 'mcp', 'automation']);
    assert.equal(schemaGraph.mcp?.name, 'dory_get_schema_graph');
});

test('web registry projects connection.list for MCP without leaking canonical connection shape', async () => {
    const fakeConnection = {
        connection: {
            id: 'conn-1',
            name: 'Warehouse',
            type: 'postgres',
            engine: 'postgres',
            database: 'analytics',
            status: 'active',
            environment: 'prod',
            lastCheckStatus: 'ok',
        },
        identities: [
            {
                id: 'identity-1',
                name: 'Analyst',
                username: 'analyst',
                isDefault: true,
                database: 'analytics',
                password: 'hidden',
            },
        ],
        ssh: {
            host: 'bastion.example.com',
            privateKey: 'hidden',
        },
    };
    const baseContext = roleContext('viewer', 'mcp', ['connections:read']);
    const ctx = {
        ...baseContext,
        services: {
            db: {
                connections: {
                    list: async () => [fakeConnection],
                },
            },
        },
    } as ActionContext<any>;

    const { data: output } = await executeAction<{ connections: Array<Record<string, unknown>> }>(webActionRegistry as any, ctx, 'connection.list', {});
    const { data: getOutput } = await executeAction<{ connection: Record<string, unknown> }>(
        webActionRegistry as any,
        {
            ...baseContext,
            services: {
                db: {
                    connections: {
                        getById: async () => fakeConnection,
                    },
                },
            },
        } as ActionContext<any>,
        'connection.get',
        { id: 'conn-1' },
    );

    assert.deepEqual(output, {
        connections: [
            {
                id: 'conn-1',
                name: 'Warehouse',
                type: 'postgres',
                engine: 'postgres',
                database: 'analytics',
                status: 'active',
                environment: 'prod',
                lastCheckStatus: 'ok',
                identities: [
                    {
                        id: 'identity-1',
                        name: 'Analyst',
                        username: 'analyst',
                        isDefault: true,
                        database: 'analytics',
                    },
                ],
            },
        ],
    });
    assert.equal('connection' in output.connections[0]!, false);
    assert.equal('ssh' in output.connections[0]!, false);
    assert.deepEqual(getOutput, {
        connection: output.connections[0],
    });
    assert.equal('connection' in getOutput.connection, false);
    assert.equal('ssh' in getOutput.connection, false);
    assert.equal(JSON.stringify(getOutput).includes('hidden'), false);
});
