import { z } from 'zod';

import { createComparisonAndRun } from '@/lib/comparison/service';

import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { scheduleComparisonAiReview } from './schedule-review';
import { comparisonConfigurationInputSchema, comparisonMutationOutputSchema } from './shared';

export const comparisonCreateAction = defineWebAction({
    id: 'comparison.create',
    domain: 'comparison',
    kind: 'command',
    risk: 'low',
    inputSchema: comparisonConfigurationInputSchema.extend({
        workId: z.string().min(1).nullable().optional(),
    }),
    outputSchema: comparisonMutationOutputSchema,
    permissions: readConnection,
    scopes: ['comparisons:write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    audit: {
        sourceByActor: {
            user: 'user_schema_comparison_create',
            agent: 'agent_schema_comparison_create',
            mcp: 'mcp_schema_comparison_create',
            automation: 'automation_schema_comparison_create',
        },
        inputSummary: input => ({
            name: input.name,
            sourceConnectionId: input.source.connectionId,
            targetConnectionId: input.target.connectionId,
            workId: input.workId ?? null,
        }),
        outputSummary: output => ({
            comparisonId: output.comparison.id,
            runId: output.run?.id ?? null,
            totalChanges: output.result?.summary.totalChanges ?? null,
        }),
    },
    handler: async (ctx, input) => {
        const output = await createComparisonAndRun(ctx.services.db, {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            actorType: ctx.actor.type,
            workId: input.workId,
            configuration: input,
        });
        scheduleComparisonAiReview(ctx, output.run);
        return output;
    },
});
