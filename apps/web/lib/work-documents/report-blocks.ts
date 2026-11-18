import type { BlockConfig, DefaultBlockSchema, DefaultInlineContentSchema, DefaultStyleSchema, PartialBlock, PartialInlineContent, PartialTableCell } from '@blocknote/core';
import type { WorkVisual } from '@dory/shared/types/work-document';
import type { Definition, PhrasingContent, RootContent, Root, Nodes } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

import { parseReport, reportTagSource } from './report-core';

export type ReportMode = 'view' | 'blocks' | 'source';
export type ReportStyleSchema = Pick<DefaultStyleSchema, 'bold' | 'italic' | 'strike' | 'code'>;
export type ReportBlockSchema = Pick<DefaultBlockSchema, 'paragraph' | 'heading' | 'bulletListItem' | 'numberedListItem' | 'quote' | 'codeBlock' | 'divider' | 'table'> & {
    reportVisual: BlockConfig<'reportVisual', { visualId: { default: '' } }, 'none'>;
    reportSource: BlockConfig<'reportSource', { source: { default: '' } }, 'none'>;
};
export type ReportBlock = PartialBlock<ReportBlockSchema, DefaultInlineContentSchema, ReportStyleSchema>;
type Inline = PartialInlineContent<DefaultInlineContentSchema, ReportStyleSchema>;
type Styles = Partial<Record<keyof ReportStyleSchema, boolean>>;
type SourceFragment = { ids: string[]; original: string; source: string; gap: string; nextId?: string };
export type ReportProjection = { blocks: ReportBlock[]; fragments: SourceFragment[]; prefix: string; definitions: Definition[]; linkTitles: Record<string, string> };
const serializer = unified().use(remarkGfm).use(remarkMdx).use(remarkStringify);
const unsupported = () => {
    throw new Error('Source-only syntax');
};
const withId = (block: ReportBlock): ReportBlock => ({ ...block, id: crypto.randomUUID() });

