import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';

export const comparisonDeleteAction = defineWebAction({
    id: 'comparison.delete',
    domain: 'comparison',
    kind: 'command',
    risk: 'destructive',
    inputSchema: z.object({ comparisonId: z.string().min(1) }).strict(),
    outputSchema: z.object({ deleted: z.array(z.string()) }).strict(),
    permissions: writeWorkspace,
    scopes: ['comparisons:write'],
    actors: ['user', 'mcp', 'automation'],
    handler: async (ctx, input) => {
        const comparison = await ctx.services.db.comparisons.get(ctx.organizationId, input.comparisonId);
        if (comparison.latestRun?.status === 'running') {
            throw new Error('Wait for the active comparison run to finish before deleting this Comparison.');
        }
        await ctx.services.db.comparisons.delete(ctx.organizationId, input.comparisonId);
        return { deleted: [input.comparisonId] };
    },
});
