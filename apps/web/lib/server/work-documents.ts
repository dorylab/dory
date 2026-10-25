import type { DBService } from '@dory/database';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { AnalysisScope, WorkDocumentContent, WorkEvidence } from '@dory/shared/types/work-document';
import { z } from 'zod';

import { canWriteWorkspace, resolveOrganizationAccess } from '@/lib/server/authz';
import { referencedEvidence } from '@/lib/work-documents/markdown';
import { analysisScopeSchema, applyMarkdownEdits, workDraftSchema, workPatchSchema } from '@/lib/work-documents/schema';

type Owner = { organizationId: string; userId: string };
export const emptyWorkContent = (): WorkDocumentContent => ({ markdown: '', visuals: [], evidence: [], knowledge: [] });

export async function validateAnalysisScope(db: DBService, owner: Owner, raw: unknown): Promise<AnalysisScope> {
    const scope = analysisScopeSchema.parse(raw);
    const access = await resolveOrganizationAccess(owner.organizationId, owner.userId);
    if (!access?.isMember || !access.permissions.workspace.read) throw new DatabaseError('Analysis access denied.', 403);
    const available = access.permissions.connection.read ? await db.connections.list(owner.organizationId) : [];
    const connectionMode = scope.connectionMode ?? (scope.connectionIds.length ? 'manual' : 'auto');
    const knowledgeMode = scope.knowledgeMode ?? (scope.knowledgeModelId ? 'manual' : 'auto');
    const allowed = new Set(available.map(item => item.connection.id));
    const connectionIds = connectionMode === 'auto' ? [...allowed] : [...new Set(scope.connectionIds)];
    if (connectionIds.some(id => !allowed.has(id))) throw new DatabaseError('A selected data source is unavailable.', 403);
    if (knowledgeMode === 'manual' && !scope.knowledgeModelId) throw new DatabaseError('Select a Knowledge model.', 400);
    if (knowledgeMode === 'manual' && scope.knowledgeModelId) {
        const model = await db.knowledge.getModel({ organizationId: owner.organizationId, knowledgeModelId: scope.knowledgeModelId });
        if (connectionMode === 'manual' && !model.dataSources.some(source => connectionIds.includes(source.connectionId)))
            throw new DatabaseError('Select a data source linked to this Knowledge.', 400);
    }
    return { ...scope, connectionMode, knowledgeMode, connectionIds, knowledgeModelId: knowledgeMode === 'manual' ? scope.knowledgeModelId : null };
}

export async function assertDocumentWrite(owner: Owner) {
    if (!canWriteWorkspace(await resolveOrganizationAccess(owner.organizationId, owner.userId))) throw new DatabaseError('Workspace write access required.', 403);
}

export async function saveWorkDraft(
    db: DBService,
    input: Owner & {
        documentId: string;
        expectedRevision: number;
        draft: z.infer<typeof workDraftSchema>;
        source: 'agent' | 'user';
        runId?: string;
        scope?: AnalysisScope;
    },
) {
    await assertDocumentWrite(input);
    const existing = await db.workDocuments.get(input);
    if (existing.revision !== input.expectedRevision) throw new DatabaseError('Report changed. Read the latest version before editing.', 409);
    const draft = workDraftSchema.parse(input.draft);
    const scope = input.scope ?? existing.scope;
    if (input.source === 'agent' && existing.status === 'ready' && draft.status === 'draft') {
        throw new DatabaseError('The update is incomplete. The previous report is preserved. Explain the missing sources in chat, then retry.', 409);
    }
    let references: ReturnType<typeof referencedEvidence>;
    try {
        references = referencedEvidence(draft.markdown, draft.visuals);
    } catch (error) {
        throw new DatabaseError(error instanceof Error ? error.message : 'Invalid references.', 400);
    }
    const { ids, visuals } = references;
    const evidence: WorkEvidence[] = await Promise.all(
        ids.map(async artifactId => {
            const saved = existing.content.evidence.find(item => item.artifactId === artifactId);
            if (saved) return saved;
            const artifact = await db.artifacts.get({ organizationId: input.organizationId, artifactId });
            if (!artifact.connectionId || !scope.connectionIds.includes(artifact.connectionId)) throw new DatabaseError('Evidence is outside the selected analysis scope.', 403);
            if (artifact.workId) {
                if (!(await db.works.getById({ ...input, workId: artifact.workId }))) throw new DatabaseError('Evidence is unavailable.', 403);
            }
            if (!artifact.resultSet) throw new DatabaseError('Evidence has no query result.', 400);
            const result = await db.resultSets.readRows({ organizationId: input.organizationId, resultSetId: artifact.resultSet.id, limit: 500 });
            if (result.dataAvailability === 'none' || ((result.rowCount ?? 0) > 0 && !result.rows.length))
                throw new DatabaseError('Evidence data is no longer available. Re-run the query.', 409);
            const rows = result.rows;
            return {
                artifactId,
                title: artifact.title,
                connectionId: artifact.connectionId,
                connectionName: artifact.connectionName,
                sql: artifact.resultSet.sql,
                capturedAt: new Date(artifact.createdAt).toISOString(),
                columns: result.columns.map(column => column.name),
                rows,
                rowCount: artifact.rowCount,
                truncated: result.dataAvailability === 'preview-only' || (artifact.rowCount ?? rows.length) > rows.length,
                runId: artifact.workId,
            };
        }),
    );
    for (const visual of visuals) {
        if (visual.chart) {
            const source = evidence.find(item => item.artifactId === visual.evidenceId);
            if (!source?.columns.includes(visual.chart.xKey) || !source.columns.includes(visual.chart.yKey))
                throw new DatabaseError('Chart columns do not match its evidence.', 400);
        }
    }
    for (const visual of visuals) {
        const source = evidence.find(item => item.artifactId === visual.evidenceId);
        if (visual.metric && (!source?.columns.includes(visual.metric.column) || !source.rows[visual.metric.rowIndex]))
            throw new DatabaseError('Metric cell does not exist in its evidence.', 400);
    }
    const knowledge = [...existing.content.knowledge];
    if (input.runId) {
        const assets = await db.works.listAgentAssetUsage({ ...input, workId: input.runId });
        for (const asset of assets) {
            if (asset.assetKind === 'artifact' || knowledge.some(item => item.ref === asset.assetRef && item.revision === asset.revision)) continue;
            knowledge.push({
                ref: asset.assetRef,
                title: String(asset.assetSnapshot.title ?? asset.assetRef),
                revision: asset.revision,
                content: JSON.stringify(asset.assetSnapshot).slice(0, 20000),
            });
        }
    }
    const content: WorkDocumentContent = { markdown: draft.markdown, visuals, evidence, knowledge };
    if (JSON.stringify(content).length > 4_000_000) throw new DatabaseError('Report snapshot is too large. Use smaller aggregated results.', 400);
    return db.workDocuments.update({
        ...input,
        title: draft.title,
        content,
        scope: scope.connectionMode === 'auto' ? { ...scope, connectionIds: [...new Set(evidence.flatMap(item => (item.connectionId ? [item.connectionId] : [])))] } : scope,
        status: draft.status,
    });
}

