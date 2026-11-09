import type { WorkDocumentContent } from '@dory/shared/types/work-document';
import type { z } from 'zod';

import { legacyToMdx } from './report-core';
import { applyMarkdownEdits, workPatchSchema } from './schema';

/** Select a stored representation, never fuzzy-match or replace the whole report. */
export function applyReportTextPatch(content: WorkDocumentContent, patch: z.infer<typeof workPatchSchema>) {
    const edits = patch.edits;
    const hasLegacyLinks = edits.some(edit => /dory:\/\/visual\//.test(edit.oldText + edit.newText)) || /dory:\/\/visual\//.test(patch.appendText ?? '');
    const writesMdx = edits.some(edit => /<(?:Chart|DataTable|Metric)\s+source=/.test(edit.newText)) || /<(?:Chart|DataTable|Metric)\s+source=/.test(patch.appendText ?? '');
    let format = patch.format ?? (hasLegacyLinks ? undefined : content.format);
    if (!format && writesMdx) format = 'restricted-mdx';
    const body = content.body ?? legacyToMdx(content.markdown, content.visuals);
    let markdown: string;
    try {
        markdown = applyMarkdownEdits(format ? body : content.markdown, edits);
    } catch (error) {
        // Older clients read content.markdown even for MDX reports. Accept that
        // exact representation only when format was omitted and all anchors
        // match uniquely. The caller still enforces revision and ownership.
        if (patch.format || !content.format || !format || writesMdx || edits.some(edit => !edit.oldText)) throw error;
        try {
            markdown = applyMarkdownEdits(content.markdown, edits);
            format = undefined;
        } catch {
            throw error;
        }
    }
    if (patch.appendText?.trim()) markdown += `${markdown ? '\n\n' : ''}${patch.appendText}`;
    return { markdown, format };
}
