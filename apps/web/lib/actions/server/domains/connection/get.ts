import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { projectConnectionGetForTools } from '../../projections';
import { connectionGetToolOutputSchema, unknownOutputSchema } from '../../schemas';
import { withCredentiallessDefaultIdentity } from '@/lib/connection/credentialless-identity';

export const connectionGetAction = defineWebAction({
    id: 'connection.get',
    domain: 'connection',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ id: z.string().min(1) }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['connections:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    projections: {
        agent: {
            schema: connectionGetToolOutputSchema,
            project: projectConnectionGetForTools,
        },
        mcp: {
            schema: connectionGetToolOutputSchema,
            project: projectConnectionGetForTools,
        },
    },
    mcp: {
        name: 'dory_get_connection',
        title: 'Get Dory connection',
        description: 'Get one database connection available to this Dory organization without returning secrets.',
    },
    handler: async (ctx, input) => {
        const record = await ctx.services.db.connections.getById(ctx.organizationId, input.id);
        if (!record) throw new Error('Connection not found.');
        return withCredentiallessDefaultIdentity(record);
    },
});
