import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { writeWorkspace } from '../../policies';

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
        allowInputFields: ['connectionId', 'tabId', 'tabType', 'tabName', 'databaseName', 'tableName'],
        resource: (_ctx, input) => ({
            type: 'tab',
            id: input.tabId ?? null,
            metadata: {
                connectionId: input.connectionId ?? null,
                tabType: input.tabType,
                databaseName: input.databaseName ?? null,
                tableName: input.tableName ?? null,
            },
        }),
        outputSummary: output => ({
            tabId: output.tabId,
            tabType: output.tabType,
            connectionId: output.connectionId,
        }),
    },
    handler: async (ctx, input) => {
        const connectionId = resolveConnectionId(ctx, input);
        const tabId = input.tabId?.trim() || randomUUID();
        const createdAt = input.createdAt ?? new Date().toISOString();
        const tabType = input.tabType;
        const tabName = input.tabName ?? (tabType === 'table' ? (input.tableName ?? 'Table') : 'New Query');
        const state =
            tabType === 'table'
                ? {
                      content: '',
                      databaseName: input.databaseName ?? null,
                      tableName: input.tableName ?? null,
                      activeSubTab: input.activeSubTab ?? 'data',
                      tabType,
                      tabName,
                      orderIndex: input.orderIndex ?? null,
                      createdAt,
                  }
                : {
                      content: input.content ?? '',
                      databaseName: input.databaseName ?? null,
                      tableName: null,
                      activeSubTab: null,
                      tabType,
                      tabName,
                      orderIndex: input.orderIndex ?? null,
                      createdAt,
                  };

        await ctx.services.db.tabState.saveTabState({
            tabId,
            userId: ctx.userId,
            connectionId,
            state,
            resultMeta: input.resultMeta ?? null,
        });

        return {
            tabId,
            tabType,
            tabName,
            ...(tabType === 'sql' ? { content: input.content ?? '', status: 'idle' } : {}),
            userId: ctx.userId,
            connectionId,
            databaseName: input.databaseName ?? null,
            tableName: tabType === 'table' ? (input.tableName ?? null) : null,
            activeSubTab: tabType === 'table' ? (input.activeSubTab ?? 'data') : null,
            orderIndex: input.orderIndex ?? null,
            createdAt,
        };
    },
});
