import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';

export const workDeleteAction = defineWebAction({
    id: 'work.delete',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:delete'],
    inputSchema: z.object({
        id: z.string().min(1),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'automation'],
    audit: {
        allowInputFields: ['id'],
        resource: (_ctx, input) => ({ type: 'work', id: input.id }),
    },
    handler: async (ctx, input) => {
        await ctx.services.db.works.delete({ organizationId: ctx.organizationId, id: input.id });
        return { ok: true };
    },
});
