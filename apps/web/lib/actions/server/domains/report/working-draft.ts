import { randomUUID } from 'node:crypto';
import type { ActionContext } from '@dory/actions';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { ReportAnalysisContext, ReportWorkingDraft, ReportWorkingState } from '@dory/shared/types/report-workspace';
import { z } from 'zod';

import { reportWorkspaceContext } from '@/lib/server/report-workspace-context';
import { reconcileReportEvidenceGroups } from '@/lib/work-documents/evidence-groups';
import { editableReport, parseReport } from '@/lib/work-documents/report-core';
import { reportEvidenceGroupsSchema, reviewedEvidenceGroupIdsSchema, workspaceChartSpecSchema, workVisualSchema } from '@/lib/work-documents/schema';
import { applyWorkingResult, changeReportDraft, initialWorkingState, materializeWorkingContent, upgradeWorkingState, versionContent } from '@/lib/work-documents/working-draft';

import { attachmentReadAccess } from '../../attachment-access';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace, writeWorkspace } from '../../policies';
import type { WebActionServices } from '../../types';

const referenceSchema = z.object({
    documentId: z.string().min(1),
    revision: z.number().int().positive(),
    artifactId: z.string().default(''),
    publicationId: z.string().optional(),
    snapshotId: z.string().optional(),
    componentId: z.string().min(1).optional(),
    groupId: z.string().min(1).optional(),
});
const applyTargetSchema = z
    .object({ artifactId: z.string().min(1), componentId: z.string().min(1).optional(), groupId: z.string().min(1).optional() })
    .refine(value => Boolean(value.componentId) !== Boolean(value.groupId), 'Select one report target.');
