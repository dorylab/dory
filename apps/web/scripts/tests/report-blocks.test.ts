import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkVisual } from '@dory/shared/types/work-document';

import { reportBlockContentKey, reportBlocksFromMdx, reportBlocksToMdx } from '@/lib/work-documents/report-blocks';
import { parseReport } from '@/lib/work-documents/report-core';

const visuals: WorkVisual[] = [
    { id: 'metric', type: 'metric', title: 'Count', evidenceId: 'e', metric: { column: 'value', rowIndex: 0 } },
    { id: 'chart', type: 'chart', title: 'Trend', evidenceId: 'e', chart: { type: 'line', xKey: 'date', yKey: 'value' } },
    { id: 'table', type: 'table', title: 'Rows', evidenceId: 'e' },
];
const source =
    '\n# Report\n\nA **bold**, *italic*, ~~deleted~~ and `code` paragraph.\n\n- Parent\n  - Child\n\n1. One\n2. Two\n\n> Quote\n\n---\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n\n```mdx\n<Chart source="example" />\n{literal}\n```\n\n[Evidence](dory://evidence/e) [Evidence](dory://evidence-group/group)\n\n[Reference][ref]\n\n[ref]: https://example.com "Example"\n\n<Metric source="metric" />\n\n<Chart source="chart" />\n\n<DataTable source="table" />\n';

