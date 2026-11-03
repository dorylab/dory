import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReportWorkingDraft } from '@dory/shared/types/report-workspace';
import type { WorkDocumentContent, WorkEvidence } from '@dory/shared/types/work-document';

import { hasCompleteReportSnapshot, hasQueryLimit } from '@/lib/work-documents/evidence-preview';
import { applyWorkingResult, initialWorkingState, versionContent } from '@/lib/work-documents/working-draft';
import { selectReportEvidence } from '@/lib/work-documents/workspace-evidence';
import { buildReportWorkspacePath } from '@/lib/work-documents/workspace-url';

const evidence: WorkEvidence = {
    artifactId: 'source',
    snapshotId: 'snapshot',
    title: 'Result',
    sql: 'select n from t limit 10',
    connectionId: 'connection',
    connectionName: 'Database',
    columns: ['n'],
    rows: [{ n: 1 }],
    rowCount: 1,
    truncated: false,
    capturedAt: '2026-11-03',
    runId: null,
};
function fixture(): ReportWorkingDraft {
    const content: WorkDocumentContent = {
        markdown: 'Conclusion. [Evidence](dory://evidence-group/one)\n\nAnother. [Evidence](dory://evidence-group/two)\n\n![A](dory://visual/a)\n\n![B](dory://visual/b)',
        visuals: [
            { id: 'a', title: 'A', type: 'table', evidenceId: 'source' },
            { id: 'b', title: 'B', type: 'table', evidenceId: 'source' },
        ],
        evidence: [evidence],
        knowledge: [],
        evidenceGroups: ['one', 'two'].map(id => ({ id, references: [{ artifactId: 'source', explanation: 'Original explanation' }], needsReview: false })),
    };
    return {
        documentId: 'report',
        userId: 'user',
        revision: 1,
        baseRevision: 1,
        expectedReportRevision: 1,
        state: { ...initialWorkingState('Report', content), bindingVersion: undefined },
        results: {
            next: { sourceArtifactId: 'source', evidence: { ...evidence, artifactId: 'next', snapshotId: 'next-snapshot', rows: [{ n: 2 }] } },
        },
    };
}

test('snapshot merging requires full preservation, known row count and no truncation', () => {
    const inspection = { evidence, fullResultAvailable: true, artifactAvailable: true, canOpenWorkspace: true };
    assert.equal(hasCompleteReportSnapshot(inspection), true);
    for (const patch of [{ rowCount: null }, { rowCount: 2 }, { truncated: true }])
        assert.equal(hasCompleteReportSnapshot({ ...inspection, evidence: { ...evidence, ...patch } }), false);
    assert.equal(hasCompleteReportSnapshot({ ...inspection, fullResultAvailable: false }), false);
    assert.equal(hasCompleteReportSnapshot({ ...inspection, evidence: { ...evidence, rowCount: 0, rows: [] } }), true);
});

test('query LIMIT ignores quoted text, identifiers, comments and nested queries', () => {
    for (const sql of ['select * from t LIMIT 10', 'with x as (select * from t limit 1) select * from x limit $1', 'select * from t limit ?, 10', 'select * from t limit all'])
        assert.equal(hasQueryLimit(sql), true, sql);
    for (const sql of [
        "select 'limit 10' as label",
        'select "limit 10" from t',
        'select `limit 10` from t',
        'select [limit 10] from t',
        'select $$limit 10$$',
        'select $tag$limit 10$tag$',
        'select 1 /* limit 10 */',
        'select 1 -- limit 10',
        'select * from (select * from t limit 10) t',
        'select 1 /* outer /* limit 1 */ limit 2 */',
        "select 'it''s limit 10'",
    ])
        assert.equal(hasQueryLimit(sql), false, sql);
});

test('legacy applying one component splits a shared query without changing other components or conclusions', () => {
    const draft = fixture();
    const before = structuredClone(draft);
    const state = applyWorkingResult(draft, 'query_1', 'next', { artifactId: 'source', componentId: 'a' }, 'split');
    assert.equal(state.content.visuals[0].evidenceId, 'next');
    assert.equal(state.content.visuals[1].evidenceId, 'source');
    assert.deepEqual(state.content.evidenceGroups, draft.state.content.evidenceGroups);
    assert.equal(state.tabs.find(tab => tab.id === 'split')?.appliedId, 'next');
    assert.equal(state.proseNeedsReview, true);
    assert.deepEqual(draft, before);
    assert.deepEqual(
        versionContent({ ...draft, state })
            .evidence.map(item => item.artifactId)
            .sort(),
        ['next', 'source'],
    );
});

test('applying one conclusion reference leaves sibling groups and visuals unchanged', () => {
    const draft = fixture();
    const state = applyWorkingResult(draft, 'query_1', 'next', { artifactId: 'source', groupId: 'one' }, 'unused');
    assert.equal(state.content.evidenceGroups![0].references[0].artifactId, 'next');
    assert.equal(state.content.evidenceGroups![0].needsReview, true);
    assert.deepEqual(state.content.evidenceGroups![1], draft.state.content.evidenceGroups![1]);
    assert.deepEqual(state.content.visuals, draft.state.content.visuals);
    assert.equal(state.tabs.length, 1);
});

test('missing, ambiguous, deleted, stale and foreign targets are rejected without changing the draft', () => {
    const draft = fixture();
    for (const target of [
        { artifactId: 'source' },
        { artifactId: 'source', componentId: 'a', groupId: 'one' },
        { artifactId: 'source', componentId: 'gone' },
        { artifactId: 'old', componentId: 'a' },
        { artifactId: 'old', groupId: 'one' },
    ])
        assert.throws(() => applyWorkingResult(draft, 'query_1', 'next', target, 'split'));
    draft.results.next.sourceArtifactId = 'other';
    assert.throws(() => applyWorkingResult(draft, 'query_1', 'next', { artifactId: 'source', componentId: 'a' }, 'split'), /unavailable/);
    assert.equal(draft.state.content.visuals[0].evidenceId, 'source');
});

test('workspace links retain a validated component or conclusion target', () => {
    const draft = fixture();
    const document = { revision: 1, chatId: null, content: draft.state.content };
    const reference = { documentId: 'report', revision: 1, artifactId: 'source', snapshotId: 'snapshot', componentId: 'a' };
    assert.deepEqual(selectReportEvidence(document, reference, 'user'), evidence);
    assert.match(buildReportWorkspacePath('org', reference), /componentId=a/);
    assert.match(buildReportWorkspacePath('org', { ...reference, componentId: undefined, groupId: 'one' }), /groupId=one/);
    assert.throws(() => selectReportEvidence(document, { ...reference, groupId: 'one' }, 'user'), /one report target/);
    assert.throws(() => selectReportEvidence(document, { ...reference, componentId: 'gone' }, 'user'), /no longer references/);
});
