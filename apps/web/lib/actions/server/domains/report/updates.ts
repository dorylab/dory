import type { ActionContext } from '@dory/actions';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { reportWorkspaceRunId, reportUpdateResults } from '@dory/shared/types/report-updates';
import type { ReportUpdateContext, ReportResultPointer } from '@dory/shared/types/report-updates';
import type { ReportWorkingDraft } from '@dory/shared/types/report-workspace';
import type { WorkEvidence, WorkDocumentView } from '@dory/shared/types/work-document';
import { isAnalysisDatabaseAllowed } from '@dory/shared/utils/analysis-scope';
import { z } from 'zod';
import { editableReport, reportOutline } from '@/lib/work-documents/report-core';
import { recoverTabUpdates, sameReportSql, updateReady } from '@/lib/work-documents/report-updates';
import { workReferences } from '@/lib/work-documents/markdown';
import { canvasBlocks } from '@/lib/work-documents/report-canvas';
import { decideReportSqlUpdate, type ReportSqlResult } from '@/lib/server/report-sql-update';
import { changeReportDraft, initialWorkingState, materializeWorkingContent } from '@/lib/work-documents/working-draft';
import { REPORT_SNAPSHOT_ROW_LIMIT } from '@/lib/work-documents/evidence-preview';
import { optionalArtifact } from '@/lib/server/report-workspace-context';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace, writeWorkspace } from '../../policies';
import type { WebActionServices } from '../../types';

type Context = ActionContext<WebActionServices>;
const id = z.string().min(1).max(300);
const revision = z.number().int().positive();
const key = z.object({ documentId: id, workId: id, revision });
const edit = key.extend({ baseRevision: revision, expectedDraftRevision: revision });
const resultSchema = z.object({
    tabId: id,
    sessionId: id,
    setIndex: z.number().int().nonnegative(),
    resultSetId: id,
    sql: z.string().max(100000),
    rowCount: z.number().nonnegative(),
    connectionId: id,
    database: z.string().nullable(),
});
const itemSchema = z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    tabId: id,
    sourceTabId: id,
    title: z.string().trim().min(1).max(300),
    sql: z.string().max(100000),
    originalSql: z.string().max(100000).nullable(),
    executedSql: z.string().max(100000).optional(),
    results: z.array(resultSchema).max(200),
    needsReview: z.boolean().optional(),
});
const owner = (ctx: Context) => ({ organizationId: ctx.organizationId, userId: ctx.userId });

async function sourceReport(ctx: Context, input: z.infer<typeof key>) {
    const db = ctx.services.db;
    const target = { ...owner(ctx), documentId: input.documentId };
    const current = await db.workDocuments.get(target);
    const document = current.revision === input.revision ? current : await db.workDocuments.getVersion({ ...target, revision: input.revision });
    const runs = new Set(document.content.evidence.flatMap(e => (e.runId ? [e.runId] : [])));
    const workId = document.content.sourceWorkId ?? (runs.size === 1 ? [...runs][0] : null);
    const original = workId ? await db.works.getById({ ...target, workId }) : null;
    if (original ? original.workId !== input.workId : input.workId !== reportWorkspaceRunId(document.id) || !document.scope.connectionIds.length)
        throw new DatabaseError('The report workspace is unavailable.', 403);
    if (!original) await db.works.ensureReportWorkspace({ ...target, title: document.title, connectionId: document.scope.connectionIds[0] });
    return { target, current, document };
}
async function reportBindings(ctx: Context, content: WorkDocumentView['content'], workId: string) {
    const bindings: Record<string, ReportResultPointer> = {};
    await Promise.all(
        content.evidence.map(async evidence => {
            const artifact = await optionalArtifact(ctx, evidence.artifactId);
            const origin = artifact?.workspaceTarget;
            if (artifact?.sourceResultSetId && origin && (origin.mode === 'sql' || origin.workId === workId))
                bindings[evidence.artifactId] = {
                    tabId: origin.tabId,
                    sessionId: origin.sessionId,
                    setIndex: origin.setIndex,
                    resultSetId: artifact.sourceResultSetId,
                    sql: origin.sql ?? '',
                    rowCount: evidence.rowCount ?? evidence.rows.length,
                    connectionId: origin.connectionId,
                    database: artifact.resultSet?.sourceDatabaseName ?? evidence.sourceDatabaseName ?? null,
                };
        }),
    );
    return bindings;
}

