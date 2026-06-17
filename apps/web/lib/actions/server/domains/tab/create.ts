import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { createWorkspaceTab } from '../../workspace-tabs';
import { workspaceScopeInputSchema } from '../../workspace-scope';

const tabTypeSchema = z.enum(['sql', 'table']);

const tabCreateInputSchema = z.object({
    connectionId: z.string().min(1).optional(),
    tabId: z.string().min(1).optional(),
    tabType: tabTypeSchema.default('sql'),
    tabName: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    databaseName: z.string().nullable().optional(),
    tableName: z.string().nullable().optional(),
    activeSubTab: z.enum(['overview', 'data', 'structure', 'indexes', 'stats']).nullable().optional(),
    orderIndex: z.number().int().min(0).nullable().optional(),
    createdAt: z.string().nullable().optional(),
    resultMeta: z.any().optional().nullable(),
    workspaceScope: workspaceScopeInputSchema,
    workSyncState: z.enum(['agent_generated', 'human_edited', 'unsynced', 'synced', 'running', 'failed']).optional(),
    lastAgentRunId: z.string().nullable().optional(),
    lastAgentEventId: z.string().nullable().optional(),
    lastAgentSyncedAt: z.string().nullable().optional(),
    lastHumanEditedAt: z.string().nullable().optional(),
});

const tabCreateOutputSchema = z.object({
    tabId: z.string(),
    tabType: tabTypeSchema,
    tabName: z.string().nullable(),
    content: z.string().optional(),
    status: z.string().optional(),
    userId: z.string(),
    connectionId: z.string(),
    databaseName: z.string().nullable().optional(),
    tableName: z.string().nullable().optional(),
    activeSubTab: z.string().nullable().optional(),
    orderIndex: z.number().nullable().optional(),
    createdAt: z.string(),
    workspaceScope: z.any().optional(),
    workSyncState: z.string().optional(),
    lastAgentRunId: z.string().nullable().optional(),
    lastAgentEventId: z.string().nullable().optional(),
    lastAgentSyncedAt: z.string().nullable().optional(),
    lastHumanEditedAt: z.string().nullable().optional(),
});

export const tabCreateAction = defineWebAction({
    id: 'tab.create',
    domain: 'tab',
    kind: 'command',
    risk: 'low',
    effects: ['tab:create'],
    inputSchema: tabCreateInputSchema,
    outputSchema: tabCreateOutputSchema,
    permissions: writeWorkspace,
    scopes: ['tabs:write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_create_tab',
        title: 'Create Dory tab',
        description: 'Create a SQL or table tab in the Dory SQL console.',
    },
    audit: {
        sourceByActor: {
            user: 'user_sql_console',
            agent: 'ai_analysis',
            mcp: 'mcp_analysis',
            automation: 'automation_schema_metadata',
        },
        allowInputFields: ['connectionId', 'tabId', 'tabType', 'tabName', 'databaseName', 'tableName', 'workspaceScope'],
        resource: (_ctx, input) => ({
            type: 'tab',
            id: input.tabId ?? null,
            metadata: {
                connectionId: input.connectionId ?? null,
                tabType: input.tabType,
                databaseName: input.databaseName ?? null,
                tableName: input.tableName ?? null,
                workspaceScope: input.workspaceScope ?? null,
            },
        }),
        outputSummary: output => ({
            tabId: output.tabId,
            tabType: output.tabType,
            connectionId: output.connectionId,
        }),
    },
    handler: (ctx, input) => createWorkspaceTab(ctx, input),
});
