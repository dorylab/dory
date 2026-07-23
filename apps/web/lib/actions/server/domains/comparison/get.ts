import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { comparisonOutputSchema } from './shared';

export const comparisonGetAction = defineWebAction({
    id: 'comparison.get',
    domain: 'comparison',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ comparisonId: z.string().min(1) }).strict(),
    outputSchema: comparisonOutputSchema,
    permissions: readWorkspace,
    scopes: ['comparisons:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    handler: (ctx, input) => ctx.services.db.comparisons.get(ctx.organizationId, input.comparisonId),
});
