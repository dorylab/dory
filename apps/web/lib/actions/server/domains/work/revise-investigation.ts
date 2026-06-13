import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workInvestigationOutputSchema } from './schemas';

export const workReviseInvestigationAction = defineWebAction({
    id: 'work.reviseInvestigation',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:investigation:revise'],
    inputSchema: z.object({
        workId: z.string().min(1),
        investigationId: z.string().min(1),
        instruction: z.string().trim().min(1).max(5000),
    }),
    outputSchema: workInvestigationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user'],
    audit: {
        allowInputFields: ['workId', 'investigationId'],
        inputSummary: input => ({
            workId: input.workId,
            investigationId: input.investigationId,
            instructionLength: input.instruction.length,
        }),
        resource: (_ctx, input) => ({ type: 'work_investigation', id: input.investigationId, metadata: { workId: input.workId } }),
    },
    handler: async (ctx, input) => {
        const investigation = await ctx.services.db.works.getInvestigationById({
            organizationId: ctx.organizationId,
            workId: input.workId,
            id: input.investigationId,
        });
        if (!investigation) throw new Error('Analysis not found.');
        if (investigation.auditStatus === 'rejected') throw new Error('Include this Analysis before revising it.');

        const updatedInvestigation = await ctx.services.db.works.updateInvestigation({
            organizationId: ctx.organizationId,
            workId: input.workId,
            id: input.investigationId,
            patch: { auditStatus: 'needs_review' },
        });
        await ctx.services.db.works.markConclusionOutdated({
            organizationId: ctx.organizationId,
            id: input.workId,
        });

        return updatedInvestigation;
    },
});
