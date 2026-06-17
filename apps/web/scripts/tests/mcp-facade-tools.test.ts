import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

const [{ getPublicDoryMcpTools, structuredMcpFacadeError }, { registerDoryMcpTools }] = await Promise.all([
    import('@/lib/server/mcp/facade-tools'),
    import('@/lib/server/mcp/tools'),
]);

function createWorksMock() {
    const events: any[] = [];
    const works = new Map<string, any>();
    let nextId = 1;
    const now = new Date('2026-06-01T00:00:00.000Z');
    const defaultTitle = 'Agent Run';

    const materialize = (input: any, workId = input.workId ?? `work-${nextId++}`) => {
        const existing = works.get(workId);
        if (existing) return existing;
        const row = {
            workId,
            organizationId: input.organizationId,
            userId: input.userId,
            tokenId: input.tokenId ?? null,
            connectionId: input.connectionId ?? null,
            externalSessionId: input.externalSessionId ?? null,
            title: input.title ?? defaultTitle,
            status: 'active',
            metadata: input.metadata ?? null,
            createdAt: now,
            updatedAt: now,
            lastActiveAt: now,
            archivedAt: null,
        };
        works.set(workId, row);
        return row;
    };

    const prepareExisting = (work: any, input: any) => {
        const requestedConnectionId = input.connectionId ?? null;
        if (requestedConnectionId && work.connectionId && work.connectionId !== requestedConnectionId) {
            throw Object.assign(new Error(`Work ${work.workId} is already bound to connection ${work.connectionId}; received ${requestedConnectionId}.`), {
                code: 'WORK_CONNECTION_MISMATCH',
                status: 409,
                details: {
                    workId: work.workId,
                    expectedConnectionId: work.connectionId,
                    receivedConnectionId: requestedConnectionId,
                },
            });
        }
        if (requestedConnectionId && !work.connectionId) {
            work.connectionId = requestedConnectionId;
        }
        if (input.title && work.title === defaultTitle) {
            work.title = input.title;
        }
        work.updatedAt = now;
        work.lastActiveAt = now;
        return work;
    };

    const findByExternalSessionId = (input: any) =>
        [...works.values()].find(
            work =>
                work.organizationId === input.organizationId &&
                work.userId === input.userId &&
                work.tokenId === (input.tokenId ?? null) &&
                work.externalSessionId === input.externalSessionId &&
                !work.archivedAt,
        );
    const findByWorkId = (input: any) => {
        const work = works.get(input.workId);
        if (!work) return null;
        return work.organizationId === input.organizationId && work.userId === input.userId ? work : null;
    };

    return {
        events,
        works,
        create: async (input: any) => {
            if (input.externalSessionId) {
                const existing = findByExternalSessionId(input);
                if (existing) return prepareExisting(existing, input);
            }
            return materialize(input);
        },
        resolve: async (input: any) => {
            const existing = input.workId ? (findByWorkId(input) ?? null) : input.externalSessionId ? (findByExternalSessionId(input) ?? null) : null;
            if (existing) return prepareExisting(existing, input);
            return materialize(input);
        },
        resolveExisting: async (input: any) => {
            const existing = input.workId ? (findByWorkId(input) ?? null) : input.externalSessionId ? (findByExternalSessionId(input) ?? null) : null;
            return existing ? prepareExisting(existing, input) : null;
        },
        recordEvent: async (event: any) => {
            events.push(event);
            return { ...event, id: events.length, createdAt: now };
        },
        finishWithSummary: async (input: any) => {
            const work = works.get(input.workId);
            if (!work || work.organizationId !== input.organizationId || work.userId !== input.userId) {
                throw Object.assign(new Error(`Work not found: ${input.workId}.`), {
                    code: 'WORK_NOT_FOUND',
                    status: 404,
                });
            }
            work.status = input.status;
            work.metadata = {
                ...(work.metadata ?? {}),
                agentRunSummary: {
                    summaryTitle: input.summaryTitle ?? null,
                    summaryBullets: input.summaryBullets,
                    updatedAt: now.toISOString(),
                },
            };
            work.updatedAt = now;
            work.lastActiveAt = now;
            return work;
        },
        summarizeInput: (input: unknown) => input,
        saveSqlSnapshot: async () => {},
    };
}

