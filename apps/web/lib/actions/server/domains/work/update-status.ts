import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workOutputSchema, workStatusSchema } from './schemas';

export const workUpdateStatusAction = defineWebAction({
    id: 'work.updateStatus',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:update'],
    inputSchema: z.object({
        id: z.string().min(1),
        status: workStatusSchema,
    }),
    outputSchema: workOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['id', 'status'],
        resource: (_ctx, input) => ({ type: 'work', id: input.id }),
    },
    handler: (ctx, input) => ctx.services.db.works.updateStatus({ organizationId: ctx.organizationId, id: input.id, status: input.status }),
});
