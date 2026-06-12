import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ActionActorType, ActionContext } from '@dory/actions';
import { z } from 'zod';
import type { WebActionServices } from '@/lib/actions/server/types';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const [
    { actionToAgentTool },
    { actionToMcpTool, structuredMcpActionResult },
    { executeUiAction },
    { executeAction },
    { defineWebAction },
    { webActionRegistry },
    { getOrganizationPermissionMap },
] = await Promise.all([
    import('@/lib/actions/server/adapters/agent'),
    import('@/lib/actions/server/adapters/mcp'),
    import('@/lib/actions/server/adapters/ui'),
    import('@/lib/actions/server/execute'),
    import('@/lib/actions/server/define-web-action'),
    import('@/lib/actions/server/registry'),
    import('@/lib/auth/organization-ac'),
]);
const { investigationWorkspaceContent } = await import('@/lib/actions/server/domains/work/create-investigation');
const { investigationSqlAssetBlockContent, resolveInvestigationSqlTargetTab, resolveInvestigationSqlTitles, sqlWorkspaceContentWithBlock } =
    await import('@/lib/actions/server/domains/work/run-investigation-sql');

const tabCreateAction = webActionRegistry.get('tab.create');
assert.ok(tabCreateAction, 'Expected tab.create to be registered.');
const tabSaveAction = webActionRegistry.get('tab.save');
assert.ok(tabSaveAction, 'Expected tab.save to be registered.');
const workCreateAction = webActionRegistry.get('work.create');
assert.ok(workCreateAction, 'Expected work.create to be registered.');
const workCreateInvestigationAction = webActionRegistry.get('work.createInvestigation');
assert.ok(workCreateInvestigationAction, 'Expected work.createInvestigation to be registered.');
const workEnsureInvestigationWorkspaceAction = webActionRegistry.get('work.ensureInvestigationWorkspace');
assert.ok(workEnsureInvestigationWorkspaceAction, 'Expected work.ensureInvestigationWorkspace to be registered.');
const workUpdateConclusionAction = webActionRegistry.get('work.updateConclusion');
assert.ok(workUpdateConclusionAction, 'Expected work.updateConclusion to be registered.');
const workUpdateInvestigationAction = webActionRegistry.get('work.updateInvestigation');
assert.ok(workUpdateInvestigationAction, 'Expected work.updateInvestigation to be registered.');
const workCreateInvestigationFindingAction = webActionRegistry.get('work.createInvestigationFinding');
assert.ok(workCreateInvestigationFindingAction, 'Expected work.createInvestigationFinding to be registered.');

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
    const savedWorks: unknown[] = [];
    const savedInvestigations: unknown[] = [];
    const savedConclusions: unknown[] = [];
    const savedInvestigationFindings: unknown[] = [];
    const services = {
        db: {
            connections: {
                getById: async (_organizationId: string, id: string) => (id === 'conn-1' ? { connection: { id, name: 'Warehouse' }, identities: [] } : null),
            },
            tabState: {
                saveTabState: async (payload: unknown) => {
                    savedTabs.push(payload);
                },
            },
            works: {
                getById: async (payload: any) =>
                    payload.organizationId === 'org-1' && payload.id === 'work-1'
                        ? {
                              id: 'work-1',
                              organizationId: 'org-1',
                              title: 'Untitled Work',
                              status: 'draft',
                              goal: 'Find why query failures increased this week.',
                              workType: 'investigation',
                              scope: null,
                              initialContext: null,
                              conclusion: null,
                              connectionId: 'conn-1',
                              createdBy: 'user',
                              createdByUserId: 'user-1',
                              createdAt: new Date('2026-06-01T00:00:00.000Z'),
                              updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                          }
                        : null,
                create: async (payload: any) => {
                    const record = {
                        id: payload.id ?? `work-${savedWorks.length + 1}`,
                        organizationId: payload.organizationId,
                        title: payload.title ?? 'Untitled Work',
                        status: 'draft',
                        goal: payload.goal,
                        workType: payload.workType ?? 'investigation',
                        scope: payload.scope ?? null,
                        initialContext: payload.initialContext ?? null,
                        conclusion: payload.conclusion ?? null,
                        connectionId: payload.connectionId,
                        createdBy: payload.createdBy,
                        createdByUserId: payload.createdByUserId,
                        createdAt: new Date('2026-06-01T00:00:00.000Z'),
                        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                    };
                    savedWorks.push(record);
                    return record;
                },
                createInvestigation: async (payload: any) => {
                    const record = {
                        id: payload.id ?? `investigation-${savedInvestigations.length + 1}`,
                        workId: payload.workId,
                        organizationId: payload.organizationId,
                        connectionId: payload.connectionId,
                        title: payload.title,
                        status: 'draft',
                        auditStatus: payload.auditStatus ?? 'draft',
                        linkedTabId: payload.linkedTabId ?? null,
                        lastQueryAt: null,
                        reviewedAt: null,
                        acceptedAt: null,
                        rejectedAt: null,
                        auditStatusUpdatedAt: null,
                        createdAt: new Date('2026-06-01T00:00:00.000Z'),
                        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                    };
                    savedInvestigations.push(record);
                    return record;
                },
                listInvestigations: async (payload: any) => (payload.organizationId === 'org-1' && payload.workId === 'work-1' ? savedInvestigations : []),
                getInvestigationById: async (payload: any) =>
                    payload.organizationId === 'org-1' && payload.workId === 'work-1'
                        ? {
                              id: payload.id,
                              workId: payload.workId,
                              organizationId: payload.organizationId,
                              connectionId: 'conn-1',
                              title: 'Error Rate Analysis',
                              status: 'draft',
                              auditStatus: 'draft',
                              linkedTabId: null,
                              lastQueryAt: null,
                              reviewedAt: null,
                              acceptedAt: null,
                              rejectedAt: null,
                              auditStatusUpdatedAt: null,
                              createdAt: new Date('2026-06-01T00:00:00.000Z'),
                              updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                          }
                        : null,
                updateConclusion: async (payload: any) => {
                    const record = {
                        id: payload.id,
                        organizationId: payload.organizationId,
                        title: 'Untitled Work',
                        status: 'completed',
                        goal: 'Find why query failures increased this week.',
                        workType: 'investigation',
                        scope: null,
                        initialContext: null,
                        conclusion: payload.conclusion,
                        connectionId: 'conn-1',
                        createdBy: 'user',
                        createdByUserId: 'user-1',
                        createdAt: new Date('2026-06-01T00:00:00.000Z'),
                        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                    };
                    savedConclusions.push(record);
                    return record;
                },
                updateInvestigation: async (payload: any) => {
                    const record = {
                        id: payload.id,
                        workId: payload.workId,
                        organizationId: payload.organizationId,
                        connectionId: 'conn-1',
                        title: 'Error Rate Analysis',
                        status: payload.patch.status ?? 'completed',
                        auditStatus: payload.patch.auditStatus ?? 'draft',
                        linkedTabId: payload.patch.linkedTabId ?? null,
                        lastQueryAt: null,
                        reviewedAt: null,
                        acceptedAt: payload.patch.auditStatus === 'accepted' ? new Date('2026-06-01T00:00:00.000Z') : null,
                        rejectedAt: payload.patch.auditStatus === 'rejected' ? new Date('2026-06-01T00:00:00.000Z') : null,
                        auditStatusUpdatedAt: payload.patch.auditStatus ? new Date('2026-06-01T00:00:00.000Z') : null,
                        createdAt: new Date('2026-06-01T00:00:00.000Z'),
                        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                    };
                    return record;
                },
                listFindingsForWork: async (payload: { organizationId: string; workId: string }) =>
                    payload.organizationId === 'org-1' && payload.workId === 'work-1' ? savedInvestigationFindings : [],
                listInvestigationFindings: async (payload: { organizationId: string; workId: string; investigationId: string }) =>
                    payload.organizationId === 'org-1' && payload.workId === 'work-1'
                        ? savedInvestigationFindings.filter(finding => (finding as { investigationId?: string }).investigationId === payload.investigationId)
                        : [],
                createInvestigationFinding: async (payload: any) => {
                    const record = {
                        id: payload.id ?? `finding-${savedInvestigationFindings.length + 1}`,
                        workId: payload.workId,
                        investigationId: payload.investigationId,
                        organizationId: payload.organizationId,
                        content: payload.content,
                        sourceTabId: payload.sourceTabId ?? null,
                        sourceRunEventId: payload.sourceRunEventId ?? null,
                        createdBy: payload.createdBy,
                        orderIndex: payload.orderIndex ?? 0,
                        createdAt: new Date('2026-06-01T00:00:00.000Z'),
                        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                    };
                    savedInvestigationFindings.push(record);
                    return record;
                },
            },
        },
    } as unknown as WebActionServices;

    return { services, savedTabs, savedWorks, savedInvestigations, savedConclusions, savedInvestigationFindings };
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
        workspaceScope: payload.workspaceScope ?? { type: 'connection' },
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