const load = defineWebAction({
    id: 'report.updates.get',
    domain: 'report',
    kind: 'query',
    risk: 'read',
    scopes: ['query:read'],
    permissions: readWorkspace,
    actors: ['user'],
    inputSchema: key,
    outputSchema: z.custom<ReportUpdateContext>(),
    handler: async (ctx, input) => {
        const { target, current, document } = await sourceReport(ctx, input);
        const content = editableReport(document.content);
        const draft =
            current.revision === input.revision
                ? await ctx.services.db.workDocuments.initializeWorkingDraft({
                      ...target,
                      baseRevision: document.revision,
                      recoverUpdates: true,
                      state: { ...initialWorkingState(document.title, content), baseline: { revision: document.revision, title: document.title, content } },
                  })
                : null;
        const bindings = await reportBindings(ctx, content, input.workId);
        return {
            document: { id: document.id, title: document.title, revision: document.revision, content },
            latestRevision: current.revision,
            userId: ctx.userId,
            baseRevision: draft?.baseRevision ?? document.revision,
            draftRevision: draft?.revision ?? 0,
            bindings,
            items: recoverTabUpdates(draft?.state.updates ?? [], bindings),
        };
    },
});
async function readCurrent(ctx: Context, input: z.infer<typeof edit>) {
    const { target, current } = await sourceReport(ctx, input);
    const draft = await ctx.services.db.workDocuments.workingDraft({ ...target, baseRevision: input.baseRevision });
    if (!draft || draft.revision !== input.expectedDraftRevision || current.revision !== input.revision || draft.expectedReportRevision !== current.revision)
        throw new DatabaseError('The report or workspace changed. Reload the current report to review your updates.', 409);
    return { target, current, draft };
}
const save = defineWebAction({
    id: 'report.updates.save',
    domain: 'report',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    scopes: ['query:write'],
    permissions: writeWorkspace,
    actors: ['user'],
    inputSchema: edit.extend({ items: z.array(itemSchema).max(200) }),
    outputSchema: z.object({ draftRevision: revision }),
    handler: async (ctx, input) => {
        const { target, draft, current } = await readCurrent(ctx, input);
        if (new Set(input.items.map(item => item.id)).size !== input.items.length || Buffer.byteLength(JSON.stringify(input.items)) > 2 * 1024 * 1024)
            throw new DatabaseError('Invalid update list.', 400);
        if (new Set(input.items.map(item => item.tabId)).size !== input.items.length) throw new DatabaseError('Duplicate SQL tab.', 400);
        const known = new Set((draft.state.updates ?? []).flatMap(reportUpdateResults).map(result => JSON.stringify(result)));
        for (const result of input.items.flatMap(item => item.results)) {
            if (!known.has(JSON.stringify(result))) await verifiedResult(ctx, current, input.workId, result);
        }
        const next = await ctx.services.db.workDocuments.saveWorkingDraft({ ...target, ...input, state: { ...draft.state, updates: input.items } });
        return { draftRevision: next.revision };
    },
});
async function verifiedResult(ctx: Context, document: Pick<WorkDocumentView, 'id' | 'scope' | 'content'>, workId: string, result: ReportResultPointer) {
    const db = ctx.services.db;
    const artifact = await db.artifacts.get({ ...owner(ctx), artifactId: 'artifact_' + result.resultSetId });
    const origin = artifact.workspaceTarget,
        set = artifact.resultSet;
    if (
        !set ||
        set.id !== result.resultSetId ||
        !origin ||
        origin.connectionId !== result.connectionId ||
        origin.tabId !== result.tabId ||
        origin.sessionId !== result.sessionId ||
        origin.setIndex !== result.setIndex ||
        (origin.mode === 'agent' ? origin.workId !== workId : artifact.createdByActorId !== ctx.userId && !document.content.evidence.some(e => e.artifactId === artifact.id))
    )
        throw new DatabaseError('The result does not belong to this workspace.', 403);
    if (
        origin.mode === 'sql' &&
        !document.content.evidence.some(e => e.artifactId === artifact.id) &&
        !(await db.tabState.loadTabState(result.tabId, ctx.userId, origin.connectionId, workId))
    )
        throw new DatabaseError('The result tab belongs to another workspace.', 403);
    if (
        !ctx.access.permissions.connection.read ||
        !document.scope.connectionIds.includes(origin.connectionId) ||
        !isAnalysisDatabaseAllowed(document.scope, origin.connectionId, set.sourceDatabaseName) ||
        !(await db.connections.getById(ctx.organizationId, origin.connectionId))
    )
        throw new DatabaseError('The result source is outside the report scope.', 403);
    if (
        set.status !== 'success' ||
        set.limited ||
        set.dataAvailability !== 'full' ||
        (set.sql ?? '').trim() !== result.sql.trim() ||
        (set.sourceDatabaseName ?? null) !== result.database
    )
        throw new DatabaseError('The result is unavailable or no longer matches the query.', 409);
    const session = await db.resultSets.getQuerySession({ ...owner(ctx), sessionId: origin.sessionId });
    if (session?.status !== 'success') throw new DatabaseError('The execution did not complete successfully.', 409);
    return { artifact, origin, set };
}
async function verifiedEvidence(ctx: Context, document: Pick<WorkDocumentView, 'id' | 'scope' | 'content'>, workId: string, result: ReportResultPointer): Promise<WorkEvidence> {
    const { artifact, origin, set } = await verifiedResult(ctx, document, workId, result);
    const rows = await ctx.services.db.resultSets.readRows({ ...owner(ctx), resultSetId: set.id, limit: REPORT_SNAPSHOT_ROW_LIMIT });
    if (rows.dataAvailability !== 'full') throw new DatabaseError('Run the query again to restore the complete result.', 409);
    return {
        artifactId: artifact.id,
        title: artifact.title,
        sql: set.sql,
        connectionId: origin.connectionId,
        connectionName: artifact.connectionName,
        sourceDatabaseName: set.sourceDatabaseName,
        runId: workId,
        capturedAt: new Date(artifact.createdAt).toISOString(),
        rows: rows.rows,
        rowCount: rows.rowCount,
        columns: rows.columns.map(c => c.name),
        columnTypes: rows.columns.map(c => ({ name: c.name, type: String(c.databaseType ?? c.logicalType ?? 'unknown') })),
        truncated: false,
    } satisfies WorkEvidence;
}
async function collectTabResults(ctx: Context, workId: string, current: Pick<WorkDocumentView, 'title' | 'id' | 'scope' | 'content'>, draft: ReportWorkingDraft) {
    const db = ctx.services.db;
    const bindings = await reportBindings(ctx, current.content, workId);
    const items = recoverTabUpdates(draft.state.updates ?? [], bindings);
    if (!items.length || !items.every(updateReady)) throw new DatabaseError('Run every changed SQL tab before updating the report.', 409);

    const working: ReportWorkingDraft = { ...draft, results: {}, state: initialWorkingState(current.title, current.content) };
    const results: ReportSqlResult[] = [];
    const replacements = new Map<string, string>();
    for (const item of items) {
        const first = item.results[0];
        const tab = await db.tabState.loadTabState(item.tabId, ctx.userId, first.connectionId, workId);
        if (tab?.content !== item.sql) throw new DatabaseError('The saved tab SQL changed. Run the current query again.', 409);
        const session = await db.resultSets.getQuerySession({ ...owner(ctx), sessionId: first.sessionId });
        if (session?.status !== 'success' || session.resultSetCount !== item.results.length || new Set(item.results.map(result => result.setIndex)).size !== item.results.length)
            throw new DatabaseError('Run the complete SQL tab again.', 409);

        const tabResults = await Promise.all(
            item.results.map(async result => {
                if (
                    result.tabId !== item.tabId ||
                    result.connectionId !== first.connectionId ||
                    result.sessionId !== first.sessionId ||
                    !(await db.resultSets.matchesExecutedBatch({ ...owner(ctx), resultSetId: result.resultSetId, sql: item.sql }))
                )
                    throw new DatabaseError('The result does not match this SQL execution.', 409);
                const evidence = await verifiedEvidence(ctx, current, workId, result);
                working.results[result.resultSetId] = { sourceArtifactId: '', evidence };
                return { result, resultSetId: result.resultSetId, evidence, replaces: [] as string[], tabTitle: item.title, originalSql: item.originalSql };
            }),
        );
        const claimed = new Map<string, ReportResultPointer>();
        for (const [artifactId, binding] of Object.entries(bindings)) {
            if (binding.tabId !== item.sourceTabId || binding.connectionId !== first.connectionId) continue;
            const matchingSql = tabResults.filter(entry => sameReportSql(entry.result.sql, binding.sql));
            const entry = matchingSql.length === 1 ? matchingSql[0] : tabResults.find(entry => entry.result.setIndex === binding.setIndex);
            if (!entry || replacements.has(artifactId)) throw new DatabaseError('The updated SQL no longer identifies a unique result for this report source.', 409);
            const prior = claimed.get(entry.resultSetId);
            if (prior && prior.resultSetId !== binding.resultSetId && !sameReportSql(prior.sql, binding.sql))
                throw new DatabaseError('Multiple report queries match the same updated statement. Keep each linked query in its own result position.', 409);
            claimed.set(entry.resultSetId, binding);
            replacements.set(artifactId, entry.evidence.artifactId);
            entry.replaces.push(artifactId);
        }
        for (const entry of tabResults) {
            const schemas = new Set(
                current.content.evidence
                    .filter(evidence => entry.replaces.includes(evidence.artifactId) && bindings[evidence.artifactId]?.database === entry.result.database)
                    .flatMap(evidence => (evidence.sourceSchemaName ? [evidence.sourceSchemaName] : [])),
            );
            if (schemas.size === 1) entry.evidence.sourceSchemaName = [...schemas][0];
        }
        results.push(...tabResults);
    }
    return { working, results, replacements };
}

