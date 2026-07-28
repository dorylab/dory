import { z } from 'zod';

import { reviewSchemaComparison } from '@/lib/comparison/ai-review';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { comparisonRunOutputSchema } from './shared';

export const comparisonRunAiReviewAction = defineWebAction({
    id: 'comparison.run.aiReview',
    domain: 'comparison',
    kind: 'command',
    risk: 'low',
    inputSchema: z
        .object({
            comparisonId: z.string().min(1),
            runId: z.string().min(1),
            deploymentContext: z.string().max(4000).nullable().optional(),
        })
        .strict(),
    outputSchema: z
        .object({
            run: comparisonRunOutputSchema,
            review: z.object({
                summary: z.string(),
                deploymentNotes: z.array(z.string()),
                risks: z.array(z.object({ changeId: z.string(), explanation: z.string() })),
                recommendations: z.array(z.string()),
                limitations: z.array(z.string()),
                generatedAt: z.string(),
            }),
        })
        .strict(),
    permissions: readWorkspace,
    scopes: ['analysis:run', 'comparisons:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    handler: async (ctx, input) => {
        const review = await reviewSchemaComparison({
            db: ctx.services.db,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            comparisonId: input.comparisonId,
            runId: input.runId,
            deploymentContext: input.deploymentContext,
            locale: ctx.locale,
            req: ctx.services.req,
        });
        return {
            run: await ctx.services.db.comparisons.getRun(ctx.organizationId, input.comparisonId, input.runId),
            review,
        };
    },
});
