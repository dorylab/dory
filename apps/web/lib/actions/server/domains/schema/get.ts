import { z } from 'zod';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const schemaGetAction = defineWebAction({
    id: 'schema.get',
    domain: 'schema',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().optional(), identityId: z.string().min(1).optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['schema:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_get_schema',
        title: 'Get database schema',
        description: 'Get schema metadata for a database connection and optional database.',
    },
    handler: async (ctx, input) => {
        const connectionId = resolveConnectionId(ctx, input);
        const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
        return { ok: true, schema: await entry.instance.getSchema(input.database) };
    },
});