function inlineFromAst(nodes: PhrasingContent[], definitions: Definition[], styles: Styles = {}): Inline {
    return nodes.flatMap(node => {
        if (node.type === 'text') return [{ type: 'text' as const, text: node.value.replace(/\r?\n/g, ' '), styles }];
        if (node.type === 'break') return [{ type: 'text' as const, text: '\n', styles }];
        if (node.type === 'inlineCode') return [{ type: 'text' as const, text: node.value, styles: { ...styles, code: true } }];
        if (node.type === 'strong' || node.type === 'emphasis' || node.type === 'delete') {
            return inlineFromAst(node.children, definitions, { ...styles, [node.type === 'strong' ? 'bold' : node.type === 'emphasis' ? 'italic' : 'strike']: true }) as Exclude<
                Inline,
                string
            >;
        }
        if (node.type === 'link' || node.type === 'linkReference') {
            const definition = node.type === 'linkReference' ? definitions.find(item => item.identifier === node.identifier) : node;
            if (!definition) return unsupported();
            const content = inlineFromAst(node.children, definitions, styles);
            if (typeof content === 'string' || content.some(item => typeof item === 'string' || item.type !== 'text')) return unsupported();
            return [{ type: 'link' as const, href: definition.url, content: content.filter(item => typeof item !== 'string' && item.type === 'text') }];
        }
        return unsupported();
    });
}
function blocksFromAst(node: RootContent, definitions: Definition[]): ReportBlock[] {
    if (node.type === 'paragraph') return [withId({ type: 'paragraph', content: inlineFromAst(node.children, definitions) })];
    if (node.type === 'heading') return [withId({ type: 'heading', props: { level: node.depth }, content: inlineFromAst(node.children, definitions) })];
    if (node.type === 'thematicBreak') return [withId({ type: 'divider' })];
    if (node.type === 'code') {
        if (node.meta) return unsupported();
        return [withId({ type: 'codeBlock', props: { language: node.lang ?? '' }, content: node.value })];
    }
    if (node.type === 'list')
        return node.children.map((item, index) => {
            if (item.checked != null || item.children[0]?.type !== 'paragraph') return unsupported();
            const content = inlineFromAst(item.children[0].children, definitions);
            const children = item.children.slice(1).flatMap(child => blocksFromAst(child, definitions));
            return withId(
                node.ordered ? { type: 'numberedListItem', props: { start: (node.start ?? 1) + index }, content, children } : { type: 'bulletListItem', content, children },
            );
        });
    if (node.type === 'blockquote') {
        if (node.children.length !== 1 || node.children[0].type !== 'paragraph') return unsupported();
        return [withId({ type: 'quote', content: inlineFromAst(node.children[0].children, definitions) })];
    }
    if (node.type === 'table') {
        if (node.align?.some(Boolean)) return unsupported();
        return [
            withId({
                type: 'table',
                content: { type: 'tableContent', headerRows: 1, rows: node.children.map(row => ({ cells: row.children.map(cell => inlineFromAst(cell.children, definitions)) })) },
            }),
        ];
    }
    return unsupported();
}
function cellInline(cell: Inline | PartialTableCell<DefaultInlineContentSchema, ReportStyleSchema>): Inline | undefined {
    return typeof cell === 'string' || Array.isArray(cell) ? cell : cell.content;
}
function blockInline(block: ReportBlock): Inline | undefined {
    const content = block.content;
    return typeof content === 'string' || Array.isArray(content) ? content : undefined;
}
function headingDepth(level = 1): 1 | 2 | 3 | 4 | 5 | 6 {
    if (level === 2 || level === 3 || level === 4 || level === 5 || level === 6) return level;
    return 1;
}
function normalizedInline(content: Inline = ''): Exclude<Inline, string> {
    const items = typeof content === 'string' ? [{ type: 'text' as const, text: content, styles: {} }] : content;
    const normalized = items.flatMap((item): Exclude<Inline, string> => {
        if (typeof item === 'string') return item ? [{ type: 'text' as const, text: item, styles: {} }] : [];
        if (item.type === 'link') return [{ ...item, content: normalizedInline(item.content).filter(value => typeof value !== 'string' && value.type === 'text') }];
        if (!item.text) return [];
        return [
            {
                ...item,
                styles: Object.fromEntries(
                    Object.entries(item.styles)
                        .filter(([, value]) => value)
                        .sort(),
                ),
            },
        ];
    });
    const merged: Exclude<Inline, string> = [];
    for (const item of normalized) {
        const previous = merged.at(-1);
        if (
            typeof item !== 'string' &&
            item.type === 'text' &&
            previous &&
            typeof previous !== 'string' &&
            previous.type === 'text' &&
            JSON.stringify(previous.styles) === JSON.stringify(item.styles)
        )
            previous.text += item.text;
        else merged.push(item);
    }
    return merged;
}
export function reportBlockContentKey(blocks: ReportBlock[]): string {
    return JSON.stringify(
        blocks.map(block => {
            const props = Object.fromEntries(
                Object.entries(block.props ?? {})
                    .filter(([key, value]) => ['level', 'start', 'language', 'visualId', 'source'].includes(key) && value !== undefined && value !== '')
                    .sort(),
            );
            const content =
                block.type === 'table' && block.content
                    ? {
                          rows: block.content.rows.map(row => row.cells.map(cell => normalizedInline(cellInline(cell)))),
                      }
                    : block.type === 'reportSource' || block.type === 'reportVisual' || block.type === 'divider'
                      ? null
                      : normalizedInline(blockInline(block));
            return { type: block.type ?? 'paragraph', props, content, children: reportBlockContentKey(block.children ?? []) };
        }),
    );
}
export function reportBlocksFromMdx(body: string, visuals: WorkVisual[]): ReportProjection {
    const parsed = parseReport(body, visuals);
    if (parsed.diagnostics.length || !parsed.tree) throw new Error(parsed.diagnostics.map(item => item.message).join('\n'));
    const nodes = parsed.tree.children;
    const definitions = nodes.filter(node => node.type === 'definition');
    const projection: ReportProjection = { blocks: [], fragments: [], prefix: body.slice(0, nodes[0]?.position?.start.offset ?? body.length), definitions, linkTitles: {} };
    const titlesByUrl = new Map<string, Set<string>>();
    const titles = (node: Nodes) => {
        if (node.type === 'link' || node.type === 'definition') {
            const values = titlesByUrl.get(node.url) ?? new Set<string>();
            values.add(node.title ?? '');
            titlesByUrl.set(node.url, values);
            if (node.title) projection.linkTitles[node.url] = node.title;
        }
        if ('children' in node) node.children.forEach(titles);
    };
    nodes.forEach(titles);
    const checkLinks = (node: Nodes) => {
        const url = node.type === 'link' ? node.url : node.type === 'linkReference' ? definitions.find(item => item.identifier === node.identifier)?.url : undefined;
        // BlockNote links retain the destination, but cannot distinguish titles
        // attached to different occurrences of the same destination.
        if (url && (titlesByUrl.get(url)?.size ?? 0) > 1) unsupported();
        if ('children' in node) node.children.forEach(checkLinks);
    };
    for (const [index, node] of nodes.entries()) {
        const start = node.position!.start.offset!;
        const end = node.position!.end.offset!;
        const source = body.slice(start, end);
        const component = parsed.components.find(item => item.start >= start && item.end <= end);
        let blocks: ReportBlock[];
        try {
            checkLinks(node);
            // A legacy visual may occur in a list or quote. Keep that entire
            // source block opaque rather than replacing its surrounding prose.
            if (component && node.type !== 'paragraph' && node.type !== 'mdxJsxFlowElement') unsupported();
            blocks = component ? [withId({ type: 'reportVisual', props: { visualId: component.visualId } })] : blocksFromAst(node, definitions);
        } catch {
            blocks = [withId({ type: 'reportSource', props: { source } })];
        }
        projection.blocks.push(...blocks);
        projection.fragments.push({
            ids: blocks.map(block => block.id!),
            original: reportBlockContentKey(blocks),
            source,
            gap: body.slice(end, nodes[index + 1]?.position?.start.offset ?? body.length),
        });
    }
    if (!projection.blocks.length) {
        projection.blocks.push(withId({ type: 'paragraph', content: [] }));
        projection.fragments.push({ ids: [projection.blocks[0].id!], original: reportBlockContentKey(projection.blocks), source: '', gap: '' });
    }
    projection.fragments.forEach((fragment, index) => {
        fragment.nextId = projection.fragments[index + 1]?.ids[0];
    });
    return projection;
}
function inlineToAst(content: Inline | undefined, projection: ReportProjection): PhrasingContent[] {
    return normalizedInline(content).flatMap((item): PhrasingContent[] => {
        if (typeof item === 'string') return [{ type: 'text', value: item }];
        if (item.type === 'link') {
            const definition = projection.definitions.find(value => value.url === item.href);
            const children = inlineToAst(item.content, projection).filter(
                (node): node is Exclude<PhrasingContent, { type: 'link' | 'linkReference' }> => node.type !== 'link' && node.type !== 'linkReference',
            );
            return [
                definition
                    ? { type: 'linkReference', identifier: definition.identifier, label: definition.label, referenceType: 'full', children }
                    : { type: 'link', url: item.href, title: projection.linkTitles[item.href], children },
            ];
        }
        const values = item.styles.code ? [item.text] : item.text.split('\n');
        return values.flatMap((value, index): PhrasingContent[] => {
            let node: PhrasingContent = item.styles.code ? { type: 'inlineCode', value } : { type: 'text', value };
            for (const [style, type] of [
                ['bold', 'strong'],
                ['italic', 'emphasis'],
                ['strike', 'delete'],
            ] as const)
                if (item.styles[style]) node = { type, children: [node] };
            return index ? [{ type: 'break' }, node] : [node];
        });
    });
}
function blocksToAst(blocks: ReportBlock[], projection: ReportProjection): RootContent[] {
    const result: RootContent[] = [];
    for (const block of blocks) {
        const children = () => inlineToAst(blockInline(block), projection);
        if (block.type === 'reportVisual' || block.type === 'reportSource') return unsupported();
        if (block.type === 'bulletListItem' || block.type === 'numberedListItem') {
            const ordered = block.type === 'numberedListItem';
            const item = {
                type: 'listItem' as const,
                children: [{ type: 'paragraph' as const, children: children() }, ...blocksToAst(block.children ?? [], projection)] as import('mdast').ListItem['children'],
            };
            const previous = result.at(-1);
            if (previous?.type === 'list' && previous.ordered === ordered) previous.children.push(item);
            else result.push({ type: 'list', ordered, start: ordered ? (block.props?.start ?? 1) : undefined, children: [item] });
            continue;
        }
        if (block.type === 'heading') result.push({ type: 'heading', depth: headingDepth(block.props?.level), children: children() });
        else if (block.type === 'quote') result.push({ type: 'blockquote', children: [{ type: 'paragraph', children: children() }] });
        else if (block.type === 'divider') result.push({ type: 'thematicBreak' });
        else if (block.type === 'codeBlock')
            result.push({
                type: 'code',
                lang: block.props?.language || null,
                value: normalizedInline(blockInline(block))
                    .map(item => (typeof item === 'string' ? item : item.type === 'text' ? item.text : ''))
                    .join(''),
            });
        else if (block.type === 'table' && block.content)
            result.push({
                type: 'table',
                children: block.content.rows.map(row => ({
                    type: 'tableRow',
                    children: row.cells.map(cell => ({ type: 'tableCell', children: inlineToAst(cellInline(cell), projection) })),
                })),
            });
        else result.push({ type: 'paragraph', children: children() });
        // Markdown has no arbitrary indentation outside lists. Preserve child content
        // as following blocks rather than dropping it when a user changes a block type.
        result.push(...blocksToAst(block.children ?? [], projection));
    }
    return result;
}
export function reportBlocksToMdx(blocks: ReportBlock[], projection: ReportProjection, visuals: WorkVisual[]): string {
    const pieces: Array<{ source: string; gap: string; nextId?: string; id?: string }> = [];
    for (let index = 0; index < blocks.length; ) {
        const block = blocks[index];
        const fragment = projection.fragments.find(item => item.ids[0] === block.id);
        const slice = fragment ? blocks.slice(index, index + fragment.ids.length) : [];
        if (fragment && slice.every((item, i) => item.id === fragment.ids[i]) && slice.length === fragment.ids.length && reportBlockContentKey(slice) === fragment.original) {
            pieces.push({ ...fragment, id: block.id });
            index += slice.length;
            continue;
        }
        let source: string;
        if (block.type === 'reportSource') source = block.props?.source ?? '';
        else if (block.type === 'reportVisual') {
            const visual = visuals.find(item => item.id === block.props?.visualId);
            if (!visual) throw new Error('Unknown report component');
            source = reportTagSource(visual);
        } else {
            const tree: Root = { type: 'root', children: blocksToAst([block], projection) };
            source = serializer.stringify(tree).trimEnd();
        }
        if (block.children?.length && (block.type === 'reportSource' || block.type === 'reportVisual')) throw new Error('Report components must remain standalone blocks.');
        pieces.push({ source, gap: fragment?.gap ?? '\n\n', nextId: fragment?.nextId, id: block.id });
        index++;
    }
    const body =
        projection.prefix +
        pieces
            .map((piece, index) => piece.source + (index < pieces.length - 1 && piece.nextId !== pieces[index + 1].id && !/\n\s*\n/.test(piece.gap) ? '\n\n' : piece.gap))
            .join('');
    const parsed = parseReport(body, visuals);
    if (parsed.diagnostics.length) throw new Error(parsed.diagnostics.map(item => item.message).join('\n'));
    const activeDefinitions = new Set(parsed.tree?.children.filter(node => node.type === 'definition').map(node => node.identifier));
    const removedDefinitions = projection.definitions.filter(node => !activeDefinitions.has(node.identifier));
    if (removedDefinitions.length) {
        // Without its definition, Markdown silently turns a reference into plain
        // text. Resolve against the original definitions to detect that loss.
        const withDefinitions = parseReport(body + '\n\n' + serializer.stringify({ type: 'root', children: removedDefinitions }), visuals);
        if (withDefinitions.diagnostics.length) throw new Error(withDefinitions.diagnostics.map(item => item.message).join('\n'));
        const checkReferences = (node: Nodes) => {
            if (node.type === 'linkReference' && !activeDefinitions.has(node.identifier))
                throw new Error(`Restore the link definition [${node.identifier}] or remove its links first.`);
            if ('children' in node) node.children.forEach(checkReferences);
        };
        if (withDefinitions.tree) checkReferences(withDefinitions.tree);
    }
    return body;
}