function savedWorkSignature(savedWorks: unknown[]) {
    assert.equal(savedWorks.length, 1);
    const payload = savedWorks[0] as any;
    return {
        title: payload.title,
        status: payload.status,
        goal: payload.goal,
        workType: payload.workType,
        scope: payload.scope,
        initialContext: payload.initialContext,
        conclusion: payload.conclusion,
        connectionId: payload.connectionId,
        createdBy: payload.createdBy,
        createdByUserId: payload.createdByUserId,
    };
}

function savedInvestigationSignature(savedInvestigations: unknown[]) {
    assert.equal(savedInvestigations.length, 1);
    const payload = savedInvestigations[0] as any;
    return {
        workId: payload.workId,
        title: payload.title,
        status: payload.status,
        linkedTabId: payload.linkedTabId,
    };
}

function savedConclusionSignature(savedConclusions: unknown[]) {
    assert.equal(savedConclusions.length, 1);
    const payload = savedConclusions[0] as any;
    return {
        id: payload.id,
        conclusion: payload.conclusion,
    };
}

function linkedWorkspaceSignature(savedTabs: unknown[]) {
    assert.equal(savedTabs.length, 1);
    const payload = savedTabs[0] as any;
    const workspaceScope = payload.workspaceScope;
    return {
        connectionId: payload.connectionId,
        workspaceScopeType: workspaceScope?.type ?? 'connection',
        workspaceScopeWorkId: workspaceScope?.workId ?? null,
        hasWorkspaceInvestigationId: typeof workspaceScope?.investigationId === 'string' && workspaceScope.investigationId.length > 0,
        tabType: payload.state.tabType,
        tabName: payload.state.tabName,
        content: payload.state.content,
        resultMetaWorkId: payload.resultMeta?.workId ?? null,
        hasResultMetaInvestigationId: typeof payload.resultMeta?.investigationId === 'string' && payload.resultMeta.investigationId.length > 0,
        resultMetaSource: payload.resultMeta?.source ?? null,
    };
}

