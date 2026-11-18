import { createHeadingBlockSpec, defaultBlockSpecs, defaultStyleSpecs } from '@blocknote/core';

export const reportVisualBlockConfig = { type: 'reportVisual', propSchema: { visualId: { default: '' } }, content: 'none' } as const;
export const reportSourceBlockConfig = { type: 'reportSource', propSchema: { source: { default: '' } }, content: 'none' } as const;

const { paragraph, bulletListItem, numberedListItem, quote, codeBlock, divider, table } = defaultBlockSpecs;
export const reportTextBlockSpecs = {
    paragraph,
    heading: createHeadingBlockSpec({ levels: [1, 2, 3, 4, 5, 6], allowToggleHeadings: false }),
    bulletListItem,
    numberedListItem,
    quote,
    codeBlock,
    divider,
    table,
};

const { bold, italic, strike, code } = defaultStyleSpecs;
const reportCodeStyle: typeof code = {
    ...code,
    implementation: {
        ...code.implementation,
        // Restricted MDX allows **`code`**, *`code`* and linked code. The
        // native code mark excludes these marks and rejects initialContent.
        mark: code.implementation.mark.extend({ excludes: '' }),
    },
};
export const reportStyleSpecs = { bold, italic, strike, code: reportCodeStyle };
