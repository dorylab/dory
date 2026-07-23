import { z } from 'zod';

import { createSchemaComparison, type CreateSchemaComparisonOutput } from '@/lib/comparison/service';

import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { comparisonEndpointSchema, comparisonJobOutputSchema } from './shared';

export const comparisonSchemaCreateAction = defineWebAction({
    id: 'comparison.schema.create',
    domain: 'comparison',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({
        current: comparisonEndpointSchema,
        desired: comparisonEndpointSchema,
        workId: z.string().min(1).nullable().optional(),
        previousComparisonId: z.string().min(1).nullable().optional(),
    }),
    outputSchema: comparisonJobOutputSchema,
    permissions: readConnection,
    scopes: ['comparisons:write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    audit: {
        sourceByActor: {
            user: 'user_schema_compare',
            agent: 'agent_schema_compare',
            mcp: 'mcp_schema_compare',
            automation: 'automation_schema_compare',
        },
        inputSummary: input => ({
            currentConnectionId: input.current.connectionId,
            currentDatabase: input.current.database,
            desiredConnectionId: input.desired.connectionId,
            desiredDatabase: input.desired.database,
            workId: input.workId ?? null,
        }),
        outputSummary: output => {
            const result = output as unknown as CreateSchemaComparisonOutput;
            return {
                comparisonId: result.job.id,
                resultSetId: result.job.resultSetId,
                readiness: result.comparison.summary.readiness,
                totalChanges: result.comparison.summary.totalChanges,
            };
        },
    },
    handler: async (ctx, input) => {
        return createSchemaComparison(ctx.services.db, {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            current: input.current,
            desired: input.desired,
            workId: input.workId,
            previousComparisonId: input.previousComparisonId,
        });
    },
});
