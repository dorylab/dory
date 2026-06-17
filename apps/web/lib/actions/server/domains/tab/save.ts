import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { writeWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { normalizeWorkspaceScopeInput, workspaceScopeInputSchema } from '../../workspace-scope';

export const tabSaveAction = defineWebAction({
    id: 'tab.save',
    domain: 'tab',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        tabId: z.string().min(1),
        state: z.any(),
        resultMeta: z.any().optional().nullable(),
        workspaceScope: workspaceScopeInputSchema,
    }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['tabs:write'],
    actors: ['user', 'agent', 'automation'],
    handler: async (ctx, input) => {
        const isTable = input.state.tabType === 'table';
        const workspaceScope = normalizeWorkspaceScopeInput(input.workspaceScope ?? input.state.workspaceScope);
        await ctx.services.db.tabState.saveTabState({
            tabId: input.tabId,
            userId: ctx.userId,
            connectionId: resolveConnectionId(ctx, input),
            workspaceScope,
            state: {
                content: isTable ? '' : input.state.content || null,
                databaseName: isTable ? input.state.databaseName : (input.state.databaseName ?? null),
                tableName: isTable ? input.state.tableName : (input.state.tableName ?? null),
                activeSubTab: isTable ? (input.state.activeSubTab ?? 'data') : (input.state.activeSubTab ?? null),
                tabType: input.state.tabType ?? input.state.type,
                tabName: input.state.tabName ?? null,
                orderIndex: input.state.orderIndex,
                createdAt: input.state.createdAt,
                workSyncState: input.state.workSyncState,
                lastAgentRunId: input.state.lastAgentRunId ?? null,
                lastAgentEventId: input.state.lastAgentEventId ?? null,
                lastAgentSyncedAt: input.state.lastAgentSyncedAt ?? null,
                lastHumanEditedAt: input.state.lastHumanEditedAt ?? null,
            },
            resultMeta: input.resultMeta ?? input.state.resultMeta ?? null,
        });
        if (typeof input.state.tabName === 'string') {
            await ctx.services.db.tabState.updateTabName({
                tabId: input.tabId,
                userId: ctx.userId,
                connectionId: resolveConnectionId(ctx, input),
                newName: input.state.tabName,
            });
        }
        return { ok: true };
    },
});
