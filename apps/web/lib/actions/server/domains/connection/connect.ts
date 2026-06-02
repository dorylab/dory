import { z } from 'zod';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const connectionConnectAction = defineWebAction({
    id: 'connection.connect',
    domain: 'connection',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1), identityId: z.string().min(1).optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['connections:read'],
    actors: ['user', 'automation'],
    handler: async (ctx, input) => {
        const startedAt = Date.now();
        const { entry, identity, config } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, input.connectionId, input.identityId ?? null);
        const health = await entry.instance.ping();
        const tookMs = typeof health?.tookMs === 'number' ? health.tookMs : Date.now() - startedAt;
        await ctx.services.db.connections.updateLastCheck(input.connectionId, {
            status: 'ok',
            tookMs,
            error: null,
            checkedAt: new Date(),
            organizationId: ctx.organizationId,
        });
        return {
            connectionId: config.id,
            identityId: identity.id ?? null,
            status: 'Connected',
            lastCheckStatus: 'ok',
            lastCheckAt: new Date().toISOString(),
            lastCheckLatencyMs: tookMs,
            lastCheckError: null,
        };
    },
});
