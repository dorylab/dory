import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { writeWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const savedQueryDeleteAction = defineWebAction({
    id: 'savedQuery.delete',
    domain: 'savedQuery',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1) }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['saved_queries:write'],
    actors: ['user', 'automation'],
    handler: async (ctx, input) => {
        await ctx.services.db.savedQueries.delete({ organizationId: ctx.organizationId, userId: ctx.userId, id: input.id, connectionId: resolveConnectionId(ctx, input) });
        return { deleted: [input.id] };
    },
});
