import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';

const inputSchema = z.object({
    workId: z.string().min(1),
    id: z.string().min(1),
});

export const workDeleteInvestigationFindingAction = defineWebAction({
    id: 'work.deleteInvestigationFinding',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:investigation:finding:delete'],
    inputSchema,
    outputSchema: z.object({ ok: z.boolean() }),
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['workId', 'id'],
        resource: (_ctx, input) => ({ type: 'work_investigation_finding', id: input.id, metadata: { workId: input.workId } }),
    },
    handler: async (ctx, input) => {
        const finding = await ctx.services.db.works.getInvestigationFindingById({
            organizationId: ctx.organizationId,
            workId: input.workId,
            id: input.id,
        });

        await ctx.services.db.works.deleteInvestigationFinding({
            organizationId: ctx.organizationId,
            workId: input.workId,
            id: input.id,
        });

        if (ctx.actor.type === 'user' && finding) {
            await ctx.services.db.works.updateInvestigation({
                organizationId: ctx.organizationId,
                workId: input.workId,
                id: finding.investigationId,
                patch: { auditStatus: 'revised' },
            });
        }

        return { ok: true };
    },
});
