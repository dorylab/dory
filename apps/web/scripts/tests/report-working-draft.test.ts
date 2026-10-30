import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { PostgresDBClient } from '@dory/shared';
import { PostgresWorkDocumentsRepository } from '@dory/database/postgres/impl/work-documents';
import type { WorkDocumentContent, WorkEvidence } from '@dory/shared/types/work-document';
import { resolvedReport } from '@/lib/work-documents/report-core';
import { initialWorkingState, materializeWorkingContent, validateWorkingVisual, versionContent } from '@/lib/work-documents/working-draft';

const evidence: WorkEvidence = {
    artifactId: 'artifact_1',
    title: 'Count',
    connectionId: 'connection',
    connectionName: 'Fixture',
    sourceDatabaseName: 'main',
    sql: 'select count(*) as count from customers',
    columns: ['count'],
    rows: [{ count: 3 }],
    rowCount: 1,
    truncated: false,
    capturedAt: '2026-10-30T00:00:00Z',
    runId: null,
};
const content: WorkDocumentContent = {
    markdown: '# Report\n\n![Count](dory://visual/metric)\n\n![Rows](dory://visual/table)',
    evidence: [evidence],
    knowledge: [],
    visuals: [
        { id: 'metric', type: 'metric', title: 'Count', evidenceId: evidence.artifactId, metric: { column: 'count', rowIndex: 0 } },
        { id: 'table', type: 'table', title: 'Rows', evidenceId: evidence.artifactId },
    ],
};

test('shared queries, independent bindings, candidate/apply separation and version filtering', () => {
    const state = initialWorkingState('Report', content);
    assert.equal(state.tabs.length, 1);
    assert.deepEqual(state.tabs[0].componentIds, ['metric', 'table']);
    const result = {
        sourceArtifactId: evidence.artifactId,
        evidence: { ...evidence, artifactId: 'artifact_new', snapshotId: 'working_result', sql: 'select 2 as count', rows: [{ count: 2 }] },
    };
    const results = { result };
    state.tabs[0].candidateId = 'result';
    assert.equal(materializeWorkingContent(state, results).evidence[0].rows[0].count, 3);
    state.tabs[0].appliedId = 'result';
    const applied = materializeWorkingContent(state, results, true);
    assert.doesNotThrow(() => resolvedReport(applied));
    assert.ok(applied.visuals.every(v => v.evidenceId === 'artifact_new'));
    assert.equal(content.evidence[0].rows[0].count, 3);
    const original = initialWorkingState('Report', content);
    original.tabs.push({ ...original.tabs[0], id: 'copy', componentIds: ['table'], appliedId: 'result' });
    original.tabs[0].componentIds = ['metric'];
    const split = materializeWorkingContent(original, results, true);
    assert.equal(split.visuals[0].evidenceId, 'artifact_1');
    assert.equal(split.visuals[1].evidenceId, 'artifact_new');
    original.tabs[1].hidden = true;
    assert.equal(materializeWorkingContent(original, results, true).visuals.length, 2);
    const fixed = versionContent({
        userId: 'alice',
        documentId: 'doc',
        baseRevision: 1,
        expectedReportRevision: 1,
        revision: 1,
        state: { ...state, content: applied },
        results: { ...results, unused: { ...result, evidence: { ...result.evidence, artifactId: 'unused' } } },
    });
    assert.deepEqual(
        fixed.evidence.map(e => e.artifactId),
        ['artifact_new'],
    );
});

test('changed fields, missing metric rows, truncation and invalid numeric charts are rejected', () => {
    const metric = content.visuals[0];
    assert.throws(() => validateWorkingVisual(metric, { ...evidence, columns: ['other'] }), /column or row/);
    assert.throws(() => validateWorkingVisual(metric, { ...evidence, rows: [] }), /column or row/);
    assert.throws(() => validateWorkingVisual(metric, { ...evidence, truncated: true }), /partial/);
    assert.doesNotThrow(() => validateWorkingVisual({ ...metric, allowSubset: true }, { ...evidence, truncated: true }));
    assert.doesNotThrow(() => validateWorkingVisual(content.visuals[1], { ...evidence, rows: [], rowCount: 0 }));
    assert.throws(
        () =>
            validateWorkingVisual(
                { id: 'chart', title: 'Chart', evidenceId: evidence.artifactId, type: 'chart', chart: { type: 'bar', xKey: 'count', yKey: 'count' } },
                { ...evidence, rows: [{ count: 'wrong' }] },
            ),
        /numeric/,
    );
});

