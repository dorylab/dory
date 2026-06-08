import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workOutputSchema } from './schemas';

export const workUpdateTitleAction = defineWebAction({
    id: 'work.updateTitle',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:update'],
    inputSchema: z.object({
        id: z.string().min(1),
        title: z.string().trim().min(1),
    }),
    outputSchema: workOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['id'],
        inputSummary: input => ({ id: input.id, titleLength: input.title.length }),
        resource: (_ctx, input) => ({ type: 'work', id: input.id }),
    },
    handler: (ctx, input) => ctx.services.db.works.updateTitle({ organizationId: ctx.organizationId, id: input.id, title: input.title }),
});
