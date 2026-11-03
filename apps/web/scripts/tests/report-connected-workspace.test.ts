import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReportWorkingDraft } from '@dory/shared/types/report-workspace';
import type { WorkDocumentContent, WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import type { WorkspaceChartSpec } from '@dory/shared/types/workspace-chart';
import { eq } from 'drizzle-orm';

import { workChartSvg } from '@/lib/work-documents/render';
import { reportOutline, resolvedReport } from '@/lib/work-documents/report-core';
import { changeReportDraft, initialWorkingState, reportDraftChanges, upgradeWorkingState, versionContent } from '@/lib/work-documents/working-draft';

import { reportRetentionFixture } from '../../../../packages/database/scripts/tests/report-retention-fixture';
import { artifacts } from '../../../../packages/database/src/postgres/schemas/artifacts';
import { resultSets } from '../../../../packages/database/src/postgres/schemas/result-sets';

const evidence: WorkEvidence = {
    artifactId: 'old',
    title: 'Logs',
    connectionId: 'clickhouse',
    connectionName: 'ClickHouse',
    sql: 'select level, count from logs',
    capturedAt: '2026-11-03T00:00:00Z',
    columns: ['level', 'count'],
    rows: [{ level: 'error', count: 3 }],
    rowCount: 1,
    truncated: false,
    runId: null,
};
const raw: WorkDocumentContent = {
    markdown: '# Overview\n\n![Logs](dory://visual/logs)\n\n## Detail\n\n![Copy](dory://visual/copy)',
    visuals: [
        { id: 'logs', title: 'Logs', type: 'table', evidenceId: 'old' },
        { id: 'copy', title: 'Copy', type: 'table', evidenceId: 'old' },
    ],
    evidence: [evidence],
    knowledge: [],
};
function fixture(): ReportWorkingDraft {
    return {
        id: 'draft',
        documentId: 'report',
        userId: 'alice',
        baseRevision: 1,
        expectedReportRevision: 1,
        revision: 1,
        state: initialWorkingState('Logs report', structuredClone(raw)),
        results: {
            result: {
                tabId: 'new-tab',
                sessionId: 'session',
                sourceArtifactId: '',
                evidence: { ...evidence, artifactId: 'new', snapshotId: 'snap-new', connectionId: 'postgres', connectionName: 'Postgres', rows: [{ level: 'error', count: 8 }] },
            },
        },
    };
}

test('any result can replace one block without tab ownership or changing shared references', () => {
    const draft = fixture();
    const before = structuredClone(draft);
    draft.state.tabs = [];
    const next = changeReportDraft(draft, { type: 'replace', resultId: 'result', blockIds: ['logs'] });
    assert.equal(next.content.visuals[0].evidenceId, 'new');
    assert.equal(next.content.visuals[1].evidenceId, 'old');
    assert.equal(next.tabs.length, 0);
    assert.equal(before.state.content.visuals[0].evidenceId, 'old');
    assert.equal(reportDraftChanges(next).length, 1);
    const undo = changeReportDraft({ ...draft, state: next }, { type: 'revert', blockId: 'logs' });
    assert.deepEqual(reportDraftChanges(undo), []);
});

test('inserting at a section boundary, removing and undoing are net changes', () => {
    const draft = fixture();
    const section = reportOutline(draft.state.content.body!, draft.state.content.visuals).find(node => node.title === 'Overview')!;
    const next = changeReportDraft(draft, {
        type: 'insert',
        resultId: 'result',
        visual: { id: 'trend', type: 'chart', title: 'Trend', chartSpec: { version: 1, chartType: 'line', xKey: 'level', yKey: 'sum:count', groupKey: '__none__' } },
        anchorId: section.id,
        position: 'end',
    });
    // End of a level-one section includes its nested Detail section.
    assert.ok(next.content.body!.indexOf('source="trend"') > next.content.body!.indexOf('source="copy"'));
    assert.equal(next.content.visuals.at(-1)?.chartSpec?.yKey, 'sum:count');
    assert.doesNotThrow(() => resolvedReport(next.content));
    const removed = changeReportDraft({ ...draft, state: next }, { type: 'remove', blockId: 'trend' });
    assert.deepEqual(reportDraftChanges(removed), []);
    assert.ok(!removed.content.evidence.some(item => item.artifactId === 'new'));
    const deleted = changeReportDraft(draft, { type: 'remove', blockId: 'logs' });
    const restored = changeReportDraft({ ...draft, state: deleted }, { type: 'revert', blockId: 'logs' });
    assert.deepEqual(reportDraftChanges(restored), []);
    assert.ok(restored.content.body!.indexOf('source="logs"') < restored.content.body!.indexOf('## Detail'));
});

test('batch replacement validates every target atomically and unused runs never enter a version', () => {
    const draft = fixture();
    assert.throws(() => changeReportDraft(draft, { type: 'replace', resultId: 'result', blockIds: ['logs', 'missing'] }), /target changed/);
    assert.equal(draft.state.content.visuals[0].evidenceId, 'old');
    assert.deepEqual(
        versionContent(draft).evidence.map(item => item.artifactId),
        ['old'],
    );
    const next = changeReportDraft(draft, { type: 'replace', resultId: 'result', blockIds: ['logs', 'copy'] });
    assert.deepEqual(
        versionContent({ ...draft, state: next }).evidence.map(item => item.artifactId),
        ['new'],
    );
    assert.equal(next.tabs.length, draft.state.tabs.length);
});

test('replacement rejects missing fields and changed metric types without altering the draft', () => {
    const draft = fixture();
    const operation = {
        type: 'replace' as const,
        resultId: 'result',
        blockIds: ['logs'],
        chartSpec: { version: 1 as const, chartType: 'bar' as const, xKey: 'level', yKey: 'sum:count', groupKey: '__none__' },
    };
    draft.state.content.visuals[0].type = 'chart';
    draft.results.result.evidence.columnTypes = [
        { name: 'level', type: 'String' },
        { name: 'count', type: 'String' },
    ];
    assert.throws(() => changeReportDraft(draft, operation), /no longer numeric/);
    draft.results.result.evidence.columns = ['level'];
    assert.throws(() => changeReportDraft(draft, operation), /fields changed/);
    assert.equal(draft.state.content.visuals[0].evidenceId, 'old');
});

test('legacy applied tabs are materialized once, then bindings survive tab removal', () => {
    const draft = fixture();
    draft.state.bindingVersion = undefined;
    draft.state.tabs[0].appliedId = 'result';
    const upgraded = upgradeWorkingState(draft, raw);
    upgraded.tabs = [];
    assert.equal(versionContent({ ...draft, state: upgraded }).visuals[0].evidenceId, 'new');
});

test('temporary runs expire normally; adopted results and undo baseline are retained; save advances the same draft', async () => {
    const f = await reportRetentionFixture();
    try {
        const original = await f.seedEvidence('old');
        const output = await f.results.persistQueryResultSet({
            organizationId: 'org',
            userId: 'alice',
            source: 'report-workspace',
            sessionId: 'explore',
            sessionSqlText: 'select 2 as value',
            rows: [{ value: 2 }],
            resultSet: { sessionId: 'explore', setIndex: 0, sqlText: 'select 2 as value', status: 'success', rowCount: 1, columns: [{ name: 'value', type: 'Int64' }] },
        });
        const artifactId = `artifact_${output.resultSetId}`;
        assert.equal(
            (await f.catalog.list({ organizationId: 'org', userId: 'alice' })).rows.some(item => item.id === artifactId),
            false,
        );
        await f.catalog.pin({ organizationId: 'org', userId: 'alice', artifactId, pinnedByActorId: 'alice' });
        assert.ok((await f.catalog.list({ organizationId: 'org', userId: 'alice', pinnedOnly: true })).rows.some(item => item.id === artifactId));
        await f.catalog.unpin({ organizationId: 'org', userId: 'alice', artifactId });
        assert.ok(!(await f.catalog.list({ organizationId: 'org', userId: 'alice' })).rows.some(item => item.id === artifactId));
        const content = { ...raw, evidence: [original] };
        const owner = { organizationId: 'org', userId: 'alice' };
        const report = await f.reports.create({ ...owner, creationKey: 'connected', title: 'Report', scope: { connectionIds: [] }, content });
        const target = { ...owner, documentId: report.id, baseRevision: report.revision };
        let draft = await f.reports.initializeWorkingDraft({ ...target, state: initialWorkingState(report.title, report.content) });
        const id = draft.id;
        await f.reports.recordWorkingResult({
            ...target,
            resultId: output.resultSetId,
            result: { sourceArtifactId: '', evidence: { ...original, artifactId, rows: [{ value: 2 }] } },
        });
        assert.equal(
            (await f.catalog.list({ organizationId: 'org', userId: 'alice' })).rows.some(item => item.id === artifactId),
            false,
        );
        draft = (await f.reports.workingDraft(target))!;
        const applied = changeReportDraft(draft, { type: 'replace', resultId: output.resultSetId, blockIds: ['logs', 'copy'] });
        draft = await f.reports.saveWorkingDraft({ ...target, expectedDraftRevision: draft.revision, state: { ...applied, proseNeedsReview: false } });
        assert.equal(
            (await f.catalog.list({ organizationId: 'org', userId: 'alice' })).rows.some(item => item.id === artifactId),
            true,
        );
        const version = await f.reports.saveWorkingVersion({ ...target, expectedDraftRevision: draft.revision, requestId: 'save-connected', content: versionContent(draft) });
        const resumed = await f.reports.initializeWorkingDraft({ ...target, baseRevision: version.revision, state: initialWorkingState('unused', version.content) });
        assert.equal(resumed.id, id);
        assert.equal(resumed.state.baseline?.revision, version.revision);
        assert.deepEqual(reportDraftChanges(resumed.state), []);
        assert.ok(resumed.results[output.resultSetId]);
        const [artifact] = await f.db.select().from(artifacts).where(eq(artifacts.id, artifactId));
        assert.equal(artifact.visibility, 'workspace'); // Visible through an adopted reference, not a permanent pin.
        const unused = await f.seedEvidence('unused');
        await f.reports.recordWorkingResult({ ...target, resultId: 'unused', result: { sourceArtifactId: '', evidence: unused } });
        await f.db.update(resultSets).set({ expiresAt: new Date(Date.now() - 1000) });
        await f.db.update(artifacts).set({ expiresAt: new Date(Date.now() - 1000) });
        const cleaned = await f.results.cleanupWorkspaceStorage({ organizationId: 'org', maxStorageBytes: 0 });
        assert.equal(cleaned.deletedResultSets, 1, 'an unused result in modern draft.results is eligible for cleanup');
        assert.deepEqual((await f.db.select({ id: artifacts.id }).from(artifacts)).map(item => item.id).sort(), [artifactId, 'old'].sort());
    } finally {
        await f.close();
    }
});

test('all six charts compute from full retained data and freeze a reusable report projection', async () => {
    const f = await reportRetentionFixture();
    try {
        const rows = Array.from({ length: 1200 }, (_, index) => ({ index, bucket: index % 10, value: 1, category: index % 2 }));
        const evidence = await f.seedEvidence('full-chart', rows);
        const artifact = await f.catalog.get({ organizationId: 'org', userId: 'alice', artifactId: evidence.artifactId });
        assert.equal(evidence.rows.length, 500);
        for (const chartType of ['bar', 'line', 'pie', 'scatter', 'histogram', 'heatmap'] as const) {
            const spec: WorkspaceChartSpec = {
                version: 1,
                chartType,
                xKey: chartType === 'scatter' || chartType === 'histogram' ? 'index' : 'bucket',
                yKey: 'sum:value',
                groupKey: chartType === 'pie' ? '__none__' : 'category',
                chartColorPreset: 'emerald',
                filters: [{ col: 'index', kind: 'number', op: 'ge', value: '1000' }],
                search: { text: '1', columns: ['value'] },
            };
            const projection: NonNullable<WorkVisual['chartData']> = await f.results.readChart({
                organizationId: 'org',
                userId: 'alice',
                resultSetId: artifact.sourceResultSetId!,
                ...spec,
            });
            const sum = projection.data.reduce((total, row) => total + projection.series.reduce((subtotal, series) => subtotal + Number(row[series.key] ?? 0), 0), 0);
            assert.equal(sum, 200, `${chartType} includes rows outside the embedded preview and applies filters/search`);
            const svg = workChartSvg(
                { id: chartType, type: 'chart', title: chartType, evidenceId: evidence.artifactId, chartSpec: spec, chartData: projection },
                { ...evidence, rows: [] },
            );
            assert.match(svg, /<svg/);
            assert.doesNotMatch(svg, /NaN|Infinity/);
        }
        assert.equal((await f.db.select().from(resultSets)).length, 1, 'multiple chart projections share one result');
    } finally {
        await f.close();
    }
});

test('explicit field mapping preserves legacy area series and validates all targets atomically', () => {
    const draft = fixture();
    draft.state.content.visuals[0] = {
        ...draft.state.content.visuals[0],
        type: 'chart',
        chart: { type: 'area', xKey: 'old_level', yKeys: [{ key: 'old_count', label: 'Errors' }] },
    };
    draft.state.content.body = draft.state.content.body!.replace('<DataTable source="logs"', '<Chart source="logs"');
    const op = { type: 'replace' as const, resultId: 'result', blockIds: ['logs'], fieldMappings: { logs: { old_level: 'level', old_count: 'count' } } };
    const next = changeReportDraft(draft, op);
    assert.deepEqual(next.content.visuals[0].chart, { type: 'area', xKey: 'level', yKeys: [{ key: 'count', label: 'Errors' }] });
    assert.equal(draft.state.content.visuals[0].evidenceId, 'old');
    assert.throws(() => changeReportDraft(draft, { ...op, fieldMappings: { logs: { old_level: 'level', old_count: 'absent' } } }), /fields changed/);
    assert.throws(() => changeReportDraft(draft, { ...op, blockIds: ['logs', 'gone'] }), /target changed/);
});

test('an undo-only result stays retained after deletion and is released when the undo is replaced', async () => {
    const f = await reportRetentionFixture();
    try {
        const original = await f.seedEvidence('old');
        const adopted = await f.seedEvidence('undo-only');
        const owner = { organizationId: 'org', userId: 'alice' };
        const report = await f.reports.create({ ...owner, creationKey: 'canvas-undo', title: 'Report', scope: { connectionIds: [] }, content: { ...raw, evidence: [original] } });
        const target = { ...owner, documentId: report.id, baseRevision: report.revision };
        let draft = await f.reports.initializeWorkingDraft({ ...target, state: initialWorkingState(report.title, report.content) });
        await f.reports.recordWorkingResult({ ...target, resultId: 'new', result: { sourceArtifactId: '', evidence: adopted } });
        draft = (await f.reports.workingDraft(target))!;
        for (const operation of [
            { type: 'insert' as const, resultId: 'new', visual: { id: 'inserted', title: 'Inserted', type: 'table' as const }, anchorId: 'root', position: 'end' as const },
            { type: 'remove' as const, blockId: 'inserted' },
        ])
            draft = await f.reports.saveWorkingDraft({ ...target, expectedDraftRevision: draft.revision, state: changeReportDraft(draft, operation) });
        assert.ok(!draft.state.content.evidence.some(item => item.artifactId === adopted.artifactId));
        assert.ok(draft.state.canvas?.undo?.content.evidence.some(item => item.artifactId === adopted.artifactId));
        await f.db.update(resultSets).set({ expiresAt: new Date(Date.now() - 1000) });
        await f.db.update(artifacts).set({ expiresAt: new Date(Date.now() - 1000) });
        assert.equal((await f.results.cleanupWorkspaceStorage({ organizationId: 'org', maxStorageBytes: 0 })).deletedResultSets, 0);
        draft = await f.reports.saveWorkingDraft({
            ...target,
            expectedDraftRevision: draft.revision,
            state: changeReportDraft(draft, { type: 'rename', blockId: 'logs', title: 'Renamed' }),
        });
        assert.ok(!draft.state.canvas?.undo?.content.evidence.some(item => item.artifactId === adopted.artifactId));
        assert.equal((await f.results.cleanupWorkspaceStorage({ organizationId: 'org', maxStorageBytes: 0 })).deletedResultSets, 1);
    } finally {
        await f.close();
    }
});
