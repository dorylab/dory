import { z } from 'zod';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const schemaGetFunctionDetailAction = defineWebAction({
    id: 'schema.getFunctionDetail',
    domain: 'schema',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        database: z.string().min(1),
        functionName: z.string().min(1),
        schema: z.string().optional().nullable(),
        identityId: z.string().min(1).optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['schema:read'],
    actors: ['user', 'agent', 'automation'],
    handler: async (ctx, input) => {
        const connectionId = resolveConnectionId(ctx, input);
        const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
        return { function: await entry.instance.getFunctionDetail(input.database, input.functionName, input.schema ?? null) };
    },
});
