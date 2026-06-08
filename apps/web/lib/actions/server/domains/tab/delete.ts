import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { writeWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { normalizeWorkspaceScopeInput, workspaceScopeInputSchema } from '../../workspace-scope';

export const tabDeleteAction = defineWebAction({
    id: 'tab.delete',
    domain: 'tab',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), tabId: z.string().min(1), workspaceScope: workspaceScopeInputSchema }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['tabs:write'],
    actors: ['user', 'automation'],
    handler: async (ctx, input) => {
        await ctx.services.db.tabState.deleteTabState(input.tabId, ctx.userId, resolveConnectionId(ctx, input), normalizeWorkspaceScopeInput(input.workspaceScope));
        return { deleted: [input.tabId] };
    },
});
