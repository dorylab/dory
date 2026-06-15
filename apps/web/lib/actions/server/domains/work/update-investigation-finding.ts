import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workInvestigationFindingOutputSchema } from './schemas';

const inputSchema = z.object({
    workId: z.string().min(1),
    id: z.string().min(1),
    content: z.string().trim().min(1).optional(),
    whyItMatters: z.string().trim().min(1).nullable().optional(),
    sourceTabId: z.string().min(1).nullable().optional(),
    sourceRunEventId: z.string().min(1).nullable().optional(),
    orderIndex: z.number().int().min(0).nullable().optional(),
});

export const workUpdateInvestigationFindingAction = defineWebAction({
    id: 'work.updateInvestigationFinding',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:investigation:finding:update'],
    inputSchema,
    outputSchema: workInvestigationFindingOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['workId', 'id', 'sourceTabId', 'sourceRunEventId', 'orderIndex'],
        inputSummary: input => ({
            workId: input.workId,
            id: input.id,
            contentLength: input.content?.length ?? null,
            sourceTabId: input.sourceTabId ?? null,
            sourceRunEventId: input.sourceRunEventId ?? null,
            orderIndex: input.orderIndex ?? null,
        }),
        resource: (_ctx, input) => ({ type: 'work_investigation_finding', id: input.id, metadata: { workId: input.workId } }),
    },
    handler: async (ctx, input) => {
        const finding = await ctx.services.db.works.updateInvestigationFinding({
            organizationId: ctx.organizationId,
            workId: input.workId,
            id: input.id,
            patch: {
                content: input.content,
                whyItMatters: input.whyItMatters,
                sourceTabId: input.sourceTabId,
                sourceRunEventId: input.sourceRunEventId,
                orderIndex: input.orderIndex,
            },
        });

        if (ctx.actor.type === 'user') {
            await ctx.services.db.works.updateInvestigation({
                organizationId: ctx.organizationId,
                workId: input.workId,
                id: finding.investigationId,
                patch: { auditStatus: 'revised' },
            });
            if (typeof ctx.services.db.works.createInvestigationRevision === 'function') {
                await ctx.services.db.works.createInvestigationRevision({
                    organizationId: ctx.organizationId,
                    workId: input.workId,
                    investigationId: finding.investigationId,
                    createdBy: 'user',
                    markConclusionOutdated: true,
                });
            }
        }

        return finding;
    },
});
