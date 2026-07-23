import { z } from 'zod';

import { updateComparisonAndRun } from '@/lib/comparison/service';

import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { scheduleComparisonAiReview } from './schedule-review';
import { comparisonConfigurationInputSchema, comparisonMutationOutputSchema } from './shared';

export const comparisonUpdateAction = defineWebAction({
    id: 'comparison.update',
    domain: 'comparison',
    kind: 'command',
    risk: 'low',
    inputSchema: comparisonConfigurationInputSchema.extend({
        comparisonId: z.string().min(1),
        workId: z.string().min(1).nullable().optional(),
    }),
    outputSchema: comparisonMutationOutputSchema.extend({
        configurationChanged: z.boolean(),
    }),
    permissions: readConnection,
    scopes: ['comparisons:write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    handler: async (ctx, input) => {
        const output = await updateComparisonAndRun(ctx.services.db, {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            comparisonId: input.comparisonId,
            actorType: ctx.actor.type,
            workId: input.workId,
            configuration: input,
        });
        scheduleComparisonAiReview(ctx, output.run);
        return output;
    },
});
