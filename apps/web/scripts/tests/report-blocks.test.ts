import assert from 'node:assert/strict';
import test from 'node:test';
import { getSchema } from '@tiptap/core';
import { Node } from '@tiptap/core';
import type { WorkVisual } from '@dory/shared/types/work-document';

import { createReportMarkdown, reportBlocksFromMdx, reportBlocksToMdx, reportProseExtensions } from '@/lib/work-documents/report-blocks';
import { parseReport } from '@/lib/work-documents/report-core';

const visuals: WorkVisual[] = [
    { id: 'metric', type: 'metric', title: 'Count', evidenceId: 'e', metric: { column: 'value', rowIndex: 0 } },
    { id: 'chart', type: 'chart', title: 'Trend', evidenceId: 'e', chart: { type: 'line', xKey: 'date', yKey: 'value' } },
    { id: 'table', type: 'table', title: 'Rows', evidenceId: 'e' },
];
const md = createReportMarkdown();
const source =
    '\n# Report\n\nA **bold**, *italic*, ~~deleted~~ and `code` paragraph.\n\n- Parent\n  - Child\n\n1. One\n2. Two\n\n> Quote\n\n---\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n\n```mdx\n<Chart source="example" />\n{literal}\n```\n\n[Evidence](dory://evidence/e) [Evidence](dory://evidence-group/group)\n\n[Reference][ref]\n\n[ref]: https://example.com "Example"\n\n<Metric source="metric" />\n\n<Chart source="chart" />\n\n<DataTable source="table" />\n';

test('block projection round trips restricted MDX byte for byte, including opaque references', () => {
    const blocks = reportBlocksFromMdx(source, visuals, md);
    assert.equal(reportBlocksToMdx(blocks, visuals, md), source);
    assert.equal(blocks.content?.filter(block => block.attrs?.visualId).length, 3);
    assert.ok((blocks.content?.filter(block => block.type === 'reportBlock').length ?? 0) >= 8);
    for (const body of ['', '\n\n', '# Heading\nParagraph\n> Quote', '# Heading', 'Paragraph\n', '<Metric source="metric" />'])
        assert.equal(reportBlocksToMdx(reportBlocksFromMdx(body, visuals, md), visuals, md), body);
});

test('a prose edit escapes MDX literals and preserves every other block and evidence marker', () => {
    const doc = reportBlocksFromMdx(source, visuals, md);
    const first = doc.content![0];
    first.content![0].content = [{ type: 'text', text: 'Changed {literal} <tag>' }];
    const output = reportBlocksToMdx(doc, visuals, md);
    assert.equal(parseReport(output, visuals).diagnostics.length, 0);
    assert.ok(output.endsWith(source.slice(source.indexOf('\n\nA **bold**'))));
    assert.ok(output.includes('dory://evidence-group/group'));
});

test('moving and deleting atomic blocks preserves source bindings and does not change visual configuration', () => {
    const original = structuredClone(visuals);
    const doc = reportBlocksFromMdx(source, visuals, md);
    const table = doc.content!.pop()!;
    doc.content!.unshift(table);
    doc.content = doc.content!.filter(block => block.attrs?.visualId !== 'metric');
    const output = reportBlocksToMdx(doc, visuals, md);
    assert.ok(output.trimStart().startsWith('<DataTable source="table" />'));
    assert.ok(!output.includes('<Metric'));
    assert.equal(parseReport(output, visuals).components.length, 2);
    assert.deepEqual(visuals, original);
});

test('valid unsupported syntax remains opaque and invalid MDX never enters the block projection', () => {
    const aligned = '| Name | Value |\n| :--- | ---: |\n| A | 1 |';
    const doc = reportBlocksFromMdx(aligned, [], md);
    assert.equal(doc.content![0].type, 'reportAtom');
    assert.equal(reportBlocksToMdx(doc, [], md), aligned);
    for (const invalid of ['{expression}', '<Chart source="unknown" />', 'import X from "x"']) assert.throws(() => reportBlocksFromMdx(invalid, visuals, md));
});

test('Tiptap schema defaults do not turn opening an editor into a source edit', () => {
    const attrs = { id: { default: null }, nextId: { default: null }, source: { default: '' }, gap: { default: '' }, original: { default: '' }, visualId: { default: null } };
    const schema = getSchema([
        Node.create({ name: 'doc', topNode: true, content: 'reportBlockNode+', addAttributes: () => ({ prefix: { default: '' } }) }),
        ...reportProseExtensions(),
        Node.create({ name: 'reportBlock', group: 'reportBlockNode', content: 'block+', addAttributes: () => attrs }),
        Node.create({ name: 'reportAtom', group: 'reportBlockNode', atom: true, addAttributes: () => attrs }),
    ]);
    const node = schema.nodeFromJSON(reportBlocksFromMdx(source, visuals, md));
    node.check();
    const doc = node.toJSON();
    assert.equal(reportBlocksToMdx(doc, visuals, md), source);
});

test('reference links resolve against document definitions and keep their binding after text edits', () => {
    const body = '[Original][ref]\n\n[ref]: https://example.com "Reference"';
    const doc = reportBlocksFromMdx(body, [], md);
    const block = doc.content![0];
    assert.equal(block.type, 'reportBlock');
    const link = block.content![0].content![0];
    assert.equal(link.marks?.[0].attrs?.href, 'https://example.com');
    link.text = 'Changed';
    const result = reportBlocksToMdx(doc, [], md);
    assert.match(result, /https:\/\/example.com/);
    assert.match(result, /\[Changed\]/);
    assert.ok(result.endsWith('[ref]: https://example.com "Reference"'));
});
