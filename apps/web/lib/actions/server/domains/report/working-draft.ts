import type { ActionContext } from '@dory/actions';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { ReportAnalysisContext, ReportWorkingDraft, ReportWorkingState } from '@dory/shared/types/report-workspace';
import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace, writeWorkspace } from '../../policies';
import type { WebActionServices } from '../../types';
import { loadReportEvidence, reportWorkspaceContext } from '@/lib/server/report-workspace-context';
import { initialWorkingState, materializeWorkingContent, versionContent } from '@/lib/work-documents/working-draft';
import { workVisualSchema } from '@/lib/work-documents/schema';

const referenceSchema = z.object({
    documentId: z.string().min(1),
    revision: z.number().int().positive(),
    artifactId: z.string().min(1),
    publicationId: z.string().optional(),
    snapshotId: z.string().optional(),
});
const targetSchema = z.object({ documentId: z.string().min(1), baseRevision: z.number().int().positive() });
const editSchema = targetSchema.extend({ expectedDraftRevision: z.number().int().positive() });
const tabSchema = z.object({
    id: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    sourceArtifactId: z.string(),
    copiedFromId: z.string().optional(),
    snapshotArtifactId: z.string().optional(),
    sql: z.string().max(100000),
    hidden: z.boolean(),
    candidateId: z.string().optional(),
    componentIds: z.array(z.string()).max(200),
});
type Context = ActionContext<WebActionServices>;
const owner = (ctx: Context) => ({ organizationId: ctx.organizationId, userId: ctx.userId });
async function readDraft(ctx: Context, input: z.infer<typeof targetSchema>) {
    const draft = await ctx.services.db.workDocuments.workingDraft({ ...owner(ctx), ...input });
    if (!draft) throw new DatabaseError('Working draft not found.', 404);
    return draft;
}
const context = defineWebAction({
    id: 'report.workspace.analysis',
    domain: 'report',
    kind: 'query',
    risk: 'read',
    inputSchema: referenceSchema,
    outputSchema: z.custom<ReportAnalysisContext>(),
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    handler: async (ctx, reference) => {
        const { document } = await loadReportEvidence(ctx, reference);
        const sources = await Promise.all(
            document.content.evidence.map(evidence => reportWorkspaceContext(ctx, { ...reference, artifactId: evidence.artifactId, snapshotId: evidence.snapshotId })),
        );
        const draft = await ctx.services.db.workDocuments.initializeWorkingDraft({
            ...owner(ctx),
            documentId: reference.documentId,
            baseRevision: reference.revision,
            state: initialWorkingState(document.title, document.content),
        });
        return { draft, sources };
    },
});
const save = defineWebAction({
    id: 'report.workspace.saveDraft',
    domain: 'report',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    permissions: writeWorkspace,
    scopes: ['query:write'],
    actors: ['user'],
    inputSchema: editSchema.extend({
        title: z.string().trim().min(1).max(300),
        body: z.string().max(200000),
        visuals: z.array(workVisualSchema).max(200),
        tabs: z.array(tabSchema).max(100),
        activeTabId: z.string().nullable(),
        proseReviewed: z.boolean().optional(),
    }),
    outputSchema: z.custom<ReportWorkingDraft>(),
    handler: async (ctx, input) => {
        const draft = await readDraft(ctx, input);
        const base = await ctx.services.db.workDocuments.getVersion({ ...owner(ctx), documentId: input.documentId, revision: input.baseRevision });
        const ids = new Set<string>();
        const tabs = input.tabs.map(tab => {
            if (ids.has(tab.id)) throw new DatabaseError('Duplicate query ID.', 400);
            ids.add(tab.id);
            if (!base.content.evidence.some(e => e.artifactId === tab.sourceArtifactId)) throw new DatabaseError('Only original report sources are available.', 403);
            if (tab.snapshotArtifactId && !base.content.evidence.some(e => e.artifactId === tab.snapshotArtifactId && e.artifactId === tab.sourceArtifactId))
                throw new DatabaseError('Invalid snapshot binding.', 403);
            if (tab.candidateId && draft.results[tab.candidateId]?.sourceArtifactId !== tab.sourceArtifactId)
                throw new DatabaseError('Result does not belong to this query source.', 403);
            const previous = draft.state.tabs.find(t => t.id === tab.id);
            if (previous && previous.sourceArtifactId !== tab.sourceArtifactId) throw new DatabaseError('Duplicate the query to change its source.', 400);
            const copied =
                !previous && tab.copiedFromId ? draft.state.tabs.find(item => item.id === tab.copiedFromId && item.sourceArtifactId === tab.sourceArtifactId) : undefined;
            if (!previous && tab.copiedFromId && !copied) throw new DatabaseError('The original query is unavailable.', 400);
            return { ...tab, appliedId: previous?.appliedId ?? copied?.appliedId };
        });
        const state: ReportWorkingState = {
            ...draft.state,
            title: input.title,
            tabs,
            activeTabId: input.activeTabId,
            proseNeedsReview: draft.state.proseNeedsReview && !input.proseReviewed,
            content: { ...draft.state.content, body: input.body, visuals: input.visuals },
        };
        state.content = materializeWorkingContent(state, draft.results);
        if (state.content.visuals.some(visual => draft.state.content.visuals.find(previous => previous.id === visual.id)?.evidenceId !== visual.evidenceId))
            state.proseNeedsReview = true;
        if (Buffer.byteLength(JSON.stringify(state)) > 4 * 1024 * 1024) throw new DatabaseError('The working report exceeds 4 MiB. Reduce the result range.', 400);
        return ctx.services.db.workDocuments.saveWorkingDraft({ ...owner(ctx), ...input, state });
    },
});
const apply = defineWebAction({
    id: 'report.workspace.apply',
    domain: 'report',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    permissions: writeWorkspace,
    scopes: ['query:write'],
    actors: ['user'],
    inputSchema: editSchema.extend({ tabId: z.string(), resultId: z.string() }),
    outputSchema: z.custom<ReportWorkingDraft>(),
    handler: async (ctx, input) => {
        const draft = await readDraft(ctx, input);
        const tab = draft.state.tabs.find(t => t.id === input.tabId);
        const result = draft.results[input.resultId];
        if (!tab || !result || result.sourceArtifactId !== tab.sourceArtifactId) throw new DatabaseError('Query result unavailable.', 403);
        const state = structuredClone(draft.state);
        state.tabs.find(t => t.id === tab.id)!.appliedId = input.resultId;
        state.content = materializeWorkingContent(state, draft.results, true);
        state.proseNeedsReview = true;
        return ctx.services.db.workDocuments.saveWorkingDraft({ ...owner(ctx), ...input, state });
    },
});
const publish = defineWebAction({
    id: 'report.workspace.saveVersion',
    domain: 'report',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    permissions: writeWorkspace,
    scopes: ['query:write'],
    actors: ['user'],
    inputSchema: editSchema.extend({ requestId: z.string().uuid() }),
    outputSchema: z.unknown(),
    handler: async (ctx, input) => {
        const retry = await ctx.services.db.workDocuments.savedWorkingVersion({ ...owner(ctx), ...input });
        if (retry) return retry;
        const draft = await readDraft(ctx, input);
        return ctx.services.db.workDocuments.saveWorkingVersion({ ...owner(ctx), ...input, content: versionContent(draft) });
    },
});
export const reportWorkingDraftActions = [context, save, apply, publish];