function savedInvestigationFindingSignature(savedFindings: unknown[]) {
    assert.equal(savedFindings.length, 1);
    const payload = savedFindings[0] as any;
    return {
        id: payload.id,
        workId: payload.workId,
        investigationId: payload.investigationId,
        content: payload.content,
        sourceTabId: payload.sourceTabId,
        sourceRunEventId: payload.sourceRunEventId,
        createdBy: payload.createdBy,
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
    await assert.rejects(() => mcpTool.execute(tabCreateInput), /Missing action scope "tabs:write"/);
});

test('tab.save can be executed by Agent with the same tab persistence side effect', async () => {
    const input = {
        connectionId: 'conn-1',
        tabId: 'tab-1',
        state: {
            tabType: 'sql',
            content: 'select 42',
            databaseName: 'main',
        },
        resultMeta: {
            sessionId: 'session-1',
            source: 'work-run',
        },
    };

    const agent = createServices();
    const agentAudit: unknown[] = [];
    const agentTool = actionToAgentTool(tabSaveAction, () => createContext('agent', ['tabs:write'], agent.services, agentAudit));
    const agentOutput = await (agentTool.execute as any)(input);

    assert.equal(agentOutput.ok, true);
    assert.deepEqual(savedTabSignature(agent.savedTabs), {
        tabId: 'tab-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        workspaceScope: { type: 'connection' },
        state: {
            content: 'select 42',
            databaseName: 'main',
            tableName: null,
            activeSubTab: null,
            tabType: 'sql',
            tabName: null,
            orderIndex: undefined,
            createdAt: undefined,
        },
        resultMeta: {
            sessionId: 'session-1',
            source: 'work-run',
        },
    });
    assert.deepEqual(auditSignature(agentAudit), {
        actionId: 'tab.save',
        hasRequestId: true,
        status: 'success',
        risk: 'low',
        effects: undefined,
        resourceType: undefined,
    });
});

