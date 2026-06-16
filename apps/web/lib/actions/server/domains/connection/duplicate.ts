import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { createConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const connectionDuplicateAction = defineWebAction({
    id: 'connection.duplicate',
    domain: 'connection',
    kind: 'command',
    risk: 'write',
    inputSchema: z.object({ id: z.string().min(1) }),
    outputSchema: unknownOutputSchema,
    permissions: createConnection,
    scopes: ['connections:write'],
    actors: ['user'],
    requiresConfirmation: false,
    handler: async (ctx, input) => {
        const created = await ctx.services.db.connections.duplicate(ctx.userId, ctx.organizationId, input.id);
        await ctx.services.db.syncOperations.enqueue({
            organizationId: ctx.organizationId,
            entityType: 'connection',
            entityId: created.connection.id,
            operation: 'create',
            payload: {
                duplicatedFromId: input.id,
                connection: created.connection,
                identities: created.identities,
                ssh: created.ssh,
                tls: created.tls ?? null,
            },
        });
        return created;
    },
});
