import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { createConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { connectionCreatePayloadSchema, normalizeConnectionCreatePayload } from './payload';
import { sanitizeConnectionSyncPayload } from './sanitize';

export const connectionCreateAction = defineWebAction({
    id: 'connection.create',
    domain: 'connection',
    kind: 'command',
    risk: 'write',
    inputSchema: z.object({
        payload: connectionCreatePayloadSchema,
    }),
    outputSchema: unknownOutputSchema,
    permissions: createConnection,
    scopes: ['connections:write'],
    actors: ['user', 'mcp', 'automation'],
    requiresConfirmation: false,
    handler: async (ctx, input) => {
        const payload = normalizeConnectionCreatePayload(input.payload);
        const created = await ctx.services.db.connections.create(ctx.userId, ctx.organizationId, payload as any);
        const syncPayload = sanitizeConnectionSyncPayload(payload);
        await ctx.services.db.syncOperations.enqueue({
            organizationId: ctx.organizationId,
            entityType: 'connection',
            entityId: created.connection.id,
            operation: 'create',
            payload: syncPayload,
        });
        return created;
    },
});