test('real PGlite drafts enforce ownership, atomic immutable versions, replay and conflicts', async () => {
    const db = new PGlite();
    const repo = new PostgresWorkDocumentsRepository();
    try {
        for (const name of ['0038_work_documents', '0041_report_publications', '0042_report_working_drafts']) {
            const sql = await readFile(`../../packages/database/src/postgres/migrations/${name}.sql`, 'utf8');
            assert.equal(sql, await readFile(`../../packages/database/src/pglite/migrations/${name}.sql`, 'utf8'));
            await db.exec(sql);
        }
        await repo.init(drizzle(db) as unknown as PostgresDBClient);
        const owner = { organizationId: 'org', userId: 'alice' };
        const report = await repo.create({ ...owner, creationKey: 'fixture', title: 'Report', content, scope: { connectionIds: ['connection'] } });
        const target = { ...owner, documentId: report.id, baseRevision: 1 };
        const draft = await repo.initializeWorkingDraft({ ...target, state: initialWorkingState(report.title, report.content) });
        assert.equal((await repo.versions(target)).length, 1);
        assert.equal((await repo.initializeWorkingDraft({ ...target, state: initialWorkingState('Ignored', content) })).state.title, 'Report');
        await assert.rejects(repo.workingDraft({ ...target, userId: 'bob' }), /not found/);
        const result = { sourceArtifactId: evidence.artifactId, evidence: { ...evidence, artifactId: 'artifact_new', snapshotId: 'working_result', rows: [{ count: 2 }] } };
        await repo.recordWorkingResult({ ...target, resultId: 'result', result });
        const saved = await repo.saveWorkingDraft({
            ...target,
            expectedDraftRevision: draft.revision,
            state: { ...draft.state, title: 'Changed draft', tabs: draft.state.tabs.map(t => ({ ...t, candidateId: 'result' })) },
        });
        assert.equal(saved.results.result.evidence.rows[0].count, 2);
        assert.equal((await repo.get(target)).title, 'Report');
        await assert.rejects(repo.saveWorkingDraft({ ...target, expectedDraftRevision: draft.revision, state: draft.state }), /another window/);
        const appliedState = { ...saved.state, proseNeedsReview: true, tabs: saved.state.tabs.map(t => ({ ...t, appliedId: 'result' })) };
        appliedState.content = materializeWorkingContent(appliedState, saved.results, true);
        const applied = await repo.saveWorkingDraft({ ...target, expectedDraftRevision: saved.revision, state: appliedState });
        await assert.rejects(repo.saveWorkingVersion({ ...target, expectedDraftRevision: applied.revision, requestId: 'review', content: versionContent(applied) }), /Review/);
        const reviewed = await repo.saveWorkingDraft({ ...target, expectedDraftRevision: applied.revision, state: { ...applied.state, proseNeedsReview: false } });
        const request = { ...target, expectedDraftRevision: reviewed.revision, requestId: 'save', content: versionContent(reviewed) };
        const [first, retry] = await Promise.all([repo.saveWorkingVersion(request), repo.saveWorkingVersion(request)]);
        assert.equal(first.publication.id, retry.publication.id);
        assert.equal((await repo.publications(target)).length, 1);
        assert.equal(first.content.workspaceOrigin?.baseRevision, 1);
        assert.equal(first.content.evidence[0].rows[0].count, 2);
        assert.equal((await repo.getVersion({ ...target, revision: 1 })).content.evidence[0].rows[0].count, 3);
        await assert.rejects(repo.savedWorkingVersion({ ...request, expectedDraftRevision: 1 }), /already used/);
        const reopened = (await repo.workingDraft(target))!;
        await repo.rename({ ...target, title: 'Concurrent update', expectedRevision: first.revision });
        await assert.rejects(repo.saveWorkingVersion({ ...request, requestId: 'conflict', expectedDraftRevision: reopened.revision }), /changed/);
        assert.equal((await repo.workingDraft(target))?.state.title, 'Changed draft');
        const historical = await repo.initializeWorkingDraft({ ...target, baseRevision: first.revision, state: initialWorkingState('Historical branch', first.content) });
        const branch = await repo.saveWorkingVersion({
            ...target,
            baseRevision: first.revision,
            expectedDraftRevision: historical.revision,
            requestId: 'branch',
            content: versionContent(historical),
        });
        assert.equal(branch.publication.number, 2);
        assert.equal(branch.revision, first.revision + 2);
    } finally {
        await db.close();
    }
});
