import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { workOutputSchema } from './schemas';

export const workListAction = defineWebAction({
    id: 'work.list',
    domain: 'work',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        limit: z.number().int().positive().max(100).optional(),
    }),
    outputSchema: z.object({ works: z.array(workOutputSchema) }),
    permissions: readWorkspace,
    scopes: ['works:read'],
    actors: ['user', 'agent', 'automation'],
    handler: async (ctx, input) => ({
        works: await ctx.services.db.works.list({
            organizationId: ctx.organizationId,
            connectionId: input.connectionId ?? null,
            limit: input.limit,
        }),
    }),
});