test('tab.save persists work investigation workspace scope', async () => {
    const input = {
        connectionId: 'conn-1',
        tabId: 'tab-1',
        workspaceScope: {
            type: 'work_investigation' as const,
            workId: 'work-1',
            investigationId: 'investigation-1',
        },
        state: {
            tabType: 'sql',
            content: 'select 42',
            databaseName: 'main',
        },
    };

    const agent = createServices();
    const agentTool = actionToAgentTool(tabSaveAction, () => createContext('agent', ['tabs:write'], agent.services));
    const agentOutput = await (agentTool.execute as any)(input);

    assert.equal(agentOutput.ok, true);
    assert.equal((savedTabSignature(agent.savedTabs).workspaceScope as any).type, 'work_investigation');
    assert.deepEqual(savedTabSignature(agent.savedTabs).workspaceScope, input.workspaceScope);
});

test('work.create can be executed through UI, Agent, and Automation with shared action semantics', async () => {
    const input = {
        connectionId: 'conn-1',
        goal: 'Analyze AI feature health for the last 24 hours.',
        workType: 'analysis',
        scope: {
            timeRange: 'Last 24 hours',
            tablesMode: 'auto',
            selectedTables: [],
            metrics: ['usage'],
            constraints: ['Prefer SQL evidence'],
        },
        initialContext: 'Focus on production users.',
    };

    const ui = createServices();
    const uiAudit: unknown[] = [];
    const uiOutput = await executeUiAction(createContext('user', ['works:write'], ui.services, uiAudit), 'work.create', input);

    const agent = createServices();
    const agentAudit: unknown[] = [];
    const agentTool = actionToAgentTool(workCreateAction, () => createContext('agent', ['works:write'], agent.services, agentAudit));
    const agentOutput = await (agentTool.execute as any)(input);

    const automation = createServices();
    const automationAudit: unknown[] = [];
    const automationOutput = await executeAction(createContext('automation', ['works:write'], automation.services, automationAudit), 'work.create', input);

    assert.equal((uiOutput.data as any).id, 'work-1');
    assert.equal(agentOutput.ok, true);
    assert.equal(agentOutput.id, 'work-1');
    assert.equal((automationOutput.data as any).id, 'work-1');

    assert.deepEqual(savedWorkSignature(ui.savedWorks), {
        title: 'AI Feature Health',
        status: 'draft',
        goal: input.goal,
        workType: input.workType,
        scope: input.scope,
        initialContext: input.initialContext,
        conclusion: null,
        connectionId: 'conn-1',
        createdBy: 'user',
        createdByUserId: 'user-1',
    });
    assert.deepEqual(savedWorkSignature(agent.savedWorks), { ...savedWorkSignature(ui.savedWorks), createdBy: 'agent' });
    assert.deepEqual(savedWorkSignature(automation.savedWorks), { ...savedWorkSignature(ui.savedWorks), createdBy: 'agent' });
    assert.deepEqual(auditSignature(agentAudit), auditSignature(uiAudit));
    assert.deepEqual(auditSignature(automationAudit), auditSignature(uiAudit));
});

