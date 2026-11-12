import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import type { WorkVisual } from '@dory/shared/types/work-document';

import { markdownSemantics, hasUnsupportedMarkdown } from './markdown';
import { legacyToMdx, parseReport } from './report-core';

// This is an editing projection only. MDX remains the persisted source of truth.
export const reportProseExtensions = (document = false) => [
    StarterKit.configure({
        document: document ? undefined : false,
        underline: false,
        trailingNode: false,
        link: { openOnClick: false, protocols: ['dory'], autolink: false, linkOnPaste: false },
    }),
    TableKit,
];
export const createReportMarkdown = () => new MarkdownManager({ extensions: reportProseExtensions(true) });
export type ReportMode = 'view' | 'blocks' | 'source';

export function reportBlockContentKey(content: JSONContent[] = []): string {
    // Schema defaults (e.g. link target and table spans) are not source edits.
    const normalize = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(normalize);
        if (!value || typeof value !== 'object') return value;
        const entries = Object.entries(value)
            .filter(([key]) => key !== 'attrs')
            .map(([key, child]) => [key, key === 'marks' && Array.isArray(child) ? child.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : normalize(child)] as const);
        if ('attrs' in value && value.attrs && typeof value.attrs === 'object') {
            const attrs = Object.entries(value.attrs)
                .filter(([key, attr]) => ['level', 'start', 'language', 'href', 'title', 'textAlign'].includes(key) && attr != null && attr !== '')
                .sort(([a], [b]) => a.localeCompare(b));
            if (attrs.length) entries.push(['attrs', Object.fromEntries(attrs)]);
        }
        return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
    };
    return JSON.stringify(normalize(content));
}

export function reportBlocksFromMdx(body: string, visuals: WorkVisual[], markdown = createReportMarkdown()): JSONContent {
    const parsed = parseReport(body, visuals);
    if (parsed.diagnostics.length || !parsed.tree) throw new Error(parsed.diagnostics.map(item => item.message).join('\n'));
    const children = parsed.tree.children;
    const definitions = children.filter(node => node.type === 'definition').map(node => body.slice(node.position!.start.offset, node.position!.end.offset)).join('\n');
    const blocks = children.map((node, index): JSONContent => {
        const start = node.position!.start.offset!;
        const end = node.position!.end.offset!;
        const source = body.slice(start, end);
        const component = parsed.components.find(item => item.start >= start && item.end <= end);
        const attrs = {
            id: `block_${index}`,
            nextId: index + 1 < children.length ? `block_${index + 1}` : null,
            source,
            gap: body.slice(end, children[index + 1]?.position?.start.offset ?? body.length),
            original: '',
            visualId: component?.visualId ?? null,
        };
        if (component) return { type: 'reportAtom', attrs };
        // A failed round trip stays as an opaque source-preserving block.
        try {
            const input = definitions ? `${source}\n\n${definitions}` : source;
            const doc = markdown.parse(input);
            if (node.type !== 'definition' && !hasUnsupportedMarkdown(source) && doc.content?.length && markdownSemantics(input) === markdownSemantics(`${markdown.serialize(doc)}\n\n${definitions}`)) {
                return { type: 'reportBlock', attrs: { ...attrs, original: reportBlockContentKey(doc.content) }, content: doc.content };
            }
        } catch {
            // Never let a rich-text parser erase valid restricted MDX.
        }
        return { type: 'reportAtom', attrs };
    });
    if (!blocks.length)
        blocks.push({
            type: 'reportBlock',
            attrs: { id: 'empty', source: '', original: reportBlockContentKey([{ type: 'paragraph' }]), gap: '' },
            content: [{ type: 'paragraph' }],
        });
    return { type: 'doc', attrs: { prefix: body.slice(0, children[0]?.position?.start.offset ?? body.length) }, content: blocks };
}

export function reportBlocksToMdx(doc: JSONContent, visuals: WorkVisual[], markdown = createReportMarkdown()): string {
    const blocks = doc.content ?? [];
    const body =
        String(doc.attrs?.prefix ?? '') +
        blocks
            .map((block, index) => {
                const attrs = block.attrs ?? {};
                const unchanged = block.type === 'reportAtom' || attrs.original === reportBlockContentKey(block.content);
                const source = unchanged ? String(attrs.source ?? '') : legacyToMdx(markdown.serialize({ type: 'doc', content: block.content }), []).trimEnd();
                const gap = String(attrs.gap ?? '');
                const originalNeighbor = attrs.nextId && attrs.nextId === blocks[index + 1]?.attrs?.id;
                return source + (index < blocks.length - 1 && !originalNeighbor && !/\n\s*\n/.test(gap) ? '\n\n' : gap);
            })
            .join('');
    const diagnostics = parseReport(body, visuals).diagnostics;
    if (diagnostics.length) throw new Error(diagnostics.map(item => item.message).join('\n'));
    return body;
}
