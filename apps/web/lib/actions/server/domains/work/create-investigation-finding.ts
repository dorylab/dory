import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workInvestigationFindingOutputSchema } from './schemas';

const inputSchema = z.object({
    workId: z.string().min(1),
    investigationId: z.string().min(1),
    content: z.string().trim().min(1),
    whyItMatters: z.string().trim().min(1).nullable().optional(),
    sourceTabId: z.string().min(1).nullable().optional(),
    sourceRunEventId: z.string().min(1).nullable().optional(),
    orderIndex: z.number().int().min(0).nullable().optional(),
});

function findingCreatorForActor(actorType: string) {
    if (actorType === 'automation') return 'automation' as const;
    if (actorType === 'agent') return 'agent' as const;
    return 'user' as const;
}

export const workCreateInvestigationFindingAction = defineWebAction({
    id: 'work.createInvestigationFinding',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:investigation:finding:create'],
    inputSchema,
    outputSchema: workInvestigationFindingOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['workId', 'investigationId', 'sourceTabId', 'sourceRunEventId', 'orderIndex'],
        inputSummary: input => ({
            workId: input.workId,
            investigationId: input.investigationId,
            contentLength: input.content.length,
            sourceTabId: input.sourceTabId ?? null,
            sourceRunEventId: input.sourceRunEventId ?? null,
        }),
        resource: (_ctx, input) => ({ type: 'work_investigation', id: input.investigationId, metadata: { workId: input.workId } }),
    },
    handler: async (ctx, input) => {
        const finding = await ctx.services.db.works.createInvestigationFinding({
            organizationId: ctx.organizationId,
            workId: input.workId,
            investigationId: input.investigationId,
            content: input.content,
            whyItMatters: input.whyItMatters ?? null,
            sourceTabId: input.sourceTabId ?? null,
            sourceRunEventId: input.sourceRunEventId ?? null,
            createdBy: findingCreatorForActor(ctx.actor.type),
            orderIndex: input.orderIndex ?? null,
        });

        if (ctx.actor.type === 'user') {
            await ctx.services.db.works.updateInvestigation({
                organizationId: ctx.organizationId,
                workId: input.workId,
                id: input.investigationId,
                patch: { auditStatus: 'revised' },
            });
            if (typeof ctx.services.db.works.createInvestigationRevision === 'function') {
                await ctx.services.db.works.createInvestigationRevision({
                    organizationId: ctx.organizationId,
                    workId: input.workId,
                    investigationId: input.investigationId,
                    createdBy: 'user',
                    markConclusionOutdated: true,
                });
            }
        }

        return finding;
    },
});
