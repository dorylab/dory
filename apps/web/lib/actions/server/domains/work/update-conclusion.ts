import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workOutputSchema } from './schemas';

const workUpdateConclusionInputSchema = z.object({
    id: z.string().min(1).optional(),
    workId: z.string().min(1).optional(),
    conclusion: z.string().trim().nullable(),
});

export const workUpdateConclusionAction = defineWebAction({
    id: 'work.updateConclusion',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:update'],
    inputSchema: workUpdateConclusionInputSchema,
    outputSchema: workOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['id', 'workId'],
        inputSummary: input => ({ id: input.id ?? input.workId, conclusionLength: input.conclusion?.length ?? 0 }),
        resource: (_ctx, input) => ({ type: 'work', id: input.id ?? input.workId ?? null }),
    },
    handler: async (ctx, input) => {
        const id = input.id ?? input.workId;
        if (!id) throw new Error('Missing work id.');

        if (input.conclusion?.trim()) {
            const investigations = await ctx.services.db.works.listInvestigations({
                organizationId: ctx.organizationId,
                workId: id,
            });
            if (!investigations.some(investigation => investigation.auditStatus === 'accepted')) {
                throw new Error('Accept at least one Analysis before updating the Work conclusion.');
            }
        }

        return ctx.services.db.works.updateConclusion({ organizationId: ctx.organizationId, id, conclusion: input.conclusion });
    },
});
