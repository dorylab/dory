import assert from 'node:assert/strict';
import test from 'node:test';

import { ActionRegistry, assertActionAllowed, defineAction, executeAction, listMcpActions } from '@dory/actions';
import type { ActionActorType, ActionContext, ActionId } from '@dory/actions';
import { getOrganizationPermissionMap } from '@/lib/auth/organization-ac';
import { webActionRegistry } from '@/lib/actions/server/registry';
import { z } from 'zod';

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
    scopes: string[] = ['connections:read', 'schema:read', 'query:read', 'query:write', 'saved_queries:read', 'saved_queries:write', 'analysis:run'],
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
    assert.deepEqual(await executeAction(registry, context(), 'connection.get', { id: 'conn' }), { id: 'conn' });
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

    assert.deepEqual(await executeAction(registry, context(), 'connection.list', {}), { connections: [{ id: 'conn' }] });
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

test('destructive actions require destructive scope and confirmation', async () => {
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

    await assert.rejects(() => executeAction(registry, context(['connections:write']), 'connection.delete', { id: 'conn' }), /action:destructive/);
    await assert.rejects(() => executeAction(registry, context(['connections:write', 'action:destructive']), 'connection.delete', { id: 'conn' }), /requires confirmation/);
    assert.deepEqual(await executeAction(registry, context(['connections:write', 'action:destructive']), 'connection.delete', { id: 'conn' }, { confirmationToken: 'confirm' }), {
        ok: true,
    });
});

test('MCP action listing hides destructive actions', () => {
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
        ['dory_list_connections'],
    );
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
    await assertAllowed('schema.search', roleContext('viewer', 'mcp', ['connections:read']), { query: 'users' });
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

    const output = await executeAction<{ connections: Array<Record<string, unknown>> }>(webActionRegistry as any, ctx, 'connection.list', {});

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
});
