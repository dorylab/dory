import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { comparisonRunOutputSchema } from './shared';

export const comparisonRunGetAction = defineWebAction({
    id: 'comparison.run.get',
    domain: 'comparison',
    kind: 'query',
    risk: 'read',
    inputSchema: z
        .object({
            comparisonId: z.string().min(1),
            runId: z.string().min(1),
        })
        .strict(),
    outputSchema: comparisonRunOutputSchema,
    permissions: readWorkspace,
    scopes: ['comparisons:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    handler: (ctx, input) => ctx.services.db.comparisons.getRun(ctx.organizationId, input.comparisonId, input.runId),
});
