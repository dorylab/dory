import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { writeWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const tabSaveAction = defineWebAction({
    id: 'tab.save',
    domain: 'tab',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        workId: z.string().min(1).nullable().optional(),
        tabId: z.string().min(1),
        state: z.any(),
        resultMeta: z.any().optional().nullable(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['tabs:write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_save_tab',
        title: 'Save Dory tab',
        description: 'Save SQL console tab state for a Dory connection.',
    },
    handler: async (ctx, input) => {
        const isTable = input.state.tabType === 'table';
        await ctx.services.db.tabState.saveTabState({
            tabId: input.tabId,
            userId: ctx.userId,
            connectionId: resolveConnectionId(ctx, input),
            workId: input.workId ?? input.state.workId ?? null,
            state: {
                content: isTable ? '' : input.state.content || null,
                databaseName: isTable ? input.state.databaseName : (input.state.databaseName ?? null),
                tableName: isTable ? input.state.tableName : (input.state.tableName ?? null),
                activeSubTab: isTable ? (input.state.activeSubTab ?? 'data') : (input.state.activeSubTab ?? null),
                tabType: input.state.tabType ?? input.state.type,
                tabName: input.state.tabName ?? null,
                orderIndex: input.state.orderIndex,
                createdAt: input.state.createdAt,
            },
            resultMeta: input.resultMeta ?? input.state.resultMeta ?? null,
        });
        if (typeof input.state.tabName === 'string') {
            await ctx.services.db.tabState.updateTabName({
                tabId: input.tabId,
                userId: ctx.userId,
                connectionId: resolveConnectionId(ctx, input),
                workId: input.workId ?? input.state.workId ?? null,
                newName: input.state.tabName,
            });
        }
        return { ok: true };
    },
});