test('work.create uses the same works:write gate through UI, Agent, and Automation', async () => {
    const input = {
        connectionId: 'conn-1',
        goal: 'Analyze AI feature health for the last 24 hours.',
    };

    const ui = createServices();
    await assert.rejects(() => executeUiAction(createContext('user', [], ui.services), 'work.create', input), /Missing action scope "works:write"/);

    const agent = createServices();
    const agentTool = actionToAgentTool(workCreateAction, () => createContext('agent', [], agent.services));
    const agentOutput = await (agentTool.execute as any)(input);
    assert.equal(agentOutput.ok, false);
    assert.equal(agentOutput.error.code, 'ACTION_SCOPE_MISSING');

    const automation = createServices();
    await assert.rejects(() => executeAction(createContext('automation', [], automation.services), 'work.create', input), /Missing action scope "works:write"/);
});

test('work.createInvestigation creates and links a SQL workspace through UI, Agent, and Automation', async () => {
    const input = {
        workId: 'work-1',
        title: 'Error Rate Analysis',
    };

    const ui = createServices();
    const uiAudit: unknown[] = [];
    const uiOutput = await executeUiAction(createContext('user', ['works:write'], ui.services, uiAudit), 'work.createInvestigation', input);

    const agent = createServices();
    const agentAudit: unknown[] = [];
    const agentTool = actionToAgentTool(workCreateInvestigationAction, () => createContext('agent', ['works:write'], agent.services, agentAudit));
    const agentOutput = await (agentTool.execute as any)(input);

    const automation = createServices();
    const automationAudit: unknown[] = [];
    const automationOutput = await executeAction(createContext('automation', ['works:write'], automation.services, automationAudit), 'work.createInvestigation', input);

    assert.ok((uiOutput.data as any).linkedTabId);
    assert.equal(agentOutput.ok, true);
    assert.ok(agentOutput.linkedTabId);
    assert.ok((automationOutput.data as any).linkedTabId);
    assert.equal(savedInvestigationSignature(ui.savedInvestigations).linkedTabId, savedTabSignature(ui.savedTabs).tabId);
    assert.equal(savedInvestigationSignature(agent.savedInvestigations).linkedTabId, savedTabSignature(agent.savedTabs).tabId);
    assert.equal(savedInvestigationSignature(automation.savedInvestigations).linkedTabId, savedTabSignature(automation.savedTabs).tabId);
    assert.deepEqual(linkedWorkspaceSignature(agent.savedTabs), linkedWorkspaceSignature(ui.savedTabs));
    assert.deepEqual(linkedWorkspaceSignature(automation.savedTabs), linkedWorkspaceSignature(ui.savedTabs));
    assert.deepEqual(auditSignature(agentAudit), auditSignature(uiAudit));
    assert.deepEqual(auditSignature(automationAudit), auditSignature(uiAudit));
});

test('work.ensureInvestigationWorkspace creates a scoped SQL workspace when missing', async () => {
    const input = {
        workId: 'work-1',
        investigationId: 'investigation-1',
    };

    const ui = createServices();
    const output = await executeUiAction(createContext('user', ['works:write', 'tabs:write'], ui.services), 'work.ensureInvestigationWorkspace', input);

    assert.equal((output.data as any).linkedTabId, savedTabSignature(ui.savedTabs).tabId);
    assert.deepEqual(savedTabSignature(ui.savedTabs).workspaceScope, {
        type: 'work_investigation',
        workId: 'work-1',
        investigationId: 'investigation-1',
    });
    assert.deepEqual(linkedWorkspaceSignature(ui.savedTabs), {
        connectionId: 'conn-1',
        workspaceScopeType: 'work_investigation',
        workspaceScopeWorkId: 'work-1',
        hasWorkspaceInvestigationId: true,
        tabType: 'sql',
        tabName: 'Error Rate Analysis',
        content: '',
        resultMetaWorkId: 'work-1',
        hasResultMetaInvestigationId: true,
        resultMetaSource: 'work-investigation',
    });
});

