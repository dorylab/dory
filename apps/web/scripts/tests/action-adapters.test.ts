import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ActionActorType, ActionContext } from '@dory/actions';
import { z } from 'zod';
import type { WebActionServices } from '@/lib/actions/server/types';
import { getOrganizationPermissionMap } from '@/lib/auth/organization-ac';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const [{ actionToAgentTool }, { actionToMcpTool, structuredMcpActionResult }, { executeUiAction }, { defineWebAction }, { webActionRegistry }] = await Promise.all([
    import('@/lib/actions/server/adapters/agent'),
    import('@/lib/actions/server/adapters/mcp'),
    import('@/lib/actions/server/adapters/ui'),
    import('@/lib/actions/server/define-web-action'),
    import('@/lib/actions/server/registry'),
]);

const tabCreateAction = webActionRegistry.get('tab.create');
assert.ok(tabCreateAction, 'Expected tab.create to be registered.');

const tabCreateInput = {
    connectionId: 'conn-1',
    tabId: 'tab-1',
    tabType: 'sql' as const,
    tabName: 'Revenue query',
    content: 'select 1',
    orderIndex: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
};

function createServices() {
    const savedTabs: unknown[] = [];
    const services = {
        db: {
            tabState: {
                saveTabState: async (payload: unknown) => {
                    savedTabs.push(payload);
                },
            },
        },
    } as unknown as WebActionServices;

    return { services, savedTabs };
}

function createContext(
    actorType: ActionActorType,
    scopes: string[],
    services: WebActionServices,
    auditEvents: unknown[] = [],
    role: 'viewer' | 'member' | 'admin' | 'owner' = 'member',
): ActionContext<WebActionServices> {
    return {
        organizationId: 'org-1',
        userId: 'user-1',
        currentConnectionId: 'conn-1',
        access: {
            isMember: true,
            role,
            permissions: getOrganizationPermissionMap(role),
        },
        actor: {
            type: actorType,
            scopes,
            id: actorType === 'mcp' ? 'token-1' : 'user-1',
        },
        requestId: `request-${actorType}`,
        audit: {
            record: event => {
                auditEvents.push(event);
            },
        },
        services,
    };
}

function savedTabSignature(savedTabs: unknown[]) {
    assert.equal(savedTabs.length, 1);
    const payload = savedTabs[0] as any;
    return {
        tabId: payload.tabId,
        userId: payload.userId,
        connectionId: payload.connectionId,
        state: payload.state,
        resultMeta: payload.resultMeta,
    };
}

function auditSignature(auditEvents: unknown[]) {
    assert.equal(auditEvents.length, 1);
    const event = auditEvents[0] as any;
    return {
        actionId: event.actionId,
        hasRequestId: typeof event.requestId === 'string' && event.requestId.length > 0,
        status: event.status,
        risk: event.risk,
        effects: event.effects,
        resourceType: event.resource?.type,
    };
}

test('tab.create can be executed through UI, Agent, and MCP adapters with the same side effect and audit semantics', async () => {
    const ui = createServices();
    const uiAudit: unknown[] = [];
    const uiOutput = await executeUiAction(createContext('user', ['tabs:write'], ui.services, uiAudit), 'tab.create', tabCreateInput);

    const agent = createServices();
    const agentAudit: unknown[] = [];
    const agentTool = actionToAgentTool(tabCreateAction, () => createContext('agent', ['tabs:write'], agent.services, agentAudit));
    const agentOutput = await (agentTool.execute as any)(tabCreateInput);

    const mcp = createServices();
    const mcpAudit: unknown[] = [];
    const mcpTool = actionToMcpTool(tabCreateAction, () => createContext('mcp', ['tabs:write'], mcp.services, mcpAudit));
    const mcpOutput = await mcpTool.execute(tabCreateInput);

    assert.equal((uiOutput.data as any).tabId, 'tab-1');
    assert.equal(agentOutput.ok, true);
    assert.equal(agentOutput.tabId, 'tab-1');
    assert.equal((mcpOutput.structuredContent as any).tabId, 'tab-1');

    assert.deepEqual(savedTabSignature(agent.savedTabs), savedTabSignature(ui.savedTabs));
    assert.deepEqual(savedTabSignature(mcp.savedTabs), savedTabSignature(ui.savedTabs));
    assert.deepEqual(auditSignature(agentAudit), auditSignature(uiAudit));
    assert.deepEqual(auditSignature(mcpAudit), auditSignature(uiAudit));
});

test('tab.create uses the same tabs:write gate through UI, Agent, and MCP adapters', async () => {
    const ui = createServices();
    await assert.rejects(() => executeUiAction(createContext('user', [], ui.services), 'tab.create', tabCreateInput), /Missing action scope "tabs:write"/);

    const agent = createServices();
    const agentTool = actionToAgentTool(tabCreateAction, () => createContext('agent', [], agent.services));
    const agentOutput = await (agentTool.execute as any)(tabCreateInput);
    assert.equal(agentOutput.ok, false);
    assert.equal(agentOutput.error.code, 'ACTION_SCOPE_MISSING');

    const mcp = createServices();
    const mcpTool = actionToMcpTool(tabCreateAction, () => createContext('mcp', [], mcp.services));
    const mcpOutput = await mcpTool.execute(tabCreateInput);
    assert.equal(mcpOutput.isError, true);
    assert.equal((mcpOutput.structuredContent as any).ok, false);
    assert.equal((mcpOutput.structuredContent as any).error.code, 'ACTION_SCOPE_MISSING');
});

