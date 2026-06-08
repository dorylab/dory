import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { normalizeWorkspaceScopeInput, workspaceScopeInputSchema } from '../../workspace-scope';

export const tabListAction = defineWebAction({
    id: 'tab.list',
    domain: 'tab',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), workspaceScope: workspaceScopeInputSchema }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['tabs:read'],
    actors: ['user', 'automation'],
    handler: (ctx, input) => ctx.services.db.tabState.loadAllTab(ctx.userId, resolveConnectionId(ctx, input), normalizeWorkspaceScopeInput(input.workspaceScope)),
});