test('BlockNote projection round trips restricted MDX byte for byte', () => {
    const doc = reportBlocksFromMdx(source, visuals);
    assert.equal(reportBlocksToMdx(doc.blocks, doc, visuals), source);
    assert.equal(doc.blocks.filter(block => block.type === 'reportVisual').length, 3);
    assert.equal(doc.blocks.filter(block => block.type === 'reportSource').length, 1);
    for (const body of ['', '\n\n', '# Heading\nParagraph\n> Quote', '# Heading', 'Paragraph\n', '<Metric source="metric" />']) {
        const projection = reportBlocksFromMdx(body, visuals);
        assert.equal(reportBlocksToMdx(projection.blocks, projection, visuals), body);
    }
});
test('editing prose escapes MDX literals and preserves unmodified source and evidence groups', () => {
    const doc = reportBlocksFromMdx(source, visuals);
    const heading = doc.blocks[0];
    if (heading.type !== 'heading') throw new Error('Expected heading');
    heading.content = 'Changed {literal} <tag>';
    const result = reportBlocksToMdx(doc.blocks, doc, visuals);
    assert.equal(parseReport(result, visuals).diagnostics.length, 0);
    assert.ok(result.endsWith(source.slice(source.indexOf('\n\nA **bold**'))));
    assert.ok(result.includes('dory://evidence-group/group'));
});
test('moving, deleting and undoing components retains their IDs and configuration', () => {
    const original = structuredClone(visuals);
    const doc = reportBlocksFromMdx(source, visuals);
    const blocks = structuredClone(doc.blocks);
    const table = blocks.pop()!;
    blocks.unshift(table);
    const filtered = blocks.filter(block => block.type !== 'reportVisual' || block.props?.visualId !== 'metric');
    const result = reportBlocksToMdx(filtered, doc, visuals);
    assert.ok(result.trimStart().startsWith('<DataTable source="table" />'));
    assert.ok(!result.includes('<Metric'));
    assert.equal(parseReport(result, visuals).components.length, 2);
    assert.equal(reportBlocksToMdx(doc.blocks, doc, visuals), source);
    assert.deepEqual(visuals, original);
});
test('unsupported syntax stays opaque and invalid MDX never enters the editor', () => {
    for (const body of ['| Name | Value |\n| :--- | ---: |\n| A | 1 |', '> First\n>\n> Second', '```js title="example"\nconst x = 1\n```']) {
        const doc = reportBlocksFromMdx(body, []);
        assert.equal(doc.blocks[0].type, 'reportSource');
        assert.equal(reportBlocksToMdx(doc.blocks, doc, []), body);
    }
    for (const invalid of ['{expression}', '<Chart source="unknown" />', 'import X from "x"']) assert.throws(() => reportBlocksFromMdx(invalid, visuals));
});
test('schema defaults do not cause source edits', () => {
    const doc = reportBlocksFromMdx(source, visuals);
    const normalized = structuredClone(doc.blocks);
    for (const block of normalized) {
        block.children ??= [];
        if (block.type === 'paragraph' || block.type === 'heading') block.props = { ...block.props, textAlignment: 'left', textColor: 'default', backgroundColor: 'default' };
        if (block.type === 'codeBlock' && typeof block.content === 'string') block.content = [{ type: 'text', text: block.content, styles: {} }];
        if (block.type === 'table' && block.content) {
            block.content.columnWidths = [undefined, undefined];
            block.content.rows = block.content.rows.map(row => ({
                cells: row.cells.map(cell => ({
                    type: 'tableCell' as const,
                    props: { textAlignment: 'left' as const, textColor: 'default', backgroundColor: 'default' },
                    content: typeof cell === 'string' || Array.isArray(cell) ? cell : cell.content,
                })),
            }));
        }
    }
    assert.equal(reportBlockContentKey(normalized), reportBlockContentKey(doc.blocks));
    assert.equal(reportBlocksToMdx(normalized, doc, visuals), source);
});
test('reference-style links and definitions survive text edits', () => {
    const body = '[Original][ref]\n\n[ref]: https://example.com "Reference"';
    const doc = reportBlocksFromMdx(body, []);
    const block = doc.blocks[0];
    if (block.type !== 'paragraph' || !Array.isArray(block.content)) throw new Error('Expected editable paragraph');
    const link = block.content[0];
    if (typeof link === 'string' || link.type !== 'link') throw new Error('Expected link');
    link.content = 'Changed';
    const result = reportBlocksToMdx(doc.blocks, doc, []);
    assert.match(result, /\[Changed\]\[ref\]/);
    assert.ok(result.endsWith('[ref]: https://example.com "Reference"'));
});
test('edited nested lists, tables and code serialize without losing content', () => {
    const doc = reportBlocksFromMdx(source, visuals);
    const parent = doc.blocks.find(block => block.type === 'bulletListItem')!;
    parent.children![0] = { id: parent.children![0].id, type: 'bulletListItem', content: 'Changed child' };
    const table = doc.blocks.find(block => block.type === 'table');
    if (table?.type !== 'table' || !table.content) throw new Error('Expected table');
    table.content.rows[1].cells[1] = '42';
    const code = doc.blocks.find(block => block.type === 'codeBlock');
    if (code?.type !== 'codeBlock') throw new Error('Expected code');
    code.content = '<Metric source="literal" />\n{example}';
    const result = reportBlocksToMdx(doc.blocks, doc, visuals);
    assert.equal(parseReport(result, visuals).diagnostics.length, 0);
    assert.match(result, /Changed child/);
    assert.match(result, /42/);
    assert.match(result, /<Metric source="literal" \/>/);
    assert.equal(parseReport(result, visuals).components.length, 3);
});
test('nested legacy visuals and ambiguous link titles remain source blocks', () => {
    for (const body of [
        '- Before\n- ![Count](dory://visual/metric)\n- After',
        '> ![Count](dory://visual/metric)\n>\n> Following prose',
        '[First](https://example.com "First title") and [Second](https://example.com "Second title")',
    ]) {
        const doc = reportBlocksFromMdx(body, visuals);
        assert.equal(doc.blocks[0].type, 'reportSource');
        doc.blocks.push({ type: 'paragraph', content: 'New prose' });
        assert.ok(reportBlocksToMdx(doc.blocks, doc, visuals).startsWith(body));
    }
});
test('removing a referenced definition cannot silently turn links into plain text', () => {
    const body = '[Evidence][ref]\n\n[ref]: dory://evidence/e';
    const doc = reportBlocksFromMdx(body, []);
    assert.throws(() => reportBlocksToMdx(doc.blocks.slice(0, 1), doc, []), /Restore the link definition/);
    assert.equal(reportBlocksToMdx(doc.blocks, doc, []), body);
    assert.doesNotThrow(() => reportBlocksToMdx([{ type: 'paragraph', content: 'No links' }], doc, []));
});
test('soft wraps stay spaces while explicit line breaks remain breaks after an edit', () => {
    const body = 'Soft\nwrap and a hard\\\nbreak';
    const doc = reportBlocksFromMdx(body, []);
    assert.equal(reportBlocksToMdx(doc.blocks, doc, []), body);
    const block = doc.blocks[0];
    if (block.type !== 'paragraph' || !Array.isArray(block.content)) throw new Error('Expected paragraph');
    block.content.push({ type: 'text', text: ' changed', styles: {} });
    const result = reportBlocksToMdx(doc.blocks, doc, []);
    assert.match(result, /Soft wrap/);
    assert.match(result, /hard\\\nbreak changed/);
});
