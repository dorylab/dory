import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { updateConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const connectionUpdateAction = defineWebAction({
    id: 'connection.update',
    domain: 'connection',
    kind: 'command',
    risk: 'write',
    inputSchema: z.object({ id: z.string().min(1), patch: z.record(z.string(), z.unknown()) }),
    outputSchema: unknownOutputSchema,
    permissions: updateConnection,
    scopes: ['connections:write'],
    actors: ['user', 'automation'],
    requiresConfirmation: false,
    handler: async (ctx, input) => {
        const updated = await ctx.services.db.connections.update(ctx.organizationId, input.id, input.patch as any);
        await ctx.services.db.syncOperations.enqueue({
            organizationId: ctx.organizationId,
            entityType: 'connection',
            entityId: input.id,
            operation: 'update',
            payload: input.patch,
        });
        return updated;
    },
});
