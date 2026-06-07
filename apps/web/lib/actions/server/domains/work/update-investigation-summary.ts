import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workInvestigationOutputSchema, workStatusSchema } from './schemas';

export const workUpdateInvestigationSummaryAction = defineWebAction({
    id: 'work.updateInvestigationSummary',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:investigation:update'],
    inputSchema: z.object({
        workId: z.string().min(1),
        id: z.string().min(1),
        summary: z.string().trim().min(1),
        status: workStatusSchema.optional(),
    }),
    outputSchema: workInvestigationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['workId', 'id', 'status'],
        inputSummary: input => ({
            workId: input.workId,
            id: input.id,
            summaryLength: input.summary.length,
            status: input.status ?? null,
        }),
        resource: (_ctx, input) => ({ type: 'work_investigation', id: input.id, metadata: { workId: input.workId } }),
    },
    handler: (ctx, input) =>
        ctx.services.db.works.updateInvestigation({
            organizationId: ctx.organizationId,
            workId: input.workId,
            id: input.id,
            patch: {
                summary: input.summary,
                status: input.status,
            },
        }),
});
