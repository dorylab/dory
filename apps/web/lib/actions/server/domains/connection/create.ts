import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { createConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { sanitizeConnectionSyncPayload } from './sanitize';

const connectionPayloadSchema = z
    .record(z.string(), z.unknown())
    .describe(
        'Dory connection payload. Common fields include name, type/engine, host, port, database, username, password, ssl, environment, identities, and ssh depending on the driver.',
    );

export const connectionCreateAction = defineWebAction({
    id: 'connection.create',
    domain: 'connection',
    kind: 'command',
    risk: 'write',
    inputSchema: z.object({
        payload: connectionPayloadSchema,
    }),
    outputSchema: unknownOutputSchema,
    permissions: createConnection,
    scopes: ['connections:write'],
    actors: ['user', 'mcp', 'automation'],
    requiresConfirmation: false,
    handler: async (ctx, input) => {
        const created = await ctx.services.db.connections.create(ctx.userId, ctx.organizationId, input.payload as any);
        const syncPayload = sanitizeConnectionSyncPayload(input.payload);
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
