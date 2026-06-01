import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { projectConnectionListForTools } from '../../projections';
import { connectionListOutputSchema, connectionListToolOutputSchema } from '../../schemas';

export const connectionListAction = defineWebAction({
    id: 'connection.list',
    domain: 'connection',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({}),
    outputSchema: connectionListOutputSchema,
    permissions: readConnection,
    scopes: ['connections:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    projections: {
        ui: {
            schema: connectionListOutputSchema,
        },
        agent: {
            schema: connectionListToolOutputSchema,
            project: projectConnectionListForTools,
        },
        mcp: {
            schema: connectionListToolOutputSchema,
            project: projectConnectionListForTools,
        },
    },
    mcp: {
        name: 'dory_list_connections',
        title: 'List Dory connections',
        description: 'List database connections available to this Dory organization without returning secrets.',
    },
    handler: async ctx => ({
        connections: await ctx.services.db.connections.list(ctx.organizationId),
    }),
});
