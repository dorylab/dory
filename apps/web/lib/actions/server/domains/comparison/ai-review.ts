import { z } from 'zod';

import { reviewSchemaComparison } from '@/lib/comparison/ai-review';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { comparisonJobOutputSchema } from './shared';

export const comparisonAiReviewAction = defineWebAction({
    id: 'comparison.aiReview',
    domain: 'comparison',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({
        comparisonId: z.string().min(1),
        workId: z.string().min(1).nullable().optional(),
        deploymentContext: z.string().max(4000).nullable().optional(),
    }),
    outputSchema: z.object({
        job: comparisonJobOutputSchema,
        review: z.object({}).passthrough(),
    }),
    permissions: readWorkspace,
    scopes: ['analysis:run', 'comparisons:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    handler: async (ctx, input) => {
        const job = await ctx.services.db.comparisons.get(ctx.organizationId, input.comparisonId);
        if (input.workId && job.workId !== input.workId) {
            throw new Error('Comparison does not belong to this Agent Run.');
        }
        const review = await reviewSchemaComparison({
            db: ctx.services.db,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            comparisonId: input.comparisonId,
            deploymentContext: input.deploymentContext,
            locale: ctx.locale,
            req: ctx.services.req,
        });
        return {
            job: await ctx.services.db.comparisons.get(ctx.organizationId, input.comparisonId),
            review,
        };
    },
});
