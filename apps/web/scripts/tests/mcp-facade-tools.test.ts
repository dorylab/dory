import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { ActionContext } from '@dory/actions';
import { getOrganizationPermissionMap } from '@/lib/auth/organization-ac';
import type { WebActionServices } from '@/lib/actions/server/types';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const { getPublicDoryMcpTools } = await import('@/lib/server/mcp/facade-tools');

function getTool(name: string) {
    const tool = getPublicDoryMcpTools().find((item: any) => item.name === name);
    assert.ok(tool, `Expected MCP facade tool ${name}`);
    return tool;
}

function createContext(
    services: WebActionServices,
    scopes: string[] = ['connections:read', 'schema:read', 'query:read', 'tabs:read', 'tabs:write', 'saved_queries:read', 'saved_queries:write'],
): ActionContext<WebActionServices> {
    return {
        organizationId: 'org-1',
        userId: 'user-1',
        access: {
            isMember: true,
            role: 'member',
            permissions: getOrganizationPermissionMap('member'),
        },
        actor: {
            type: 'mcp',
            scopes,
            id: 'token-1',
        },
        requestId: 'request-1',
        services,
    };
}

test('public Dory MCP catalog is limited to high-level facade tools', () => {
    assert.deepEqual(
        getPublicDoryMcpTools()
            .map((tool: any) => tool.name)
            .sort(),
        ['dory_explore_schema', 'dory_list_connections', 'dory_run_readonly_sql', 'dory_saved_queries', 'dory_workspace_tabs'],
    );
});

test('dory_list_connections returns agent-oriented connection context', async () => {
    const ctx = createContext({
        db: {
            connections: {
                list: async () => [
                    {
                        connection: {
                            id: 'conn-1',
                            name: 'Warehouse',
                            type: 'postgres',
                            database: 'analytics',
                            environment: 'prod',
                            updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                        },
                        identities: [
                            {
                                id: 'identity-1',
                                isDefault: true,
                                database: 'analytics_ro',
                            },
                        ],
                    },
                ],
            },
        },
    } as unknown as WebActionServices);

    const output = (await getTool('dory_list_connections').execute(ctx, { includeRecent: true })) as any;

    assert.deepEqual(output.connections, [
        {
            connectionId: 'conn-1',
            name: 'Warehouse',
            type: 'postgres',
            environment: 'prod',
            defaultDatabase: 'analytics',
            lastUsedAt: null,
            permissionsSummary: 'read-only SQL, schema exploration, workspace tabs, and saved queries according to granted scopes',
        },
    ]);
});

