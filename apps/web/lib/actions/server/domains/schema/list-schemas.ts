import { z } from 'zod';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const schemaListSchemasAction = defineWebAction({
    id: 'schema.listSchemas',
    domain: 'schema',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), identityId: z.string().min(1).optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['schema:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_list_schemas',
        title: 'List database schemas',
        description: 'List schemas/namespaces in a database for a Dory connection.',
    },
    handler: async (ctx, input) => {
        const connectionId = resolveConnectionId(ctx, input);
        const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
        if (!entry.instance.capabilities.metadata?.getSchemas) return [];
        return await entry.instance.listSchemas(input.database);
    },
});
