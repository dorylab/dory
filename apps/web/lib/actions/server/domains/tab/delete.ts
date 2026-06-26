import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { writeWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const tabDeleteAction = defineWebAction({
    id: 'tab.delete',
    domain: 'tab',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), workId: z.string().min(1).nullable().optional(), tabId: z.string().min(1) }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['tabs:write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_delete_tab',
        title: 'Delete Dory tab',
        description: 'Delete a SQL console tab for a Dory connection.',
    },
    handler: async (ctx, input) => {
        await ctx.services.db.tabState.deleteTabState(input.tabId, ctx.userId, resolveConnectionId(ctx, input), input.workId ?? null);
        return { deleted: [input.tabId] };
    },
});
