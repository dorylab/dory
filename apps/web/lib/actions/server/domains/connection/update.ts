import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { updateConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { sanitizeConnectionSyncPayload } from './sanitize';

const connectionPatchSchema = z
    .record(z.string(), z.unknown())
    .describe('Partial Dory connection payload. Include only fields to update, such as name, host, port, database, username, password, ssl, environment, identities, or ssh.');

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
        const updated = await ctx.services.db.connections.update(ctx.organizationId, input.id, input.patch as any);
        const syncPayload = sanitizeConnectionSyncPayload(input.patch);
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