test('investigation workspace SQL block keeps Purpose next to the SQL', () => {
    assert.equal(
        investigationSqlAssetBlockContent({
            purposeTitle: 'Status Count',
            sql: 'select status, count(*) as orders\nfrom orders\ngroup by status',
        }),
        '-- Purpose: Status Count\nselect status, count(*) as orders\nfrom orders\ngroup by status;',
    );
});

test('work SQL workspace content appends SQL blocks without seed comments', () => {
    const seedContent = investigationWorkspaceContent({
        workTitle: 'Untitled Work',
        goal: 'Analyze orders.',
        investigationTitle: 'Order Status Distribution',
    });
    const firstBlock = investigationSqlAssetBlockContent({
        purposeTitle: 'Status Count',
        sql: 'select status, count(*) as orders\nfrom orders\ngroup by status',
    });
    const firstContent = sqlWorkspaceContentWithBlock({
        seedContent,
        block: firstBlock,
        shouldAppend: false,
    });
    const secondBlock = investigationSqlAssetBlockContent({
        purposeTitle: 'Status Amount',
        sql: 'select status, sum(amount) as total_amount\nfrom orders\ngroup by status;',
    });

    assert.equal(
        sqlWorkspaceContentWithBlock({
            seedContent,
            existingContent: firstContent,
            block: secondBlock,
            shouldAppend: true,
        }),
        [
            '-- Purpose: Status Count',
            'select status, count(*) as orders',
            'from orders',
            'group by status;',
            '',
            '-- Purpose: Status Amount',
            'select status, sum(amount) as total_amount',
            'from orders',
            'group by status;',
        ].join('\n'),
    );
});

test('work SQL Purpose prefers the per-query title over the shared group title', () => {
    assert.deepEqual(
        resolveInvestigationSqlTitles({
            title: 'Daily price update count',
            groupTitle: 'Price update trend analysis',
            investigationTitle: 'Pricing analysis',
        }),
        {
            groupTitle: 'Price update trend analysis',
            purposeTitle: 'Daily price update count',
        },
    );
});

test('work SQL target selection reuses the same group tab', () => {
    const target = resolveInvestigationSqlTargetTab({
        linkedTabId: 'seed-tab',
        seedContent: 'seed',
        groupKey: 'status-distribution',
        tabs: [
            {
                tabId: 'seed-tab',
                userId: 'user-1',
                connectionId: 'conn-1',
                tabType: 'sql',
                tabName: 'Seed',
                content: 'seed',
                resultMeta: { source: 'work-investigation' },
            },
            {
                tabId: 'group-tab',
                userId: 'user-1',
                connectionId: 'conn-1',
                tabType: 'sql',
                tabName: 'Status Distribution',
                content: 'select 1',
                resultMeta: {
                    source: 'work-run',
                    sqlAssetGroupKey: 'status-distribution',
                },
            },
        ],
    });

    assert.equal(target.tabId, 'group-tab');
    assert.equal(target.shouldAppend, true);
});

test('work SQL target selection reuses only an empty seed tab for a new group', () => {
    const seedContent = investigationWorkspaceContent({
        workTitle: 'Untitled Work',
        goal: 'Analyze orders.',
        investigationTitle: 'Order Status Distribution',
    });
    const target = resolveInvestigationSqlTargetTab({
        linkedTabId: 'seed-tab',
        seedContent,
        groupKey: 'status-distribution',
        tabs: [
            {
                tabId: 'seed-tab',
                userId: 'user-1',
                connectionId: 'conn-1',
                tabType: 'sql',
                tabName: 'Seed',
                content: seedContent,
                resultMeta: { source: 'work-investigation' },
            },
        ],
    });

    assert.equal(target.tabId, 'seed-tab');
    assert.equal(target.shouldAppend, false);
});

