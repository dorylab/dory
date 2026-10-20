import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace, writeWorkspace } from '../../policies';
import { getKnowledgeExtractionRunner } from '@/lib/server/knowledge-extraction-worker';
import { extractedKnowledgeSchema } from '@/lib/server/knowledge-extraction-core';
import { validateMetricMapping } from '@/lib/server/knowledge-metric-validation';
import { knowledgeHash } from '@dory/database/postgres/impl/knowledge';
import type { ActionContext } from '@dory/actions';
import type { WebActionServices } from '../../types';
const modelInput = z.object({ knowledgeModelId: z.string().min(1) });
function admin(ctx: ActionContext<WebActionServices>) {
    if (ctx.access.role !== 'owner' && ctx.access.role !== 'admin')
        throw Object.assign(new Error('Only organization owners and administrators can manage extraction.'), { code: 'FORBIDDEN', status: 403 });
}
const reviewInput = modelInput.extend({
    candidateId: z.string().min(1),
    decision: z.enum(['approve', 'reject', 'keep', 'archive']),
    payload: extractedKnowledgeSchema.optional(),
    targetAssetId: z.string().optional(),
    createNew: z.boolean().optional(),
    expectedTargetRevision: z.string().optional(),
    note: z.string().max(2000).optional(),
});
async function review(ctx: ActionContext<WebActionServices>, input: z.infer<typeof reviewInput>) {
    admin(ctx);
    const drafts = await ctx.services.db.knowledge.extraction.listCandidates({ organizationId: ctx.organizationId, knowledgeModelId: input.knowledgeModelId });
    const draft = drafts.find(c => c.id === input.candidateId);
    if (!draft) throw new Error('Candidate is no longer pending.');
    if (input.decision === 'approve') await validateMetricMapping(ctx, input.knowledgeModelId, input.payload ?? draft.payload);
    return ctx.services.db.knowledge.extraction.review({ ...input, organizationId: ctx.organizationId, userId: ctx.userId });
}
export const extractionKnowledgeActions = [
    defineWebAction({
        id: 'knowledge.getExtractionStatus',
        domain: 'knowledge',
        kind: 'query',
        risk: 'read',
        inputSchema: modelInput,
        outputSchema: z.unknown(),
        permissions: readWorkspace,
        scopes: ['knowledge:read'],
        actors: ['user'],
        handler: async (ctx, input) => ({
            ...(await ctx.services.db.knowledge.extraction.status({ ...input, organizationId: ctx.organizationId })),
            canManage: ctx.access.role === 'owner' || ctx.access.role === 'admin',
        }),
    }),
    defineWebAction({
        id: 'knowledge.setAutoExtraction',
        domain: 'knowledge',
        kind: 'command',
        risk: 'write',
        requiresConfirmation: false,
        inputSchema: modelInput.extend({ connectorId: z.string(), enabled: z.boolean() }),
        outputSchema: z.object({ ok: z.boolean() }),
        permissions: writeWorkspace,
        scopes: ['knowledge:write'],
        actors: ['user'],
        handler: async (ctx, input) => {
            admin(ctx);
            await ctx.services.db.knowledge.extraction.configure({ ...input, organizationId: ctx.organizationId });
            getKnowledgeExtractionRunner(ctx.services.db).wake();
            return { ok: true };
        },
    }),
    defineWebAction({
        id: 'knowledge.retryExtraction',
        domain: 'knowledge',
        kind: 'command',
        risk: 'write',
        requiresConfirmation: false,
        inputSchema: modelInput.extend({ sourceId: z.string().optional() }),
        outputSchema: z.object({ ok: z.boolean() }),
        permissions: writeWorkspace,
        scopes: ['knowledge:write'],
        actors: ['user'],
        handler: async (ctx, input) => {
            admin(ctx);
            await ctx.services.db.knowledge.extraction.retry({ ...input, organizationId: ctx.organizationId });
            getKnowledgeExtractionRunner(ctx.services.db).wake();
            return { ok: true };
        },
    }),
    defineWebAction({
        id: 'knowledge.listCandidates',
        domain: 'knowledge',
        kind: 'query',
        risk: 'read',
        inputSchema: modelInput.extend({ status: z.enum(['pending', 'approved', 'rejected', 'superseded']).optional() }),
        outputSchema: z.unknown(),
        permissions: readWorkspace,
        scopes: ['knowledge:read'],
        actors: ['user'],
        handler: async (ctx, input) => {
            admin(ctx);
            const s = { ...input, organizationId: ctx.organizationId };
            const [drafts, model, rules] = await Promise.all([
                ctx.services.db.knowledge.extraction.listCandidates(s),
                ctx.services.db.knowledge.getModel(s),
                ctx.services.db.knowledge.extraction.listRules(s),
            ]);
            return {
                candidates: drafts,
                targets: [
                    ...model.model.definitions.filter(d => d.kind === 'metric').map(d => ({ id: d.id, name: d.name, kind: 'metric', revision: knowledgeHash(d), content: d })),
                    ...rules.map(r => ({ id: r.id, name: r.payload.name, kind: 'business_rule', revision: String(r.revision), content: r.payload })),
                ],
            };
        },
    }),
    defineWebAction({
        id: 'knowledge.getCandidate',
        domain: 'knowledge',
        kind: 'query',
        risk: 'read',
        inputSchema: modelInput.extend({ id: z.string(), status: z.enum(['pending', 'approved', 'rejected', 'superseded']).optional() }),
        outputSchema: z.unknown(),
        permissions: readWorkspace,
        scopes: ['knowledge:read'],
        actors: ['user'],
        handler: async (ctx, input) => {
            admin(ctx);
            const candidate = (await ctx.services.db.knowledge.extraction.listCandidates({ ...input, organizationId: ctx.organizationId })).find(item => item.id === input.id);
            if (!candidate) throw new Error('Candidate not found.');
            return { candidate };
        },
    }),
    defineWebAction({
        id: 'knowledge.reviewCandidate',
        domain: 'knowledge',
        kind: 'command',
        risk: 'write',
        requiresConfirmation: false,
        inputSchema: reviewInput,
        outputSchema: z.unknown(),
        permissions: writeWorkspace,
        scopes: ['knowledge:write'],
        actors: ['user'],
        handler: review,
    }),
    defineWebAction({
        id: 'knowledge.approveCandidates',
        domain: 'knowledge',
        kind: 'command',
        risk: 'write',
        requiresConfirmation: false,
        inputSchema: modelInput.extend({ candidateIds: z.array(z.string()).min(1).max(50) }),
        outputSchema: z.unknown(),
        permissions: writeWorkspace,
        scopes: ['knowledge:write'],
        actors: ['user'],
        handler: async (ctx, input) => {
            admin(ctx);
            const pending = await ctx.services.db.knowledge.extraction.listCandidates({ ...input, organizationId: ctx.organizationId });
            const results: Array<{ id: string; approved: boolean; error?: string }> = [];
            for (const id of [...new Set(input.candidateIds)]) {
                const draft = pending.find(d => d.id === id);
                if (!draft || draft.action !== 'add' || draft.targetAssetId) {
                    results.push({ id, approved: false, error: 'Review conflicting or changed knowledge individually.' });
                    continue;
                }
                try {
                    await review(ctx, { knowledgeModelId: input.knowledgeModelId, candidateId: id, decision: 'approve' });
                    results.push({ id, approved: true });
                } catch (error) {
                    results.push({ id, approved: false, error: error instanceof Error ? error.message : 'Review failed.' });
                }
            }
            return { results };
        },
    }),
    defineWebAction({
        id: 'knowledge.listBusinessRules',
        domain: 'knowledge',
        kind: 'query',
        risk: 'read',
        inputSchema: modelInput.extend({ includeArchived: z.boolean().optional() }),
        outputSchema: z.unknown(),
        permissions: readWorkspace,
        scopes: ['knowledge:read'],
        actors: ['user'],
        handler: async (ctx, input) => ({ rules: await ctx.services.db.knowledge.extraction.listRules({ ...input, organizationId: ctx.organizationId }) }),
    }),
    defineWebAction({
        id: 'knowledge.getBusinessRule',
        domain: 'knowledge',
        kind: 'query',
        risk: 'read',
        inputSchema: modelInput.extend({ id: z.string() }),
        outputSchema: z.unknown(),
        permissions: readWorkspace,
        scopes: ['knowledge:read'],
        actors: ['user'],
        handler: async (ctx, input) => {
            const rule = (await ctx.services.db.knowledge.extraction.listRules({ ...input, organizationId: ctx.organizationId })).find(item => item.id === input.id);
            if (!rule) throw new Error('Business rule not found.');
            return { rule };
        },
    }),
    defineWebAction({
        id: 'knowledge.getAssetEvidence',
        domain: 'knowledge',
        kind: 'query',
        risk: 'read',
        inputSchema: modelInput.extend({ assetId: z.string().optional() }),
        outputSchema: z.unknown(),
        permissions: readWorkspace,
        scopes: ['knowledge:read'],
        actors: ['user'],
        handler: async (ctx, input) => ({ evidence: await ctx.services.db.knowledge.extraction.evidenceFor({ ...input, organizationId: ctx.organizationId }) }),
    }),
    defineWebAction({
        id: 'knowledge.updateBusinessRule',
        domain: 'knowledge',
        kind: 'command',
        risk: 'write',
        requiresConfirmation: false,
        inputSchema: modelInput.extend({ id: z.string(), expectedRevision: z.number().int(), payload: extractedKnowledgeSchema.optional(), archived: z.boolean().optional() }),
        outputSchema: z.unknown(),
        permissions: writeWorkspace,
        scopes: ['knowledge:write'],
        actors: ['user'],
        handler: async (ctx, input) => {
            admin(ctx);
            return ctx.services.db.knowledge.extraction.updateRule({ ...input, organizationId: ctx.organizationId, userId: ctx.userId });
        },
    }),
];
