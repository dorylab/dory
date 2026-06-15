import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workConclusionMetadataSchema, workOutputSchema } from './schemas';

function fallbackConclusionMetadata(input: { includedCount: number; unconfirmedCount: number }) {
    const caveats =
        input.unconfirmedCount > 0
            ? [`${input.unconfirmedCount} included ${input.unconfirmedCount === 1 ? 'analysis is' : 'analyses are'} not human-confirmed.`]
            : [];
    return {
        confidence: input.includedCount > 0 && input.unconfirmedCount === 0 ? ('high' as const) : ('medium' as const),
        caveats,
        recommendedNextStep: caveats.length ? 'Review and verify the included analyses before trusting the conclusion.' : null,
    };
}

const workUpdateConclusionInputSchema = z.object({
    id: z.string().min(1).optional(),
    workId: z.string().min(1).optional(),
    conclusion: z.string().trim().nullable(),
    conclusionMetadata: workConclusionMetadataSchema.nullable().optional(),
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
        inputSummary: input => ({
            id: input.id ?? input.workId,
            conclusionLength: input.conclusion?.length ?? 0,
            confidence: input.conclusionMetadata?.confidence ?? null,
            caveatCount: input.conclusionMetadata?.caveats.length ?? 0,
        }),
        resource: (_ctx, input) => ({ type: 'work', id: input.id ?? input.workId ?? null }),
    },
    handler: async (ctx, input) => {
        const id = input.id ?? input.workId;
        if (!id) throw new Error('Missing work id.');

        let derivedMetadata = input.conclusionMetadata ?? null;
        if (input.conclusion?.trim()) {
            const investigations = await ctx.services.db.works.listInvestigations({
                organizationId: ctx.organizationId,
                workId: id,
            });
            const includedInvestigationIds = new Set(investigations.filter(investigation => investigation.auditStatus !== 'rejected').map(investigation => investigation.id));
            if (includedInvestigationIds.size === 0) {
                throw new Error('Include at least one Analysis before updating the Work conclusion.');
            }
            const findings = await ctx.services.db.works.listFindingsForWork({
                organizationId: ctx.organizationId,
                workId: id,
            });
            if (!findings.some(finding => includedInvestigationIds.has(finding.investigationId))) {
                throw new Error('Add at least one Finding to an included Analysis before updating the Work conclusion.');
            }
            if (!derivedMetadata) {
                const includedInvestigations = investigations.filter(investigation => includedInvestigationIds.has(investigation.id));
                derivedMetadata = fallbackConclusionMetadata({
                    includedCount: includedInvestigations.length,
                    unconfirmedCount: includedInvestigations.filter(investigation => investigation.auditStatus !== 'accepted' && investigation.auditStatus !== 'reviewed').length,
                });
            }
        }

        return ctx.services.db.works.updateConclusion({
            organizationId: ctx.organizationId,
            id,
            conclusion: input.conclusion,
            conclusionMetadata: input.conclusion?.trim() ? derivedMetadata : null,
        });
    },
});
