import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActionActorType, ActionContext } from '@dory/actions';
import { actionToAgentTool } from '@/lib/actions/server/adapters/agent';
import { actionToMcpTool } from '@/lib/actions/server/adapters/mcp';
import { executeUiAction } from '@/lib/actions/server/adapters/ui';
import type { WebActionServices } from '@/lib/actions/server/types';
import { webActionRegistry } from '@/lib/actions/server/registry';
import { getOrganizationPermissionMap } from '@/lib/auth/organization-ac';

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

function createContext(actorType: ActionActorType, scopes: string[], services: WebActionServices, auditEvents: unknown[] = []): ActionContext<WebActionServices> {
    return {
        organizationId: 'org-1',
        userId: 'user-1',
        currentConnectionId: 'conn-1',
        access: {
            isMember: true,
            role: 'member',
            permissions: getOrganizationPermissionMap('member'),
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

    assert.equal((uiOutput as any).tabId, 'tab-1');
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
    await assert.rejects(() => mcpTool.execute(tabCreateInput), /Missing action scope "tabs:write"/);
});
