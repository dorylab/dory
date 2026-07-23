import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';

export const comparisonDeleteAction = defineWebAction({
    id: 'comparison.delete',
    domain: 'comparison',
    kind: 'command',
    risk: 'destructive',
    inputSchema: z.object({ comparisonId: z.string().min(1) }),
    outputSchema: z.object({ deleted: z.array(z.string()) }),
    permissions: writeWorkspace,
    scopes: ['comparisons:write'],
    actors: ['user', 'mcp', 'automation'],
    handler: async (ctx, input) => {
        await ctx.services.db.comparisons.delete(ctx.organizationId, input.comparisonId);
        return { deleted: [input.comparisonId] };
    },
});