test('tab list/save/delete actions forward workspace scope to the tab repository', async () => {
    const calls: Array<{ method: string; args: any[]; payload?: any }> = [];
    const services = {
        db: {
            tabState: {
                loadAllTab: async (...args: any[]) => {
                    calls.push({ method: 'loadAllTab', args });
                    return [];
                },
                saveTabState: async (payload: any) => {
                    calls.push({ method: 'saveTabState', args: [], payload });
                },
                updateTabName: async (payload: any) => {
                    calls.push({ method: 'updateTabName', args: [], payload });
                },
                deleteTabState: async (...args: any[]) => {
                    calls.push({ method: 'deleteTabState', args });
                },
            },
        },
    } as unknown as WebActionServices;

    await executeUiAction(createContext('user', ['tabs:read'], services), 'tab.list', { connectionId: 'conn-1' });
    await executeUiAction(createContext('user', ['tabs:read'], services), 'tab.list', { connectionId: 'conn-1', workId: 'work-1' });
    await executeUiAction(createContext('user', ['tabs:write'], services), 'tab.save', {
        connectionId: 'conn-1',
        workId: 'work-1',
        tabId: 'tab-1',
        state: {
            tabType: 'sql',
            tabName: 'Scoped',
            content: 'select 1',
            orderIndex: 0,
        },
    });
    await executeUiAction(createContext('user', ['tabs:write'], services), 'tab.delete', { connectionId: 'conn-1', workId: 'work-1', tabId: 'tab-1' });

    assert.deepEqual(calls[0], { method: 'loadAllTab', args: ['user-1', 'conn-1', null] });
    assert.deepEqual(calls[1], { method: 'loadAllTab', args: ['user-1', 'conn-1', 'work-1'] });
    assert.equal(calls[2]?.method, 'saveTabState');
    assert.equal(calls[2]?.payload.workId, 'work-1');
    assert.equal(calls[3]?.method, 'updateTabName');
    assert.equal(calls[3]?.payload.workId, 'work-1');
    assert.deepEqual(calls[4], { method: 'deleteTabState', args: ['tab-1', 'user-1', 'conn-1', 'work-1'] });
});

test('MCP adapter returns structured tool errors for invalid input and permission denials', async () => {
    const invalid = createServices();
    const invalidTool = actionToMcpTool(tabCreateAction, () => createContext('mcp', ['tabs:write'], invalid.services));
    const invalidOutput = await invalidTool.execute({ tabType: 'not-a-tab' });
    assert.equal(invalidOutput.isError, true);
    assert.equal((invalidOutput.structuredContent as any).error.code, 'ACTION_INPUT_INVALID');

    const denied = createServices();
    const deniedTool = actionToMcpTool(tabCreateAction, () => createContext('mcp', ['tabs:write'], denied.services, [], 'viewer'));
    const deniedOutput = await deniedTool.execute(tabCreateInput);
    assert.equal(deniedOutput.isError, true);
    assert.equal((deniedOutput.structuredContent as any).error.code, 'ACTION_FORBIDDEN');
});

test('MCP adapter omits non-object output schemas so SDK output validation does not crash', async () => {
    const action = defineWebAction({
        id: 'connection.get',
        domain: 'connection',
        kind: 'query',
        risk: 'read',
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        permissions: [],
        scopes: [],
        actors: ['mcp'],
        mcp: {
            name: 'dory_unknown_output',
            title: 'Unknown output',
            description: 'Returns a non-object-schema output.',
        },
        handler: () => ({ ok: true }),
    });
    const mcpTool = actionToMcpTool(action, () => createContext('mcp', [], createServices().services));

    assert.equal(mcpTool.outputSchema, undefined);

    const server = new McpServer({
        name: 'dory-test',
        version: '1.0.0',
    });
    server.registerTool(
        mcpTool.name,
        {
            title: mcpTool.title,
            description: mcpTool.description,
            inputSchema: mcpTool.inputSchema as any,
            outputSchema: mcpTool.outputSchema as any,
            annotations: mcpTool.annotations,
        },
        async () => structuredMcpActionResult({ ok: true }),
    );

    const client = new Client({
        name: 'action-adapter-test',
        version: '1.0.0',
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        const result = (await client.callTool({
            name: mcpTool.name,
            arguments: {},
        })) as any;

        const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
        assert.deepEqual(JSON.parse(text), { ok: true });
    } finally {
        await client.close().catch(() => undefined);
        await server.close().catch(() => undefined);
    }
});
