import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workInvestigationOutputSchema, workStatusSchema } from './schemas';

export const workUpdateInvestigationAction = defineWebAction({
    id: 'work.updateInvestigation',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:investigation:update'],
    inputSchema: z.object({
        workId: z.string().min(1),
        id: z.string().min(1),
        title: z.string().trim().min(1).optional(),
        status: workStatusSchema.optional(),
        linkedTabId: z.string().min(1).nullable().optional(),
        lastQueryAt: z.string().datetime().nullable().optional(),
    }),
    outputSchema: workInvestigationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['workId', 'id', 'status', 'linkedTabId', 'lastQueryAt'],
        resource: (_ctx, input) => ({ type: 'work_investigation', id: input.id, metadata: { workId: input.workId } }),
    },
    handler: (ctx, input) =>
        ctx.services.db.works.updateInvestigation({
            organizationId: ctx.organizationId,
            workId: input.workId,
            id: input.id,
            patch: {
                title: input.title,
                status: input.status,
                linkedTabId: input.linkedTabId,
                lastQueryAt: input.lastQueryAt,
            },
        }),
});
