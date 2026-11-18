import assert from 'node:assert/strict';
import test from 'node:test';
import { BlockNoteEditor, BlockNoteSchema, createBlockSpec } from '@blocknote/core';

import { reportSourceBlockConfig, reportStyleSpecs, reportTextBlockSpecs, reportVisualBlockConfig } from '../../lib/work-documents/report-block-schema';
import { reportBlocksFromMdx, reportBlocksToMdx } from '../../lib/work-documents/report-blocks';

const headlessRenderer = {
    render: () => {
        throw new Error('Headless tests must not render DOM nodes');
    },
};
const schema = BlockNoteSchema.create({
    blockSpecs: {
        ...reportTextBlockSpecs,
        reportVisual: createBlockSpec(reportVisualBlockConfig, headlessRenderer)(),
        reportSource: createBlockSpec(reportSourceBlockConfig, headlessRenderer)(),
    },
    styleSpecs: reportStyleSpecs,
});

for (const body of [
    '**`字段名`**',
    '*`italic code`* and ~~`struck code`~~',
    '[**`linked code`**](https://example.com)',
    '### Analysis\n\n- **`first`**\n  - *`nested`*\n\n> **`quote`**',
    '| Field | Value |\n| --- | --- |\n| **`revenue`** | *`value`* |',
    '```mdx\n**`literal`**\n<Chart source="example" />\n```',
]) {
    test(`BlockNote initializes and preserves combined code formatting: ${body.split('\n')[0]}`, () => {
        const projection = reportBlocksFromMdx(body, []);
        const editor = BlockNoteEditor.create({ schema, initialContent: projection.blocks });
        try {
            assert.equal(reportBlocksToMdx(editor.document, projection, []), body);
            editor.updateBlock(editor.document[0], { type: 'paragraph', content: [{ type: 'text', text: 'Changed code', styles: { bold: true, code: true } }] });
            assert.match(reportBlocksToMdx(editor.document, projection, []), /\*\*`Changed code`\*\*/);
        } finally {
            editor._tiptapEditor.destroy();
        }
    });
}
