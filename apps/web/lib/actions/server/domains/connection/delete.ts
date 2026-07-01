import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { deleteConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const connectionDeleteAction = defineWebAction({
    id: 'connection.delete',
    domain: 'connection',
    kind: 'command',
    risk: 'destructive',
    inputSchema: z.object({ id: z.string().min(1) }),
    outputSchema: unknownOutputSchema,
    permissions: deleteConnection,
    scopes: ['connections:write'],
    actors: ['user', 'mcp', 'automation'],
    handler: async (ctx, input) => {
        await ctx.services.db.connections.delete(ctx.organizationId, input.id);
        await ctx.services.db.syncOperations.enqueue({
            organizationId: ctx.organizationId,
            entityType: 'connection',
            entityId: input.id,
            operation: 'delete',
            payload: { id: input.id },
        });
        return { deleted: [input.id] };
    },
});