function getTool(name: string) {
    const tool = getPublicDoryMcpTools().find((item: any) => item.name === name);
    assert.ok(tool, `Expected MCP facade tool ${name}`);
    return tool;
}

async function assertRejectsCode(run: () => Promise<unknown>, code: string) {
    try {
        await run();
        assert.fail(`Expected rejection with code ${code}`);
    } catch (error) {
        assert.equal((error as any).code, code);
    }
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
        services: {
            requestOrigin: 'https://dory.test',
            ...services,
        },
    };
}

test('public Dory MCP catalog is limited to high-level facade tools', () => {
    assert.deepEqual(
        getPublicDoryMcpTools()
            .map((tool: any) => tool.name)
            .sort(),
        ['dory_create_work', 'dory_explore_schema', 'dory_finish_work', 'dory_list_connections', 'dory_run_readonly_sql', 'dory_saved_queries', 'dory_workspace_tabs'],
    );
});

test('dory_create_work returns a workspace URL', async () => {
    const ctx = createContext({
        db: {
            works: createWorksMock(),
        },
    } as unknown as WebActionServices);

    const output = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', externalSessionId: 'session-1', title: 'Revenue check' })) as any;

    assert.equal(output.workId, 'work-1');
    assert.equal(output.title, 'Revenue check');
    assert.equal(output.workspaceUrl, 'https://dory.test/org-1/agent-runs/work-1/workspace/conn-1');
    assert.equal(output.work.workId, 'work-1');
});

test('dory_create_work uses the user question as the Agent Run title', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);

    const output = (await getTool('dory_create_work').execute(ctx, { question: 'Which customers drove revenue growth last month?' })) as any;

    assert.equal(output.title, 'Which customers drove revenue growth last month?');
    assert.equal(works.works.get(output.workId)?.title, 'Which customers drove revenue growth last month?');
});

test('dory_create_work is idempotent for an external session', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);

    const first = (await getTool('dory_create_work').execute(ctx, { externalSessionId: 'session-1', title: 'Revenue check' })) as any;
    const second = (await getTool('dory_create_work').execute(ctx, { externalSessionId: 'session-1', connectionId: 'conn-1', title: 'Revenue check again' })) as any;

    assert.equal(first.workId, 'work-1');
    assert.equal(second.workId, 'work-1');
    assert.equal(second.connectionId, 'conn-1');
    assert.equal(works.works.size, 1);
});

test('dory_create_work can fill a default title when reusing an external session', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);

    const first = (await getTool('dory_create_work').execute(ctx, { externalSessionId: 'session-1' })) as any;
    const second = (await getTool('dory_create_work').execute(ctx, { externalSessionId: 'session-1', userQuestion: 'Show order volume by day' })) as any;

    assert.equal(first.workId, 'work-1');
    assert.equal(second.workId, 'work-1');
    assert.equal(second.title, 'Show order volume by day');
    assert.equal(works.works.get(second.workId)?.title, 'Show order volume by day');
});

test('dory_finish_work persists agent summary metadata and status', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);

    const work = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', title: 'Analyze HN hot posts' })) as any;
    const output = (await getTool('dory_finish_work').execute(ctx, {
        workId: work.workId,
        status: 'completed',
        summaryTitle: 'HN hot posts analysis',
        summaryBullets: ['Queried story score distribution', 'Created editable SQL tabs'],
    })) as any;

    assert.equal(output.status, 'completed');
    assert.equal(output.workspaceUrl, 'https://dory.test/org-1/agent-runs/work-1/workspace/conn-1');
    assert.deepEqual(works.works.get(work.workId)?.metadata?.agentRunSummary, {
        summaryTitle: 'HN hot posts analysis',
        summaryBullets: ['Queried story score distribution', 'Created editable SQL tabs'],
        updatedAt: '2026-06-01T00:00:00.000Z',
    });
    assert.equal(works.works.get(work.workId)?.status, 'completed');
    assert.equal(works.events.at(-1)?.toolName, 'dory_finish_work');
    assert.equal(works.events.at(-1)?.status, 'success');
});