test('dory_workspace_tabs manages SQL and table workspace tabs through internal actions', async () => {
    const savedTabs = new Map<string, any>();
    savedTabs.set('tab-1', {
        tabId: 'tab-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        tabType: 'sql',
        tabName: 'Existing',
        content: 'select 1',
        orderIndex: 0,
        createdAt: '2026-06-01T00:00:00.000Z',
    });
    const deleted: string[] = [];
    const ctx = createContext({
        db: {
            tabState: {
                loadAllTab: async () => [...savedTabs.values()],
                saveTabState: async (payload: any) => {
                    savedTabs.set(payload.tabId, {
                        tabId: payload.tabId,
                        userId: payload.userId,
                        connectionId: payload.connectionId,
                        ...payload.state,
                        resultMeta: payload.resultMeta ?? null,
                    });
                },
                updateTabName: async ({ tabId, newName }: any) => {
                    savedTabs.set(tabId, {
                        ...savedTabs.get(tabId),
                        tabName: newName,
                    });
                },
                deleteTabState: async (tabId: string) => {
                    deleted.push(tabId);
                    savedTabs.delete(tabId);
                },
            },
        },
    } as unknown as WebActionServices);
    const tool = getTool('dory_workspace_tabs');

    assert.equal(((await tool.execute(ctx, { operation: 'list', connectionId: 'conn-1' })) as any).tabs.length, 1);

    const created = (await tool.execute(ctx, {
        operation: 'create_sql',
        connectionId: 'conn-1',
        sql: 'select 2',
        tabName: 'Created',
    })) as any;
    assert.equal(savedTabs.get(created.tabId).content, 'select 2');

    const appended = (await tool.execute(ctx, {
        operation: 'append_sql',
        connectionId: 'conn-1',
        tabId: 'tab-1',
        sql: 'select 3',
        appendSeparator: '\n-- next\n',
    })) as any;
    assert.deepEqual(appended.workspaceAction, {
        mode: 'append_to_tab',
        tabId: 'tab-1',
        tabName: 'Existing',
        status: 'updated',
    });
    assert.equal(savedTabs.get('tab-1').content, 'select 1\n-- next\nselect 3');

    await tool.execute(ctx, {
        operation: 'replace_sql',
        connectionId: 'conn-1',
        tabId: 'tab-1',
        sql: 'select 4',
        tabName: 'Replaced',
    });
    assert.equal(savedTabs.get('tab-1').content, 'select 4');
    assert.equal(savedTabs.get('tab-1').tabName, 'Replaced');

    const tableTab = (await tool.execute(ctx, {
        operation: 'open_table',
        connectionId: 'conn-1',
        databaseName: 'analytics',
        tableName: 'orders',
    })) as any;
    assert.equal(savedTabs.get(tableTab.tabId).tabType, 'table');
    assert.equal(savedTabs.get(tableTab.tabId).tableName, 'orders');

    await tool.execute(ctx, {
        operation: 'delete',
        connectionId: 'conn-1',
        tabId: 'tab-1',
    });
    assert.deepEqual(deleted, ['tab-1']);
});

test('dory_saved_queries dispatches v1 operations and preserves write scope checks', async () => {
    const calls: Array<{ method: string; payload: any }> = [];
    const services = {
        db: {
            savedQueries: {
                list: async (payload: any) => {
                    calls.push({ method: 'list', payload });
                    return [{ id: 'query-1', title: 'Revenue', sqlText: 'select 1' }];
                },
                getById: async (payload: any) => {
                    calls.push({ method: 'getById', payload });
                    return { id: payload.id, title: 'Revenue', sqlText: 'select 1' };
                },
                create: async (payload: any) => {
                    calls.push({ method: 'create', payload });
                    return { id: 'query-2', ...payload };
                },
                update: async (payload: any) => {
                    calls.push({ method: 'update', payload });
                    return { id: payload.id, ...payload.patch };
                },
                delete: async (payload: any) => {
                    calls.push({ method: 'delete', payload });
                },
            },
        },
    } as unknown as WebActionServices;
    const ctx = createContext(services);
    const tool = getTool('dory_saved_queries');

    assert.equal(((await tool.execute(ctx, { operation: 'list', connectionId: 'conn-1' })) as any).savedQueries.length, 1);
    assert.equal(((await tool.execute(ctx, { operation: 'get', connectionId: 'conn-1', id: 'query-1' })) as any).savedQuery.id, 'query-1');
    await tool.execute(ctx, { operation: 'create', connectionId: 'conn-1', title: 'New', sqlText: 'select 2' });
    await tool.execute(ctx, { operation: 'update', connectionId: 'conn-1', id: 'query-1', title: 'Updated' });
    assert.deepEqual(await tool.execute(ctx, { operation: 'delete', connectionId: 'conn-1', id: 'query-1' }), { deleted: ['query-1'] });
    assert.deepEqual(
        calls.map(call => call.method),
        ['list', 'getById', 'create', 'update', 'delete'],
    );
    assert.equal(calls[2]?.payload.title, 'New');
    assert.deepEqual(calls[3]?.payload.patch, { title: 'Updated' });

    const readOnlyCtx = createContext(services, ['connections:read', 'saved_queries:read']);
    await assert.rejects(
        () =>
            tool.execute(readOnlyCtx, {
                operation: 'create',
                connectionId: 'conn-1',
                title: 'Denied',
                sqlText: 'select 1',
            }),
        /Missing action scope "saved_queries:write"/,
    );
});
