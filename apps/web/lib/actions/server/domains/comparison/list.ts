import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { comparisonOutputSchema } from './shared';

export const comparisonListAction = defineWebAction({
    id: 'comparison.list',
    domain: 'comparison',
    kind: 'query',
    risk: 'read',
    inputSchema: z
        .object({
            limit: z.number().int().positive().max(100).optional(),
            offset: z.number().int().min(0).optional(),
        })
        .strict(),
    outputSchema: z
        .object({
            rows: z.array(comparisonOutputSchema),
            total: z.number(),
        })
        .strict(),
    permissions: readWorkspace,
    scopes: ['comparisons:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    handler: (ctx, input) => ctx.services.db.comparisons.list(ctx.organizationId, input),
});