/** Explicit promotion of a historical run; old runs are never migrated automatically. */
export async function createWorkFromRun(db: DBService, input: Owner & { runId: string }) {
    await assertDocumentWrite(input);
    const run = await db.works.getById({ ...input, workId: input.runId });
    if (!run) throw new DatabaseError('Analysis not found.', 404);
    const [findings, assets] = await Promise.all([
        db.works.listFindings({ ...input, workId: input.runId }),
        db.artifacts.listByWork({ organizationId: input.organizationId, workId: input.runId }),
    ]);
    const connectionIds = [...new Set(assets.flatMap(asset => (asset.connectionId ? [asset.connectionId] : [])).concat(run.connectionId ? [run.connectionId] : []))];
    const scope = { connectionIds };
    const document = await db.workDocuments.create({
        ...input,
        title: run.title,
        chatId: typeof run.metadata?.chatId === 'string' ? run.metadata.chatId : null,
        creationKey: `promote:${run.workId}`,
        scope,
        content: emptyWorkContent(),
    });
    if (document.revision > 1) return document;
    const available = new Set<string>();
    for (const asset of assets) {
        try {
            const artifact = await db.artifacts.get({ organizationId: input.organizationId, artifactId: asset.id });
            if (!artifact.resultSet) continue;
            const preview = await db.resultSets.readRows({ organizationId: input.organizationId, resultSetId: artifact.resultSet.id, limit: 1 });
            if (preview.dataAvailability !== 'none' && ((preview.rowCount ?? 0) === 0 || preview.rows.length)) available.add(asset.id);
        } catch {
            /* Expired evidence is reported as a limitation below. */
        }
    }
    const missing = findings.some(finding => finding.evidence.some(item => !available.has(item.id)));
    const markdown = findings
        .map(
            finding =>
                `## ${finding.title}\n\n${finding.content ?? ''}\n\n${finding.evidence
                    .filter(item => available.has(item.id))
                    .map(item => `[Evidence](dory://evidence/${item.id})`)
                    .join(' ')}`,
        )
        .join('\n\n');
    return saveWorkDraft(db, {
        ...input,
        documentId: document.id,
        expectedRevision: 1,
        runId: run.workId,
        source: 'user',
        draft: {
            title: document.title,
            markdown: (missing ? '> Some original evidence is no longer available. Re-run the analysis before relying on these findings.\n\n' : '') + markdown,
            visuals: [],
            status: missing || run.status !== 'completed' || !findings.length ? 'draft' : 'ready',
        },
    });
}

export async function patchWorkDocument(
    db: DBService,
    input: Owner & { documentId: string; expectedRevision: number; patch: z.infer<typeof workPatchSchema>; runId: string; scope: AnalysisScope },
) {
    const existing = await db.workDocuments.get(input);
    if (existing.revision !== input.expectedRevision) throw new DatabaseError('Report changed. Read the latest version before editing.', 409);
    const patch = workPatchSchema.parse(input.patch);
    let markdown: string;
    try {
        markdown = applyMarkdownEdits(existing.content.markdown, patch.edits);
    } catch (error) {
        throw new DatabaseError(error instanceof Error ? error.message : 'Invalid edit.', 409);
    }
    const visuals = new Map(existing.content.visuals.map(visual => [visual.id, visual]));
    if (patch.visuals && new Set(patch.visuals.map(visual => visual.id)).size !== patch.visuals.length) throw new DatabaseError('Visual IDs must be unique.', 400);
    for (const visual of patch.visuals ?? []) visuals.set(visual.id, visual);
    return saveWorkDraft(db, {
        ...input,
        source: 'agent',
        draft: { title: patch.title ?? existing.title, markdown, visuals: [...visuals.values()], status: patch.status },
    });
}