const targetSchema = z.object({ documentId: z.string().min(1), baseRevision: z.number().int().positive() });
const editSchema = targetSchema.extend({ expectedDraftRevision: z.number().int().positive() });
const tabSchema = z.object({
    id: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    sourceArtifactId: z.string(),
    source: z
        .discriminatedUnion('kind', [
            z.object({
                kind: z.literal('database'),
                connectionId: z.string().min(1),
                database: z.string().nullable(),
                schema: z.string().nullable().optional(),
                dialect: z.string(),
            }),
            z.object({ kind: z.literal('attachment'), dialect: z.literal('duckdb') }),
            z.object({ kind: z.literal('unavailable'), reason: z.string() }),
        ])
        .optional(),
    resultIds: z.array(z.string()).max(1000).optional(),
    selectedResultId: z.string().optional(),
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
        const target = { ...owner(ctx), documentId: reference.documentId };
        const document = reference.publicationId
            ? await ctx.services.db.workDocuments.getPublication({ ...target, publicationId: reference.publicationId })
            : await ctx.services.db.workDocuments.getVersion({ ...target, revision: reference.revision });
        let draft = await ctx.services.db.workDocuments.initializeWorkingDraft({
            ...owner(ctx),
            documentId: reference.documentId,
            baseRevision: reference.revision,
            state: {
                ...initialWorkingState(document.title, document.content),
                baseline: { revision: document.revision, title: document.title, content: editableReport(document.content) },
            },
        });
        const origin = draft.baseRevision === document.revision ? document : await ctx.services.db.workDocuments.getVersion({ ...target, revision: draft.baseRevision });
        const sources = await Promise.all(
            origin.content.evidence.map(evidence =>
                reportWorkspaceContext(ctx, {
                    ...reference,
                    revision: origin.revision,
                    publicationId: undefined,
                    componentId: undefined,
                    groupId: undefined,
                    artifactId: evidence.artifactId,
                    snapshotId: evidence.snapshotId,
                }),
            ),
        );
        if (draft.state.bindingVersion !== 2) {
            draft = await ctx.services.db.workDocuments.saveWorkingDraft({
                ...target,
                baseRevision: draft.baseRevision,
                expectedDraftRevision: draft.revision,
                state: upgradeWorkingState(draft, document.content),
            });
        }
        draft.state.tabs = draft.state.tabs.map(tab => ({ ...tab, source: tab.source ?? sources.find(source => source.reference.artifactId === tab.sourceArtifactId)?.source }));
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
        evidenceGroups: reportEvidenceGroupsSchema.optional(),
        reviewedEvidenceGroupIds: reviewedEvidenceGroupIdsSchema.optional(),
        tabs: z.array(tabSchema).max(100),
        charts: z
            .array(z.object({ id: z.string(), resultSetId: z.string(), title: z.string().max(300), spec: workspaceChartSpecSchema }))
            .max(300)
            .optional(),
        activeTabId: z.string().nullable(),
        proseReviewed: z.boolean().optional(),
        applyTarget: applyTargetSchema.optional(),
    }),
    outputSchema: z.custom<ReportWorkingDraft>(),
    handler: async (ctx, input) => {
        const draft = await readDraft(ctx, input);
        const base = await ctx.services.db.workDocuments.getVersion({ ...owner(ctx), documentId: input.documentId, revision: input.baseRevision });
        const ids = new Set<string>();
        const tabs = await Promise.all(
            input.tabs.map(async tab => {
                if (ids.has(tab.id)) throw new DatabaseError('Duplicate query ID.', 400);
                ids.add(tab.id);
                let source = draft.state.tabs.find(previous => previous.id === tab.id)?.source;
                if (tab.source?.kind === 'database') {
                    const connection = ctx.access.permissions.connection.read ? await ctx.services.db.connections.getById(ctx.organizationId, tab.source.connectionId) : null;
                    if (connection) source = { ...tab.source, dialect: connection.connection.type };
                    else if (JSON.stringify(source) !== JSON.stringify(tab.source)) throw new DatabaseError('Connection unavailable.', 403);
                } else if (tab.source?.kind === 'attachment') {
                    if (!base.content.evidence.some(e => e.artifactId === tab.sourceArtifactId && e.attachmentSource)) throw new DatabaseError('Attachment unavailable.', 403);
                    source = tab.source;
                }
                if (tab.snapshotArtifactId && !base.content.evidence.some(e => e.artifactId === tab.snapshotArtifactId)) throw new DatabaseError('Invalid snapshot binding.', 403);
                if ((tab.resultIds ?? []).some(id => !draft.results[id])) throw new DatabaseError('Result unavailable.', 403);
                return { ...tab, source };
            }),
        );
        for (const chart of input.charts ?? []) {
            if (!draft.results[chart.resultSetId]) {
                const artifact = await ctx.services.db.artifacts.get({ ...owner(ctx), artifactId: `artifact_${chart.resultSetId}` });
                if (![...base.content.evidence, ...draft.state.content.evidence].some(item => item.artifactId === artifact.id))
                    throw new DatabaseError('Chart result unavailable.', 403);
            }
        }
        let evidenceGroups = draft.state.content.evidenceGroups;
        const hasSyntaxErrors = parseReport(input.body, input.visuals).diagnostics.length > 0;
        if (
            hasSyntaxErrors &&
            (input.reviewedEvidenceGroupIds?.length ||
                (input.evidenceGroups && JSON.stringify(input.evidenceGroups) !== JSON.stringify((evidenceGroups ?? []).map(({ id, references }) => ({ id, references })))))
        )
            throw new DatabaseError('Fix the report syntax before saving evidence changes. Your edits remain in the editor.', 400);
        if (!hasSyntaxErrors) {
            try {
                evidenceGroups = reconcileReportEvidenceGroups(draft.state.content, input.body, input.evidenceGroups, input.reviewedEvidenceGroupIds);
            } catch (error) {
                throw new DatabaseError(error instanceof Error ? error.message : 'Invalid evidence groups.', 400);
            }
        }
        if (evidenceGroups?.some(group => group.references.some(reference => !draft.state.content.evidence.some(item => item.artifactId === reference.artifactId))))
            throw new DatabaseError('Choose evidence already in this working report.', 403);
        const visuals = input.visuals.map(visual => {
            const previous = draft.state.content.visuals.find(item => item.id === visual.id);
            if (visual.chartSpec && JSON.stringify(visual.chartSpec) !== JSON.stringify(previous?.chartSpec))
                throw new DatabaseError('Apply the chart to update its frozen configuration.', 400);
            return { ...visual, ...(previous?.chartData ? { chartData: previous.chartData } : { chartData: undefined }) };
        });
        const state: ReportWorkingState = {
            ...draft.state,
            title: input.title,
            tabs,
            charts: input.charts ?? draft.state.charts,
            activeTabId: input.activeTabId,
            applyTarget: input.applyTarget,
            proseNeedsReview: draft.state.proseNeedsReview && !input.proseReviewed,
            content: { ...draft.state.content, body: input.body, visuals, evidenceGroups, reviewedEvidenceGroupIds: undefined },
        };
        if (
            draft.state.bindingVersion === 2 &&
            input.visuals.some(visual => draft.state.content.visuals.find(previous => previous.id === visual.id)?.evidenceId !== visual.evidenceId)
        )
            throw new DatabaseError('Use Add to Report to change result bindings.', 400);
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
    inputSchema: editSchema.extend({
        tabId: z.string().optional(),
        resultId: z.string().optional(),
        target: applyTargetSchema.optional(),
        operation: z
            .discriminatedUnion('type', [
                z.object({
                    type: z.literal('replace'),
                    resultId: z.string(),
                    blockIds: z.array(z.string()).min(1).max(200),
                    chartSpec: workspaceChartSpecSchema.optional(),
                    fieldMappings: z.record(z.string(), z.record(z.string(), z.string().min(1))).optional(),
                }),
                z.object({
                    type: z.literal('insert'),
                    resultId: z.string(),
                    visual: z.object({
                        id: z
                            .string()
                            .regex(/^[a-zA-Z0-9_-]+$/)
                            .max(100),
                        type: z.enum(['table', 'chart']),
                        title: z.string().max(300),
                        chartSpec: workspaceChartSpecSchema.optional(),
                    }),
                    anchorId: z.string(),
                    position: z.enum(['before', 'after', 'end']),
                }),
                z.object({ type: z.literal('remove'), blockId: z.string() }),
                z.object({ type: z.literal('revert'), blockId: z.string() }),
            ])
            .optional(),
    }),
    outputSchema: z.custom<ReportWorkingDraft>(),
    handler: async (ctx, input) => {
        const draft = await readDraft(ctx, input);
        if (!input.operation && (!input.tabId || !input.resultId || !input.target)) throw new DatabaseError('Select a result and report target.', 400);
        const resultId = input.operation && 'resultId' in input.operation ? input.operation.resultId : input.resultId;
        if (resultId) {
            const original = resultId.startsWith('snapshot:')
                ? await ctx.services.db.workDocuments.getVersion({ ...owner(ctx), documentId: draft.documentId, revision: draft.baseRevision })
                : undefined;
            const snapshot = resultId.startsWith('snapshot:')
                ? [...draft.state.content.evidence, ...(draft.state.baseline?.content.evidence ?? []), ...(original?.content.evidence ?? [])].find(
                      item => item.artifactId === resultId.slice(9),
                  )
                : undefined;
            const evidence = draft.results[resultId]?.evidence ?? snapshot;
            if (!evidence) throw new DatabaseError('Result unavailable. Run the query again.', 409);
            const artifact = await ctx.services.db.artifacts.get({ ...owner(ctx), artifactId: evidence.artifactId });
            if (!artifact.resultSet || artifact.resultSet.dataAvailability !== 'full' || artifact.resultSet.limited)
                throw new DatabaseError('A complete result is required. Run the query again before adding it.', 409);
            if (evidence.connectionId) {
                if (!ctx.access.permissions.connection.read || !(await ctx.services.db.connections.getById(ctx.organizationId, evidence.connectionId)))
                    throw new DatabaseError('Result source access is no longer available.', 403);
            }
            // Verify stored data and attachment ownership; previews cannot become report snapshots.
            await ctx.services.db.resultSets.readRows({ organizationId: ctx.organizationId, ...(await attachmentReadAccess(ctx)), resultSetId: artifact.resultSet.id, limit: 1 });
            // Older evidence uses truncated to describe its embedded preview, not the retained result.
            if (snapshot) {
                const fullEvidence = { ...snapshot, truncated: false };
                draft.results[resultId] = { sourceArtifactId: snapshot.artifactId, evidence: fullEvidence };
                draft.state.content.evidence = draft.state.content.evidence.map(item => (item.artifactId === snapshot.artifactId ? fullEvidence : item));
            }
        }

        const state = input.operation
            ? changeReportDraft(draft, input.operation)
            : draft.state.bindingVersion === 2 && input.target?.componentId
              ? changeReportDraft(draft, { type: 'replace', resultId: input.resultId!, blockIds: [input.target.componentId] })
              : applyWorkingResult(draft, input.tabId!, input.resultId!, input.target!, `query_${randomUUID()}`);
        const targets =
            input.operation?.type === 'replace'
                ? input.operation.blockIds
                : input.operation?.type === 'insert'
                  ? [input.operation.visual.id]
                  : input.target?.componentId
                    ? [input.target.componentId]
                    : [];
        for (const visual of state.content.visuals.filter(item => targets.includes(item.id) && item.chartSpec)) {
            const artifact = await ctx.services.db.artifacts.get({ ...owner(ctx), artifactId: visual.evidenceId });
            if (!artifact.sourceResultSetId) throw new DatabaseError('Chart result unavailable.', 409);
            visual.chartData = await ctx.services.db.resultSets.readChart({
                organizationId: ctx.organizationId,
                ...(await attachmentReadAccess(ctx)),
                resultSetId: artifact.sourceResultSetId,
                ...visual.chartSpec!,
            });
        }
        state.content = materializeWorkingContent(state, draft.results, true);
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
        if (retry) return { ...retry, draft: await readDraft(ctx, input) };
        const draft = await readDraft(ctx, input);
        const document = await ctx.services.db.workDocuments.saveWorkingVersion({ ...owner(ctx), ...input, content: versionContent(draft) });
        return { ...document, draft: await readDraft(ctx, input) };
    },
});
export const reportWorkingDraftActions = [context, save, apply, publish];