test('dory_finish_work rejects work owned by another user', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);
    const work = (await getTool('dory_create_work').execute(ctx, { title: 'Owned run' })) as any;
    const otherCtx = {
        ...ctx,
        userId: 'user-2',
    } as ActionContext<WebActionServices>;

    await assertRejectsCode(
        () =>
            getTool('dory_finish_work').execute(otherCtx, {
                workId: work.workId,
                status: 'completed',
                summaryBullets: ['Should not write'],
            }),
        'WORK_NOT_FOUND',
    );
});

test('ordinary MCP facade tools require an existing work context', async () => {
    const ctx = createContext({
        db: {
            works: createWorksMock(),
            connections: {
                list: async () => [],
            },
        },
    } as unknown as WebActionServices);

    await assertRejectsCode(() => getTool('dory_list_connections').execute(ctx, { includeRecent: true }), 'MISSING_WORK_CONTEXT');
});

test('strict MCP output schemas accept structured error envelopes', () => {
    const readonlyTool = getTool('dory_run_readonly_sql');
    const errorEnvelope = structuredMcpFacadeError(new Error('boom')).structuredContent;

    assert.equal(readonlyTool.outputSchema.safeParse(errorEnvelope).success, true);
});

test('registered MCP schema does not require SQL success fields for error outputs', async () => {
    const server = new McpServer({ name: 'dory-test', version: '1.0.0' });
    registerDoryMcpTools(server, {
        organizationId: 'org-1',
        userId: 'user-1',
        tokenId: 'token-1',
        scopes: ['query:read'],
        access: {
            source: 'local',
            organizationId: 'org-1',
            userId: 'user-1',
            isMember: true,
            role: 'member',
            permissions: getOrganizationPermissionMap('member'),
            organization: {
                id: 'org-1',
                slug: 'org-1',
                name: 'Org 1',
            },
        },
        requestOrigin: 'https://dory.test',
    });

    const client = new Client({ name: 'dory-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        const tools = await client.listTools();
        const readonlyTool = tools.tools.find(tool => tool.name === 'dory_run_readonly_sql');
        assert.ok(readonlyTool?.outputSchema);

        const required = Array.isArray(readonlyTool.outputSchema.required) ? readonlyTool.outputSchema.required : [];
        assert.equal(required.includes('result'), false);
        assert.equal(required.includes('columns'), false);
        assert.equal(required.includes('rowCount'), false);
        assert.ok((readonlyTool.outputSchema.properties as any)?.error, 'Expected error envelope in SQL output schema.');
    } finally {
        await client.close().catch(() => undefined);
        await server.close().catch(() => undefined);
    }
});

test('dory_list_connections returns agent-oriented connection context', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
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

    const work = (await getTool('dory_create_work').execute(ctx, { title: 'Connection discovery' })) as any;
    const output = (await getTool('dory_list_connections').execute(ctx, { includeRecent: true, workId: work.workId })) as any;

    assert.equal(output.work.workId, 'work-1');
    assert.equal(output.workspaceUrl, 'https://dory.test/org-1/agent-runs/work-1');
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
        workId: 'work-1',
        tabType: 'sql',
        tabName: 'Existing',
        content: 'select 1',
        orderIndex: 0,
        createdAt: '2026-06-01T00:00:00.000Z',
    });
    const deleted: string[] = [];
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
            tabState: {
                loadAllTab: async (_userId: string, _connectionId: string, workId?: string | null) =>
                    [...savedTabs.values()].filter(tab => (tab.workId ?? null) === (workId ?? null)),
                loadTabStateById: async (tabId: string) => savedTabs.get(tabId) ?? null,
                saveTabState: async (payload: any) => {
                    savedTabs.set(payload.tabId, {
                        tabId: payload.tabId,
                        userId: payload.userId,
                        connectionId: payload.connectionId,
                        workId: payload.workId ?? null,
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
    const work = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', externalSessionId: 'session-1', title: 'Workspace tabs' })) as any;

    const listed = (await tool.execute(ctx, { operation: 'list', connectionId: 'conn-1', workId: work.workId })) as any;
    assert.equal(listed.tabs.length, 1);
    assert.equal(listed.work.workId, 'work-1');

    const created = (await tool.execute(ctx, {
        operation: 'create_sql',
        connectionId: 'conn-1',
        workId: work.workId,
        sql: 'select 2',
        tabName: 'Created',
    })) as any;
    assert.equal(savedTabs.get(created.tabId).content, 'select 2');
    assert.equal(created.work.workId, 'work-1');
    assert.equal(savedTabs.get(created.tabId).workId, 'work-1');

    const appended = (await tool.execute(ctx, {
        operation: 'append_sql',
        connectionId: 'conn-1',
        workId: work.workId,
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
        workId: work.workId,
        tabId: 'tab-1',
        sql: 'select 4',
        tabName: 'Replaced',
    });
    assert.equal(savedTabs.get('tab-1').content, 'select 4');
    assert.equal(savedTabs.get('tab-1').tabName, 'Replaced');

    const tableTab = (await tool.execute(ctx, {
        operation: 'open_table',
        connectionId: 'conn-1',
        workId: work.workId,
        databaseName: 'analytics',
        tableName: 'orders',
    })) as any;
    assert.equal(savedTabs.get(tableTab.tabId).tabType, 'table');
    assert.equal(savedTabs.get(tableTab.tabId).tableName, 'orders');

    await tool.execute(ctx, {
        operation: 'delete',
        connectionId: 'conn-1',
        workId: work.workId,
        tabId: 'tab-1',
    });
    assert.deepEqual(deleted, ['tab-1']);
});

test('dory_workspace_tabs reports tab work mismatches clearly', async () => {
    const savedTabs = new Map<string, any>();
    savedTabs.set('tab-other', {
        tabId: 'tab-other',
        userId: 'user-1',
        connectionId: 'conn-1',
        workId: 'work-other',
        tabType: 'sql',
        tabName: 'Other work',
        content: 'select 1',
    });
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
            tabState: {
                loadAllTab: async (_userId: string, _connectionId: string, workId?: string | null) =>
                    [...savedTabs.values()].filter(tab => (tab.workId ?? null) === (workId ?? null)),
                loadTabStateById: async (tabId: string) => savedTabs.get(tabId) ?? null,
                saveTabState: async () => {},
            },
        },
    } as unknown as WebActionServices);
    const work = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', title: 'Current work' })) as any;

    await assertRejectsCode(
        () =>
            getTool('dory_workspace_tabs').execute(ctx, {
                operation: 'append_sql',
                connectionId: 'conn-1',
                workId: work.workId,
                tabId: 'tab-other',
                sql: 'select 2',
            }),
        'SQL_TAB_WORK_MISMATCH',
    );
});