test('work SQL target selection creates a new tab for a different group when seed has results', () => {
    const target = resolveInvestigationSqlTargetTab({
        linkedTabId: 'latest-tab',
        seedContent: 'seed',
        groupKey: 'quarterly-revenue',
        tabs: [
            {
                tabId: 'latest-tab',
                userId: 'user-1',
                connectionId: 'conn-1',
                tabType: 'sql',
                tabName: 'Monthly Revenue',
                content: 'select 1',
                resultMeta: {
                    source: 'work-run',
                    sessionId: 'session-1',
                    sqlAssetGroupKey: 'monthly-revenue',
                },
            },
        ],
    });

    assert.notEqual(target.tabId, 'latest-tab');
    assert.equal(target.shouldAppend, false);
});

test('work.createInvestigation reuses an existing linked workspace when linkedTabId is provided', async () => {
    const input = {
        workId: 'work-1',
        title: 'Usage Trend Analysis',
        linkedTabId: 'existing-tab-1',
    };

    const ui = createServices();
    const uiOutput = await executeUiAction(createContext('user', ['works:write'], ui.services), 'work.createInvestigation', input);

    assert.equal((uiOutput.data as any).linkedTabId, 'existing-tab-1');
    assert.equal(ui.savedTabs.length, 0);
    assert.deepEqual(savedInvestigationSignature(ui.savedInvestigations), {
        workId: 'work-1',
        title: 'Usage Trend Analysis',
        status: 'draft',
        linkedTabId: 'existing-tab-1',
    });
});

