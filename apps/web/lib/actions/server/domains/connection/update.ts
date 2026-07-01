import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { updateConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { connectionPatchSchema, normalizeConnectionUpdatePatch } from './payload';
import { sanitizeConnectionSyncPayload } from './sanitize';

export const connectionUpdateAction = defineWebAction({
    id: 'connection.update',
    domain: 'connection',
    kind: 'command',
    risk: 'write',
    inputSchema: z.object({
        id: z.string().min(1),
        patch: connectionPatchSchema,
    }),
    outputSchema: unknownOutputSchema,
    permissions: updateConnection,
    scopes: ['connections:write'],
    actors: ['user', 'mcp', 'automation'],
    requiresConfirmation: false,
    handler: async (ctx, input) => {
        const patch = normalizeConnectionUpdatePatch(input.patch);
        const updated = await ctx.services.db.connections.update(ctx.organizationId, input.id, patch as any);
        const syncPayload = sanitizeConnectionSyncPayload(patch);
        await ctx.services.db.syncOperations.enqueue({
            organizationId: ctx.organizationId,
            entityType: 'connection',
            entityId: input.id,
            operation: 'update',
            payload: syncPayload,
        });
        return updated;
    },
});
