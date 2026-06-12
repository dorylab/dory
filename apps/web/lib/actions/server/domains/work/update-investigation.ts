import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workAnalysisAuditStatusSchema, workInvestigationOutputSchema, workStatusSchema } from './schemas';

const humanOnlyAuditStatuses = new Set(['reviewed', 'accepted', 'rejected']);

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
        auditStatus: workAnalysisAuditStatusSchema.optional(),
        linkedTabId: z.string().min(1).nullable().optional(),
        lastQueryAt: z.string().datetime().nullable().optional(),
    }),
    outputSchema: workInvestigationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['workId', 'id', 'status', 'auditStatus', 'linkedTabId', 'lastQueryAt'],
        resource: (_ctx, input) => ({ type: 'work_investigation', id: input.id, metadata: { workId: input.workId } }),
    },
    handler: async (ctx, input) => {
        if (input.auditStatus && humanOnlyAuditStatuses.has(input.auditStatus) && ctx.actor.type !== 'user') {
            throw new Error('Only a human can review, accept, or reject an Analysis.');
        }

        if (input.auditStatus === 'reviewed' || input.auditStatus === 'accepted') {
            const findings = await ctx.services.db.works.listInvestigationFindings({
                organizationId: ctx.organizationId,
                workId: input.workId,
                investigationId: input.id,
            });
            const hasSqlBackedFinding = findings.some(finding => Boolean(finding.sourceRunEventId || finding.sourceTabId));
            if (!hasSqlBackedFinding) {
                throw new Error('Reviewing or accepting an Analysis requires at least one SQL-backed Finding.');
            }
        }

        return ctx.services.db.works.updateInvestigation({
            organizationId: ctx.organizationId,
            workId: input.workId,
            id: input.id,
            patch: {
                title: input.title,
                status: input.status,
                auditStatus: input.auditStatus,
                linkedTabId: input.linkedTabId,
                lastQueryAt: input.lastQueryAt,
            },
        });
    },
});
