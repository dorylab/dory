import type { WorkDocumentView } from '@dory/shared/types/work-document';

import { escapeHtml, formatWorkValue, renderWorkMarkdown, workPrintStyles } from './render';

/** Explicit presentation projection: never serialize the source document or evidence. */
export function renderSharedReport(document: WorkDocumentView) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title><style>${workPrintStyles}</style></head><body><h1>${escapeHtml(document.title)}</h1>${renderWorkMarkdown(document.content, false)}</body></html>`;
}

export function shareCsv(columns: string[], rows: Record<string, unknown>[]) {
    const cell = (value: unknown) => {
        let text = formatWorkValue(value);
        // Spreadsheet applications must treat user data as text, not formulas.
        if (/^[\s]*[=+@-]/.test(text) && typeof value !== 'number') text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };
    return '\uFEFF' + [columns.map(cell).join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\r\n');
}

export function shareFilename(title: string, extension: string, preview = false) {
    return `${title.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '-').slice(0, 100) || 'work'}${preview ? '-preview' : ''}.${extension}`;
}

export function downloadShare(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
