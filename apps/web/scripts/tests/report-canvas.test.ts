import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReportWorkingDraft } from '@dory/shared/types/report-workspace';
import type { WorkEvidence } from '@dory/shared/types/work-document';

import { withReportCanvas } from '@/lib/work-documents/report-canvas';
import { changeReportDraft, initialWorkingState, reportDraftChanges } from '@/lib/work-documents/working-draft';
import { sameChartSpec } from '@/lib/work-documents/workspace-presentation';
import { workspaceChartSpecSchema } from '@/lib/work-documents/schema';

const evidence: WorkEvidence = {
    artifactId: 'original',
    title: 'Logs',
    columns: ['level', 'count'],
    rows: [{ level: 'info', count: 2 }],
    rowCount: 1,
    truncated: false,
    capturedAt: '',
    sql: '',
    connectionId: null,
    connectionName: null,
    runId: null,
};
function fixture(): ReportWorkingDraft {
    const state = initialWorkingState('Report', {
        markdown:
            '# Summary\n\nDuplicate.\n\nDuplicate.\n\n- Errors grew [Evidence](dory://evidence-group/finding)\n- Requests stayed flat\n\n![Logs](dory://visual/logs)\n\n## End',
        visuals: [{ id: 'logs', title: 'Logs', type: 'table', evidenceId: 'original' }],
        evidence: [evidence],
        evidenceGroups: [{ id: 'finding', references: [{ artifactId: 'original' }] }],
        knowledge: [],
    });
    return {
        id: 'draft',
        userId: 'user',
        documentId: 'report',
        baseRevision: 1,
        revision: 1,
        expectedReportRevision: 1,
        state: withReportCanvas(state),
        results: { new: { sourceArtifactId: '', evidence: { ...evidence, artifactId: 'new' } } },
    };
}
test('duplicate prose has stable distinct identities across moves, autosave and refresh', () => {
    const draft = fixture();
    const duplicates = draft.state.canvas!.blocks.filter(block => block.source === 'Duplicate.');
    assert.equal(duplicates.length, 2);
    assert.notEqual(duplicates[0].id, duplicates[1].id);
    const moved = changeReportDraft(draft, { type: 'move', blockId: duplicates[1].id, anchorId: 'logs', position: 'after' });
    const restored = withReportCanvas(JSON.parse(JSON.stringify(moved)));
    assert.equal(restored.canvas.blocks.at(-2)?.id, duplicates[1].id);
    assert.equal(restored.canvas.blocks[1].id, duplicates[0].id);
    assert.equal(reportDraftChanges(restored).length, 1);
    const undo = changeReportDraft({ ...draft, state: moved }, { type: 'undo' });
    assert.deepEqual(undo.content, draft.state.content);
    assert.deepEqual(reportDraftChanges(undo), []);
});
test('insertion does not mark surviving blocks as moved and move-back clears changes', () => {
    const draft = fixture();
    const next = changeReportDraft(draft, {
        type: 'insert',
        resultId: 'new',
        visual: { id: 'extra', type: 'table', title: 'Extra' },
        anchorId: draft.state.canvas!.blocks[1].id,
        position: 'before',
    });
    assert.deepEqual(
        reportDraftChanges(next).map(item => item.type),
        ['insert'],
    );
    const moved = changeReportDraft(draft, { type: 'move', blockId: 'logs', anchorId: draft.state.canvas!.blocks[0].id, position: 'before' });
    const back = changeReportDraft({ ...draft, state: moved }, { type: 'move', blockId: 'logs', anchorId: draft.state.canvas!.blocks.at(-1)!.id, position: 'before' });
    assert.deepEqual(reportDraftChanges(back), []);
});
test('list findings move together, deletion detaches evidence and undo restores references', () => {
    const draft = fixture();
    const list = draft.state.canvas!.blocks.find(item => item.source.includes('Requests stayed flat'))!;
    const moved = changeReportDraft(draft, { type: 'move', blockId: list.id, anchorId: 'logs', position: 'after' });
    assert.equal(moved.content.evidenceGroups?.[0].id, 'finding');
    const removed = changeReportDraft({ ...draft, state: moved }, { type: 'remove', blockId: list.id });
    assert.deepEqual(removed.content.evidenceGroups, []);
    const undo = changeReportDraft({ ...draft, state: removed }, { type: 'undo' });
    assert.deepEqual(undo.content.evidenceGroups, moved.content.evidenceGroups);
    assert.equal(undo.canvas!.blocks.find(item => item.id === list.id)?.source, list.source);
});
test('delete an unsaved block then undo restores the same ID, config and position', () => {
    const draft = fixture();
    const inserted = changeReportDraft(draft, { type: 'insert', resultId: 'new', visual: { id: 'extra', type: 'table', title: 'Extra' }, anchorId: 'logs', position: 'before' });
    const removed = changeReportDraft({ ...draft, state: inserted }, { type: 'remove', blockId: 'extra' });
    assert.deepEqual(reportDraftChanges(removed), []);
    assert.ok(removed.canvas?.undo?.content.evidence.some(item => item.artifactId === 'new'));
    const undo = changeReportDraft({ ...draft, state: removed }, { type: 'undo' });
    assert.deepEqual(undo.content, inserted.content);
    assert.equal(
        undo.canvas!.blocks.findIndex(item => item.id === 'extra') + 1,
        undo.canvas!.blocks.findIndex(item => item.id === 'logs'),
    );
});
test('rename and revert preserve data; invalid targets leave the draft untouched', () => {
    const draft = fixture();
    const renamed = changeReportDraft(draft, { type: 'rename', blockId: 'logs', title: 'New title' });
    assert.equal(reportDraftChanges(renamed)[0].type, 'rename');
    assert.equal(renamed.content.visuals[0].evidenceId, 'original');
    const reverted = changeReportDraft({ ...draft, state: renamed }, { type: 'revert', blockId: 'logs' });
    assert.deepEqual(reportDraftChanges(reverted), []);
    assert.throws(() => changeReportDraft(draft, { type: 'move', blockId: 'logs', anchorId: 'deleted', position: 'after' }), /target changed/);
    assert.equal(draft.state.content.visuals[0].title, 'Logs');
});
test('freezing rejects config changes but accepts reordered JSON keys from PostgreSQL and schema parsing', () => {
    const spec = workspaceChartSpecSchema.parse({
        version: 1,
        chartType: 'bar',
        xKey: 'level',
        yKey: 'sum:count',
        groupKey: '__none__',
        filters: [{ col: 'level', op: 'equals', kind: 'string', value: 'info' }],
    });
    const reorder = (value: unknown): unknown =>
        Array.isArray(value)
            ? value.map(reorder)
            : value && typeof value === 'object'
              ? Object.fromEntries(
                    Object.entries(value)
                        .reverse()
                        .map(([key, item]) => [key, reorder(item)]),
                )
              : value;
    assert.ok(sameChartSpec(workspaceChartSpecSchema.parse(reorder(spec)), reorder(spec) as typeof spec));
    assert.ok(!sameChartSpec(spec, { ...spec, chartType: 'line' }));
    assert.ok(!sameChartSpec(spec, undefined));
});
