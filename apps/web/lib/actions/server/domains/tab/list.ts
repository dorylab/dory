import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const tabListAction = defineWebAction({
    id: 'tab.list',
    domain: 'tab',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['tabs:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_list_tabs',
        title: 'List Dory tabs',
        description: 'List saved SQL console tabs for a Dory connection.',
    },
    handler: (ctx, input) => ctx.services.db.tabState.loadAllTab(ctx.userId, resolveConnectionId(ctx, input)),
});
