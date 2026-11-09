import assert from 'node:assert/strict';
import test from 'node:test';
import { chatToolFailure, readChatToolFailure } from '@dory/shared/types/chat-tool-error';
import type { WorkDocumentContent } from '@dory/shared/types/work-document';
import { chartGrainDiagnostic } from '@dory/shared/utils/chat-chart';

import { applyReportTextPatch } from '@/lib/work-documents/report-patch';
import { workPatchSchema } from '@/lib/work-documents/schema';

test('serialized tool failures remain structured through SDK, history and nested error boundaries', () => {
    const failure = chatToolFailure('Repeated X values in "year". Columns varying: metric, value.', 'chartBuilder');
    assert.equal(failure.code, 'INVALID_FIELDS');
    assert.match(failure.recovery, /NEW artifactId/);
    for (const value of [failure, JSON.stringify(failure), new Error(JSON.stringify(failure)), { message: JSON.stringify(failure) }]) {
        assert.deepEqual(readChatToolFailure(value), failure);
        assert.deepEqual(chatToolFailure(value, 'chartBuilder'), failure);
    }
    assert.equal(readChatToolFailure('{broken'), null);
    assert.equal(chatToolFailure('Edit anchor must match exactly once.', 'updateWorkReport').code, 'REPORT_CONFLICT');
    assert.equal(chatToolFailure('Edit anchor must match exactly once. Edit 1: anchor not found.', 'updateWorkReport').code, 'REPORT_CONFLICT');
    assert.equal(chatToolFailure('Repeated X values; varying columns: revision.', 'chartBuilder').code, 'INVALID_FIELDS');
    assert.equal(chatToolFailure('Access denied: private document', 'updateWorkReport').message, 'The requested resource is unavailable or access is denied.');
});

test('grain diagnostics identify varying fields without aggregating or exposing rows', () => {
    const rows = [
        { year: 2025, metric: 'revenue', value: 42 },
        { year: 2025, metric: 'profit', value: 3 },
    ];
    const copy = structuredClone(rows);
    const hint = chartGrainDiagnostic(rows, 'year');
    assert.match(hint!, /"year".*1 repeated groups/);
    assert.match(hint!, /"metric","value"/);
    assert.deepEqual(rows, copy);
    assert.equal(chartGrainDiagnostic([{ year: 2024 }, { year: 2025 }], 'year'), null);
});

test('append prose preserves the current body and does not require a fabricated anchor', () => {
    const content: WorkDocumentContent = {
        format: 'restricted-mdx',
        body: '## Findings\n\nHuman edit.',
        markdown: '## Findings\n\nHuman edit.',
        visuals: [],
        evidence: [],
        knowledge: [],
    };
    const patch = workPatchSchema.parse({ edits: [], appendText: '## Outlook\n\nNew analysis.', status: 'ready' });
    assert.deepEqual(applyReportTextPatch(content, patch), { format: 'restricted-mdx', markdown: `${content.body}\n\n${patch.appendText}` });
    assert.equal(content.body, '## Findings\n\nHuman edit.');
    assert.equal(applyReportTextPatch({ ...content, body: '', markdown: '' }, patch).markdown, patch.appendText);
});

test('exact replacements still reject missing and repeated anchors atomically', () => {
    const content: WorkDocumentContent = { markdown: 'Repeat\nRepeat\nUnique', visuals: [], evidence: [], knowledge: [] };
    for (const oldText of ['missing', 'Repeat', '']) {
        assert.throws(
            () =>
                applyReportTextPatch(content, {
                    edits: [
                        { oldText: 'Unique', newText: 'Changed' },
                        { oldText, newText: 'Unsafe' },
                    ],
                    status: 'draft',
                }),
            /anchor/,
        );
        assert.equal(content.markdown, 'Repeat\nRepeat\nUnique');
    }
});

test('MDX and legacy visual edits use the matching stored representation', () => {
    const content: WorkDocumentContent = {
        format: 'restricted-mdx',
        body: 'Human note.\n\n<Chart source="trend" />',
        markdown: 'Human note.\n\n![Trend](dory://visual/trend)',
        visuals: [],
        evidence: [],
        knowledge: [],
    };
    const mdx = applyReportTextPatch(content, { edits: [{ oldText: '<Chart source="trend" />', newText: 'Updated.' }], status: 'draft' });
    assert.equal(mdx.format, 'restricted-mdx');
    const legacy = applyReportTextPatch(content, { edits: [{ oldText: '![Trend](dory://visual/trend)', newText: 'Updated.' }], status: 'draft' });
    assert.equal(legacy.format, undefined);
    assert.equal(legacy.markdown, mdx.markdown);
    assert.throws(() => applyReportTextPatch(content, { format: 'restricted-mdx', edits: [{ oldText: content.markdown, newText: 'Overwrite' }], status: 'draft' }), /anchor/);
});