test('dory_saved_queries dispatches v1 operations and preserves write scope checks', async () => {
    const calls: Array<{ method: string; payload: any }> = [];
    const works = createWorksMock();
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
            works,
        },
    } as unknown as WebActionServices;
    const ctx = createContext(services);
    const tool = getTool('dory_saved_queries');
    const work = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', externalSessionId: 'session-1', title: 'Saved queries' })) as any;

    assert.equal(((await tool.execute(ctx, { operation: 'list', connectionId: 'conn-1', workId: work.workId })) as any).savedQueries.length, 1);
    assert.equal(((await tool.execute(ctx, { operation: 'get', connectionId: 'conn-1', workId: work.workId, id: 'query-1' })) as any).savedQuery.id, 'query-1');
    await tool.execute(ctx, { operation: 'create', connectionId: 'conn-1', workId: work.workId, title: 'New', sqlText: 'select 2' });
    await tool.execute(ctx, { operation: 'update', connectionId: 'conn-1', workId: work.workId, id: 'query-1', title: 'Updated' });
    const deleted = (await tool.execute(ctx, { operation: 'delete', connectionId: 'conn-1', workId: work.workId, id: 'query-1' })) as any;
    assert.deepEqual(deleted.deleted, ['query-1']);
    assert.equal(deleted.work.workId, 'work-1');
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
                workId: work.workId,
                title: 'Denied',
                sqlText: 'select 1',
            }),
        /Missing action scope "saved_queries:write"/,
    );
});
