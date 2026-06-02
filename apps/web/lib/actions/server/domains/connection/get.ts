import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const connectionGetAction = defineWebAction({
    id: 'connection.get',
    domain: 'connection',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ id: z.string().min(1) }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['connections:read'],
    actors: ['user', 'agent', 'automation'],
    handler: async (ctx, input) => {
        const record = await ctx.services.db.connections.getById(ctx.organizationId, input.id);
        if (!record) throw new Error('Connection not found.');
        return record;
    },
});
