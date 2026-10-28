import type { ReportDiagnostic, ReportEmbed, WorkDocumentContent, WorkVisual } from '@dory/shared/types/work-document';
import type { Nodes, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

import { referencedEvidence } from './markdown';
import { workVisualSchema } from './schema';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMdx);
const markdown = unified().use(remarkParse).use(remarkGfm);
const serializer = unified().use(remarkParse).use(remarkGfm).use(remarkMdx).use(remarkStringify);
const tags = { Metric: 'metric', Chart: 'chart', DataTable: 'table' } as const;
const allowed = new Set([
    'root',
    'paragraph',
    'text',
    'heading',
    'emphasis',
    'strong',
    'delete',
    'blockquote',
    'list',
    'listItem',
    'break',
    'thematicBreak',
    'code',
    'inlineCode',
    'table',
    'tableRow',
    'tableCell',
    'link',
    'linkReference',
    'definition',
]);
export const reportTag = (type: WorkVisual['type']) => (type === 'metric' ? 'Metric' : type === 'chart' ? 'Chart' : 'DataTable');
export const reportTagSource = (visual: WorkVisual) => `<${reportTag(visual.type)} source="${visual.id}" />`;

/** Parse only. No compiler, eval, HTML passthrough or user-controlled component resolution. */
export function parseReport(body: string, visuals: WorkVisual[]) {
    const diagnostics: ReportDiagnostic[] = [];
    const replacements: Array<{ start: number; end: number; value: string; visualId: string }> = [];
    let tree: Root | undefined;
    const error = (node: Nodes, message: string) => diagnostics.push({ message, line: node.position?.start.line, column: node.position?.start.column });
    try {
        if (body.length > 200000) throw new Error('Report body exceeds 200,000 characters.');
        tree = parser.parse(body);
        const visit = (node: Nodes, parent?: Nodes) => {
            // Existing agents can mix legacy visual links with restricted MDX.
            // Resolve only registered standalone visuals; never arbitrary images.
            if (node.type === 'image' && node.url.startsWith('dory://visual/')) {
                const visual = visuals.find(item => node.url === `dory://visual/${item.id}`);
                if (!visual || parent?.type !== 'paragraph' || parent.children.length !== 1) {
                    error(node, 'Unknown or non-standalone visual reference. Use a registered visual ID.');
                } else if (node.position) {
                    replacements.push({
                        start: node.position.start.offset!,
                        end: node.position.end.offset!,
                        value: `![${visual.title.replace(/[\[\]\\]/g, '')}](dory://visual/${visual.id})`,
                        visualId: visual.id,
                    });
                }
                return;
            }
            if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
                const type = tags[node.name as keyof typeof tags];
                const attr = node.attributes[0];
                if (
                    !type ||
                    parent?.type !== 'root' ||
                    node.children.length ||
                    node.attributes.length !== 1 ||
                    attr?.type !== 'mdxJsxAttribute' ||
                    attr.name !== 'source' ||
                    typeof attr.value !== 'string'
                ) {
                    error(node, 'Only standalone Metric, Chart and DataTable tags with a static source attribute are allowed.');
                    return;
                }
                const visual = visuals.find(item => item.id === attr.value);
                if (!visual || visual.type !== type) error(node, `Unknown or mismatched component source: ${attr.value}`);
                else if (node.position)
                    replacements.push({
                        start: node.position.start.offset!,
                        end: node.position.end.offset!,
                        value: `![${visual.title.replace(/[\[\]\\]/g, '')}](dory://visual/${visual.id})`,
                        visualId: visual.id,
                    });
                return;
            }
            if (!allowed.has(node.type)) {
                error(node, `Unsupported report syntax: ${node.type}`);
                return;
            }
            if ('url' in node && !/^(https?:\/\/|mailto:|#|dory:\/\/evidence\/[a-zA-Z0-9_-]+$)/i.test(node.url)) error(node, 'Unsupported link URL.');
            if ('children' in node) for (const child of node.children) visit(child, node);
        };
        visit(tree);
    } catch (err) {
        const located = err as { message?: string; line?: number; column?: number };
        diagnostics.push({ message: located.message ?? 'Invalid MDX.', line: located.line, column: located.column });
    }
    let presentation = body;
    for (const replacement of [...replacements].reverse()) presentation = presentation.slice(0, replacement.start) + replacement.value + presentation.slice(replacement.end);
    return { tree, diagnostics, presentation, components: replacements };
}

/** Preserve Markdown text semantics, including literal braces, HTML and code examples. */
export function legacyToMdx(body: string, visuals: WorkVisual[]): string {
    const tree = markdown.parse(body);
    const definitions = new Map(tree.children.filter(node => node.type === 'definition').map(node => [node.identifier, node.url]));
    const hoisted: Nodes[] = [];
    const component = (visual: WorkVisual): Nodes => ({
        type: 'mdxJsxFlowElement',
        name: reportTag(visual.type),
        attributes: [{ type: 'mdxJsxAttribute', name: 'source', value: visual.id }],
        children: [],
    });
    const expandReferences = (node: Nodes): Nodes => {
        if (node.type === 'imageReference') return { type: 'image', url: definitions.get(node.identifier) ?? '', alt: node.alt };
        if ('children' in node) return { ...node, children: node.children.map(expandReferences) } as Nodes;
        return node;
    };
    const rewrite = (node: Nodes): Nodes => {
        if (node.type === 'html') return { type: 'text', value: node.value };
        if (node.type === 'image') {
            const visual = visuals.find(item => node.url === `dory://visual/${item.id}`);
            if (visual) {
                // Nested legacy embeds retain their label in context and move their
                // data block to the root, where restricted MDX permits components.
                hoisted.push(component(visual));
                return { type: 'text', value: node.alt || visual.title };
            }
            return { type: 'text', value: node.alt ?? '' };
        }
        if ('children' in node) {
            // Legacy image embeds were allowed inline. Lift them to standalone blocks.
            if (node.type === 'root') {
                const children: Root['children'] = [];
                for (const child of node.children) {
                    if (child.type === 'paragraph' && child.children.some(item => item.type === 'image' && item.url.startsWith('dory://visual/'))) {
                        let pending: typeof child.children = [];
                        for (const item of child.children) {
                            if (item.type === 'image' && item.url.startsWith('dory://visual/')) {
                                if (pending.length) children.push({ type: 'paragraph', children: pending });
                                pending = [];
                                const visual = visuals.find(visual => item.url === `dory://visual/${visual.id}`);
                                children.push((visual ? component(visual) : { type: 'paragraph', children: [rewrite(item)] }) as Root['children'][number]);
                            } else pending.push(rewrite(item) as typeof item);
                        }
                        if (pending.length) children.push({ type: 'paragraph', children: pending });
                    } else children.push(rewrite(child) as Root['children'][number]);
                }
                return { ...node, children };
            }
            return { ...node, children: node.children.map(rewrite) } as Nodes;
        }
        return node;
    };
    const converted = rewrite(expandReferences(tree)) as Root;
    converted.children = converted.children.filter(node => node.type !== 'definition' || !node.url.startsWith('dory://visual/'));
    converted.children.push(...(hoisted as Root['children']));
    return serializer.stringify(converted);
}

export function reportEmbeds(visuals: WorkVisual[], evidence: WorkDocumentContent['evidence']): Record<string, ReportEmbed> {
    return Object.fromEntries(
        visuals.map(visual => {
            const base = { artifactId: visual.evidenceId, snapshotId: evidence.find(item => item.artifactId === visual.evidenceId)?.snapshotId ?? '' };
            const embed: ReportEmbed =
                visual.type === 'metric'
                    ? { ...base, type: 'metric', config: { title: visual.title, metric: visual.metric!, allowSubset: visual.allowSubset } }
                    : visual.type === 'chart'
                      ? { ...base, type: 'chart', config: { title: visual.title, chart: visual.chart!, allowSubset: visual.allowSubset } }
                      : { ...base, type: 'table', config: { title: visual.title, allowSubset: visual.allowSubset } };
            return [visual.id, embed];
        }),
    );
}
export function editableReport(content: WorkDocumentContent): WorkDocumentContent {
    if (content.format) return content;
    const body = legacyToMdx(content.markdown, content.visuals);
    const evidence = content.evidence.map(item => ({ ...item, snapshotId: item.snapshotId ?? `legacy_${item.artifactId}_${item.capturedAt}` }));
    return { ...content, evidence, format: 'restricted-mdx', schemaVersion: 1, body, embeds: reportEmbeds(content.visuals, evidence) };
}
export function resolvedReport(content: WorkDocumentContent): WorkDocumentContent {
    if (!content.format) return content;
    if (content.schemaVersion !== 1) throw new Error('Unsupported report schema version.');
    const visuals = Object.entries(content.embeds ?? {}).map(([id, embed]) => workVisualSchema.parse({ id, type: embed.type, evidenceId: embed.artifactId, ...embed.config }));
    const parsed = parseReport(content.body ?? '', visuals);
    if (parsed.diagnostics.length) throw new Error(parsed.diagnostics.map(item => `${item.line ?? 1}:${item.column ?? 1} ${item.message}`).join('\n'));
    for (const id of referencedEvidence(parsed.presentation, visuals).ids) {
        if (!content.evidence.some(item => item.artifactId === id)) throw new Error('Missing report evidence.');
    }
    for (const component of parsed.components) {
        const embed = content.embeds![component.visualId];
        if (!content.evidence.some(item => item.artifactId === embed.artifactId && item.snapshotId === embed.snapshotId)) throw new Error('Missing report snapshot.');
    }
    return { ...content, markdown: parsed.presentation, visuals };
}
