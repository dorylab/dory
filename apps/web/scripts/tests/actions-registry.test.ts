import assert from 'node:assert/strict';
import test from 'node:test';

import { ActionRegistry, defineAction, executeAction, listMcpActions } from '@dory/actions';
import type { ActionContext } from '@dory/actions';
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
