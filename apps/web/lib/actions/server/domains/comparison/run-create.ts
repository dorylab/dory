import { z } from 'zod';

import { runSchemaComparison } from '@/lib/comparison/service';

import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { scheduleComparisonAiReview } from './schedule-review';
import { comparisonMutationOutputSchema } from './shared';

export const comparisonRunCreateAction = defineWebAction({
    id: 'comparison.run.create',
    domain: 'comparison',
    kind: 'command',
    risk: 'low',
    inputSchema: z
        .object({
            comparisonId: z.string().min(1),
            workId: z.string().min(1).nullable().optional(),
        })
        .strict(),
    outputSchema: comparisonMutationOutputSchema,
    permissions: readConnection,
    scopes: ['comparisons:write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    handler: async (ctx, input) => {
        const output = await runSchemaComparison(ctx.services.db, {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            comparisonId: input.comparisonId,
            actorType: ctx.actor.type,
            workId: input.workId,
        });
        scheduleComparisonAiReview(ctx, output.run);
        return output;
    },
});