test('work.updateConclusion accepts workId for Agent-facing tool calls', async () => {
    const input = {
        workId: 'work-1',
        conclusion: 'Gateway timeout errors increased after deploy.',
    };

    const agent = createServices();
    agent.savedInvestigations.push({
        id: 'investigation-1',
        workId: 'work-1',
        organizationId: 'org-1',
        connectionId: 'conn-1',
        title: 'Error Rate Analysis',
        status: 'completed',
        auditStatus: 'draft',
        linkedTabId: 'tab-1',
        lastQueryAt: new Date('2026-06-01T00:00:00.000Z'),
        reviewedAt: null,
        acceptedAt: null,
        rejectedAt: null,
        auditStatusUpdatedAt: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    agent.savedInvestigationFindings.push({
        id: 'finding-1',
        workId: 'work-1',
        investigationId: 'investigation-1',
        organizationId: 'org-1',
        content: 'Gateway timeout errors increased after deploy.',
        sourceTabId: 'tab-1',
        sourceRunEventId: null,
        createdBy: 'agent',
        orderIndex: 0,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const agentAudit: unknown[] = [];
    const agentTool = actionToAgentTool(workUpdateConclusionAction, () => createContext('agent', ['works:write'], agent.services, agentAudit));
    const agentOutput = await (agentTool.execute as any)(input);

    assert.equal(agentOutput.ok, true);
    assert.equal(agentOutput.conclusion, input.conclusion);
    assert.deepEqual(savedConclusionSignature(agent.savedConclusions), {
        id: 'work-1',
        conclusion: input.conclusion,
    });
    assert.deepEqual(auditSignature(agentAudit), {
        actionId: 'work.updateConclusion',
        hasRequestId: true,
        status: 'success',
        risk: 'low',
        effects: ['work:update'],
        resourceType: 'work',
    });
});

test('work.updateInvestigation keeps confirm and exclude human-only while allowing user confirmation with SQL-backed finding', async () => {
    const input = {
        workId: 'work-1',
        id: 'investigation-1',
        auditStatus: 'accepted',
    };

    const ui = createServices();
    ui.savedInvestigationFindings.push({
        id: 'finding-1',
        workId: 'work-1',
        investigationId: 'investigation-1',
        organizationId: 'org-1',
        content: 'Gateway timeout errors increased after deploy.',
        sourceTabId: 'tab-1',
        sourceRunEventId: null,
        createdBy: 'agent',
        orderIndex: 0,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const uiOutput = await executeUiAction(createContext('user', ['works:write'], ui.services), 'work.updateInvestigation', input);
    assert.equal((uiOutput.data as { auditStatus?: unknown }).auditStatus, 'accepted');

    const agent = createServices();
    const agentTool = actionToAgentTool(workUpdateInvestigationAction, () => createContext('agent', ['works:write'], agent.services));
    const agentOutput = (await (agentTool.execute as (input: unknown) => Promise<{ ok: boolean; error: { message: string } }>)({
        workId: 'work-1',
        id: 'investigation-1',
        auditStatus: 'rejected',
    })) as { ok: boolean; error: { message: string } };
    assert.equal(agentOutput.ok, false);
    assert.match(agentOutput.error.message, /Only a human can confirm or exclude/);
});

test('work.updateInvestigation requires SQL-backed finding before user confirmation', async () => {
    const ui = createServices();

    await assert.rejects(
        () =>
            executeUiAction(createContext('user', ['works:write'], ui.services), 'work.updateInvestigation', {
                workId: 'work-1',
                id: 'investigation-1',
                auditStatus: 'accepted',
            }),
        /SQL-backed Finding/,
    );
});

test('work.createInvestigationFinding can be executed through UI, Agent, and Automation with shared action semantics', async () => {
    const input = {
        workId: 'work-1',
        investigationId: 'investigation-1',
        content: 'Gateway timeout errors increased after deploy.',
        sourceTabId: 'tab-1',
        sourceRunEventId: 'event-1',
    };

    const ui = createServices();
    const uiAudit: unknown[] = [];
    const uiOutput = await executeUiAction(createContext('user', ['works:write'], ui.services, uiAudit), 'work.createInvestigationFinding', input);

    const agent = createServices();
    const agentAudit: unknown[] = [];
    const agentTool = actionToAgentTool(workCreateInvestigationFindingAction, () => createContext('agent', ['works:write'], agent.services, agentAudit));
    const agentOutput = await (agentTool.execute as any)(input);

    const automation = createServices();
    const automationAudit: unknown[] = [];
    const automationOutput = await executeAction(createContext('automation', ['works:write'], automation.services, automationAudit), 'work.createInvestigationFinding', input);

    assert.equal((uiOutput.data as any).content, input.content);
    assert.equal(agentOutput.ok, true);
    assert.equal(agentOutput.content, input.content);
    assert.equal((automationOutput.data as any).content, input.content);
    assert.deepEqual(savedInvestigationFindingSignature(agent.savedInvestigationFindings), {
        ...savedInvestigationFindingSignature(ui.savedInvestigationFindings),
        createdBy: 'agent',
    });
    assert.deepEqual(savedInvestigationFindingSignature(automation.savedInvestigationFindings), {
        ...savedInvestigationFindingSignature(ui.savedInvestigationFindings),
        createdBy: 'automation',
    });
    assert.deepEqual(auditSignature(agentAudit), auditSignature(uiAudit));
    assert.deepEqual(auditSignature(automationAudit), auditSignature(uiAudit));
});

test('work.createInvestigationFinding uses the same works:write gate through UI, Agent, and Automation', async () => {
    const input = {
        workId: 'work-1',
        investigationId: 'investigation-1',
        content: 'Gateway timeout errors increased after deploy.',
    };

    const ui = createServices();
    await assert.rejects(() => executeUiAction(createContext('user', [], ui.services), 'work.createInvestigationFinding', input), /Missing action scope "works:write"/);

    const agent = createServices();
    const agentTool = actionToAgentTool(workCreateInvestigationFindingAction, () => createContext('agent', [], agent.services));
    const agentOutput = await (agentTool.execute as any)(input);
    assert.equal(agentOutput.ok, false);
    assert.equal(agentOutput.error.code, 'ACTION_SCOPE_MISSING');

    const automation = createServices();
    await assert.rejects(() => executeAction(createContext('automation', [], automation.services), 'work.createInvestigationFinding', input), /Missing action scope "works:write"/);
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
