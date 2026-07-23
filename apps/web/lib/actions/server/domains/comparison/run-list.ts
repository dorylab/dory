import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { comparisonRunOutputSchema } from './shared';

export const comparisonRunListAction = defineWebAction({
    id: 'comparison.run.list',
    domain: 'comparison',
    kind: 'query',
    risk: 'read',
    inputSchema: z
        .object({
            comparisonId: z.string().min(1),
            limit: z.number().int().positive().max(100).optional(),
            offset: z.number().int().min(0).optional(),
        })
        .strict(),
    outputSchema: z
        .object({
            rows: z.array(comparisonRunOutputSchema),
            total: z.number().int().nonnegative(),
        })
        .strict(),
    permissions: readWorkspace,
    scopes: ['comparisons:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    handler: (ctx, input) => ctx.services.db.comparisons.listRuns(ctx.organizationId, input.comparisonId, input),
});
