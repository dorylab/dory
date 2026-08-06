import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { createConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { connectionCreatePayloadSchema, normalizeConnectionCreatePayload } from './payload';
import { sanitizeConnectionSyncPayload } from './sanitize';
import { prepareLocalDatabaseCreation } from '@/lib/connection/local-database-creation';

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
        const { createLocalDatabase, ...persistablePayload } = payload;
        let cleanupCreatedDatabase: (() => Promise<void>) | null = null;

        if (createLocalDatabase) {
            if (ctx.actor.type !== 'user') {
                throw new Error('Only an interactive user can create a local database file');
            }
            const prepared = await prepareLocalDatabaseCreation(persistablePayload.connection);
            persistablePayload.connection = prepared.connection;
            cleanupCreatedDatabase = prepared.cleanup;
        }

        let created;
        try {
            created = await ctx.services.db.connections.create(ctx.userId, ctx.organizationId, persistablePayload as any);
        } catch (error) {
            await cleanupCreatedDatabase?.();
            throw error;
        }

        const syncPayload = sanitizeConnectionSyncPayload(persistablePayload);
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