type Decide = typeof decideReportSqlUpdate;

function commitAction(decide: Decide) {
    return defineWebAction({
        id: 'report.updates.commit',
        domain: 'report',
        kind: 'command',
        risk: 'write',
        requiresConfirmation: false,
        scopes: ['query:write', 'analysis:run'],
        permissions: writeWorkspace,
        actors: ['user'],
        inputSchema: edit.extend({ requestId: z.string().uuid() }),
        outputSchema: z.object({
            revision,
            publicationId: z.string().optional(),
            unchanged: z.boolean().optional(),
            reason: z.string().optional(),
            draftRevision: revision.optional(),
        }),
        handler: async (ctx, input) => {
            const db = ctx.services.db;
            const target = { ...owner(ctx), ...input };
            const retry = await db.workDocuments.savedWorkingVersion(target);
            if (retry) return { revision: retry.revision, publicationId: retry.publication?.id };
            const { current, draft } = await readCurrent(ctx, input);
            const { working, results, replacements } = await collectTabResults(ctx, input.workId, current, draft);
            const content = working.state.content;
            const blocks = canvasBlocks(content);
            const byArtifact = new Map(results.map(entry => [entry.evidence.artifactId, entry]));
            const decision = await decide({ title: current.title, content, results, context: { ...owner(ctx), req: ctx.services.req, locale: ctx.locale ?? undefined } });
            const included = new Set(replacements.values());
            for (const insertion of decision.insertions) {
                const entry = byArtifact.get(insertion.artifactId);
                if (!entry || included.has(insertion.artifactId) || (insertion.sectionId !== 'root' && !blocks.some(b => b.id === insertion.sectionId && b.kind === 'section')))
                    throw new DatabaseError('AI returned an invalid result or report section.', 422);
                included.add(insertion.artifactId);
            }
            if (!included.size) {
                if (decision.edits.length) throw new DatabaseError('The proposed text has no supporting results.', 422);
                const cleared = await db.workDocuments.saveWorkingDraft({ ...target, state: { ...draft.state, updates: [] } });
                return { revision: current.revision, unchanged: true, reason: decision.reason, draftRevision: cleared.revision };
            }

            let body = content.body ?? '';
            const outline = reportOutline(body, content.visuals).slice(1);
            const seen = new Set<string>();
            const edits = decision.edits.map(edit => {
                const index = blocks.findIndex(b => b.id === edit.blockId && b.kind === 'text');
                if (index < 0 || seen.has(edit.blockId) || edit.artifactIds.some(id => !included.has(id))) throw new DatabaseError('AI returned an unsupported text edit.', 422);
                const replacementBlocks = reportOutline(edit.text, content.visuals).slice(1);
                const priorGroups = workReferences(blocks[index].source).evidenceGroups;
                const nextGroups = workReferences(edit.text).evidenceGroups;
                if (replacementBlocks.length !== 1 || replacementBlocks[0].kind !== 'text' || JSON.stringify(priorGroups) !== JSON.stringify(nextGroups))
                    throw new DatabaseError('AI changed the structure or source links of a report paragraph.', 422);
                seen.add(edit.blockId);
                const links = [...new Set(edit.artifactIds)].map(id => `[${byArtifact.get(id)!.tabTitle.replace(/[\[\]\\]/g, '\\$&')}](dory://evidence/${id})`);
                return { ...outline[index], text: edit.text + ' ' + links.join(' ') };
            });
            for (const edit of edits.sort((a, b) => b.start - a.start)) body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
            content.body = body.replace(/dory:\/\/evidence\/([\w-]+)/g, (url, id: string) => (replacements.has(id) ? 'dory://evidence/' + replacements.get(id) : url));
            for (const group of content.evidenceGroups ?? []) {
                for (const ref of group.references) ref.artifactId = replacements.get(ref.artifactId) ?? ref.artifactId;
            }
            for (const visual of content.visuals) {
                const id = replacements.get(visual.evidenceId);
                if (!id) continue;
                visual.evidenceId = id;
                delete visual.chartData;
                if (visual.chartSpec) {
                    visual.chartData = await db.resultSets.readChart({ ...owner(ctx), resultSetId: byArtifact.get(id)!.resultSetId, ...visual.chartSpec });
                }
            }
            for (const insertion of decision.insertions) {
                working.state = changeReportDraft(working, {
                    type: 'insert',
                    resultId: byArtifact.get(insertion.artifactId)!.resultSetId,
                    anchorId: insertion.sectionId,
                    position: 'end',
                    visual: { id: crypto.randomUUID(), title: insertion.title, type: 'table' },
                });
            }
            const updated = { ...materializeWorkingContent(working.state, working.results, true), sourceWorkId: input.workId, agentWrite: undefined };
            const saved = await db.workDocuments.saveWorkingVersion({
                ...target,
                content: updated,
                selection: { revision: current.revision, remaining: [], title: current.title, state: initialWorkingState(current.title, updated) },
            });
            return { revision: saved.revision, publicationId: saved.publication?.id };
        },
    });
}
export function createReportUpdateActions(decide: Decide = decideReportSqlUpdate) {
    return [load, save, commitAction(decide)];
}
export const reportUpdateActions = createReportUpdateActions();
