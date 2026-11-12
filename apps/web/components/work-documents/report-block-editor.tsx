'use client';

import { createContext, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Node, mergeAttributes, type Editor, type JSONContent } from '@tiptap/core';
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from '@tiptap/react';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import type { WorkDocumentContent, WorkVisual } from '@dory/shared/types/work-document';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { createReportMarkdown, reportBlocksFromMdx, reportBlocksToMdx, reportProseExtensions } from '@/lib/work-documents/report-blocks';
import { reportTagSource } from '@/lib/work-documents/report-core';

import { ReportVisual } from './report-body';

export type ReportBlockEditorHandle = {
    requestLeave: () => boolean;
    resetInsertionAnchor: () => void;
    insertVisual: (visual: WorkVisual, visuals: WorkVisual[]) => void;
};
type Context = {
    content: WorkDocumentContent;
    insert: (type: WorkVisual['type'], afterId: string) => void;
    edit: (visual: WorkVisual) => void;
    source: () => void;
};
const BlockContext = createContext<Context | null>(null);
const blockAttrs = () => ({ id: { default: null }, nextId: { default: null }, source: { default: '' }, gap: { default: '\n\n' }, original: { default: '' }, visualId: { default: null } });
const newBlock = (content: JSONContent = { type: 'paragraph' }): JSONContent => ({ type: 'reportBlock', attrs: { id: crypto.randomUUID() }, content: [content] });

function moveBlock(editor: Editor, from: number, direction: -1 | 1) {
    const { doc, tr } = editor.state;
    const node = doc.nodeAt(from);
    if (!node) return;
    const index = doc.resolve(from).index();
    if (index + direction < 0 || index + direction >= doc.childCount) return;
    const target = direction < 0 ? from - doc.child(index - 1).nodeSize : from + doc.child(index + 1).nodeSize;
    tr.delete(from, from + node.nodeSize).insert(target, node);
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
}
function InsertMenu({ editor, position, afterId }: { editor: Editor; position: () => number | undefined; afterId: string }) {
    const t = useTranslations('WorkDocuments.BlockEditor');
    const context = useContext(BlockContext)!;
    const prose: Array<[string, JSONContent]> = [
        ['Paragraph', { type: 'paragraph' }],
        ['Heading', { type: 'heading', attrs: { level: 2 } }],
        ['BulletList', { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }],
        ['OrderedList', { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }],
        ['Quote', { type: 'blockquote', content: [{ type: 'paragraph' }] }],
        ['Code', { type: 'codeBlock' }],
        ['Divider', { type: 'horizontalRule' }],
        [
            'TextTable',
            {
                type: 'table',
                content: [0, 1, 2].map(row => ({
                    type: 'tableRow',
                    content: [0, 1].map(() => ({ type: row === 0 ? 'tableHeader' : 'tableCell', content: [{ type: 'paragraph' }] })),
                })),
            },
        ],
    ];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={t('InsertBlock')}>
                    <Plus className="size-3.5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                {prose.map(([label, content]) => (
                    <DropdownMenuItem
                        key={label}
                        onSelect={() => {
                            const at = position();
                            if (at !== undefined) editor.chain().focus().insertContentAt(at, newBlock(content)).command(({ tr }) => { tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1))); return true; }).run();
                        }}
                    >
                        {t(label)}
                    </DropdownMenuItem>
                ))}
                {(['metric', 'chart', 'table'] as const).map(type => (
                    <DropdownMenuItem key={type} onSelect={() => context.insert(type, afterId)}>
                        {t(type)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
function BlockView({ editor, node, getPos, selected, deleteNode }: NodeViewProps) {
    const context = useContext(BlockContext)!;
    const t = useTranslations('WorkDocuments.BlockEditor');
    const visual = context.content.visuals.find(item => item.id === node.attrs.visualId);
    const evidence = context.content.evidence.find(item => item.artifactId === visual?.evidenceId);
    const atom = node.type.name === 'reportAtom';
    const position = getPos();
    const index = position === undefined ? 0 : editor.state.doc.resolve(position).index();
    return (
        <NodeViewWrapper
            className={`report-edit-block group/block relative min-w-0 rounded border px-3 pb-1 pt-7 ${selected ? 'border-ring' : 'border-transparent hover:border-border focus-within:border-border'}`}
            data-report-block={node.attrs.id}
        >
            <div
                contentEditable={false}
                className="absolute right-1 top-0 flex h-7 items-center gap-0.5 rounded bg-background opacity-0 group-hover/block:opacity-100 group-focus-within/block:opacity-100"
            >
                <span
                    draggable
                    data-drag-handle
                    role="button"
                    tabIndex={0}
                    aria-label={t('MoveBlock')}
                    className="cursor-grab rounded p-1.5 focus-visible:ring-2 focus-visible:ring-ring"
                    onKeyDown={event => {
                        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                            event.preventDefault();
                            const pos = getPos();
                            if (pos !== undefined) moveBlock(editor, pos, event.key === 'ArrowUp' ? -1 : 1);
                        }
                    }}
                >
                    <GripVertical className="size-3.5" />
                </span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={t('BlockActions')}>
                            <MoreHorizontal className="size-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            disabled={index === 0}
                            onSelect={() => {
                                const pos = getPos();
                                if (pos !== undefined) moveBlock(editor, pos, -1);
                            }}
                        >
                            {t('MoveUp')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled={index === editor.state.doc.childCount - 1}
                            onSelect={() => {
                                const pos = getPos();
                                if (pos !== undefined) moveBlock(editor, pos, 1);
                            }}
                        >
                            {t('MoveDown')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={deleteNode}>{t('Delete')}</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {atom ? (
                <div contentEditable={false}>
                    {visual && evidence ? (
                        <ReportVisual visual={visual} evidence={evidence} onEditComponent={() => context.edit(visual)} />
                    ) : visual ? (
                        <Button type="button" variant="outline" onClick={() => context.edit(visual)}>
                            {t('Configure', { title: visual.title })}
                        </Button>
                    ) : (
                        <div className="rounded bg-muted p-3 text-sm">
                            <p className="text-muted-foreground">{t('SourceOnly')}</p>
                            <pre className="max-h-60 overflow-auto whitespace-pre-wrap">{String(node.attrs.source)}</pre>
                            <Button type="button" size="sm" variant="outline" onClick={context.source}>
                                {t('OpenSource')}
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <NodeViewContent className="report-prose min-h-6" />
            )}
            <div contentEditable={false} className="-mb-3 flex h-6 justify-center opacity-0 group-hover/block:opacity-100 group-focus-within/block:opacity-100">
                <InsertMenu
                    editor={editor}
                    position={() => {
                        const pos = getPos();
                        return pos === undefined ? undefined : pos + node.nodeSize;
                    }}
                    afterId={String(node.attrs.id)}
                />
            </div>
        </NodeViewWrapper>
    );
}
const ReportDocument = Node.create({ name: 'doc', topNode: true, content: 'reportBlockNode+', addAttributes: () => ({ prefix: { default: '' } }) });
const ReportBlock = Node.create({
    name: 'reportBlock',
    group: 'reportBlockNode',
    content: 'block+',
    defining: true,
    draggable: true,
    addAttributes: blockAttrs,
    parseHTML: () => [{ tag: 'div[data-report-prose]' }],
    renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-report-prose': '' }), 0],
    addNodeView: () => ReactNodeViewRenderer(BlockView),
    addProseMirrorPlugins() {
        return [
            new Plugin({
                appendTransaction(transactions, _old, state) {
                    if (!transactions.some(transaction => transaction.docChanged)) return null;
                    const tr = state.tr;
                    // Enter/paste can create several top-level paragraphs inside one wrapper.
                    // Split them into independently movable blocks in the same history event.
                    let anchor: number | undefined;
                    let head: number | undefined;
                    const ids = new Set<string>();
                    state.doc.forEach((node, pos) => {
                        const id = node.attrs.id && !ids.has(node.attrs.id) ? String(node.attrs.id) : crypto.randomUUID();
                        ids.add(id);
                        if (id !== node.attrs.id) tr.setNodeMarkup(tr.mapping.map(pos), undefined, { ...node.attrs, id });
                        if (node.type.name !== 'reportBlock' || node.childCount <= 1) return;
                        const blocks = [];
                        let childOffset = 0;
                        const mappedStart = tr.mapping.map(pos);
                        for (let index = 0; index < node.childCount; index++) {
                            const child = node.child(index);
                            const start = pos + 1 + childOffset;
                            const end = start + child.nodeSize;
                            if (state.selection.anchor >= start && state.selection.anchor < end) anchor = mappedStart + 1 + childOffset + index * 2 + state.selection.anchor - start;
                            if (state.selection.head >= start && state.selection.head < end) head = mappedStart + 1 + childOffset + index * 2 + state.selection.head - start;
                            blocks.push(node.type.create({ ...node.attrs, id: index === 0 ? id : crypto.randomUUID(), source: '', original: '', gap: '\n\n' }, child));
                            childOffset += child.nodeSize;
                        }
                        tr.replaceWith(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize), blocks);
                    });
                    if (tr.docChanged && state.selection instanceof TextSelection && (anchor !== undefined || head !== undefined)) {
                        tr.setSelection(TextSelection.create(tr.doc, anchor ?? tr.mapping.map(state.selection.anchor), head ?? tr.mapping.map(state.selection.head)));
                    }
                    return tr.docChanged ? tr : null;
                },
            }),
        ];
    },
});
const ReportAtom = Node.create({
    name: 'reportAtom',
    group: 'reportBlockNode',
    atom: true,
    draggable: true,
    addAttributes: blockAttrs,
    parseHTML: () => [{ tag: 'div[data-report-atom]' }],
    renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-report-atom': '' })],
    addNodeView: () => ReactNodeViewRenderer(BlockView),
});

export default function ReportBlockEditor({
    ref,
    content,
    onChange,
    onInsert,
    onEdit,
    onSource,
}: {
    ref?: Ref<ReportBlockEditorHandle>;
    content: WorkDocumentContent;
    onChange: (body: string, visuals?: WorkVisual[]) => void;
    onInsert: (type: WorkVisual['type']) => void;
    onEdit: (visual: WorkVisual) => void;
    onSource: () => void;
}) {
    const t = useTranslations('WorkDocuments.BlockEditor');
    const markdown = useMemo(() => createReportMarkdown(), []);
    const latest = useRef({ content, onChange });
    latest.current = { content, onChange };
    const lastBody = useRef(content.body ?? '');
    const anchor = useRef<string | null>(null);
    const [error, setError] = useState('');
    const [link, setLink] = useState<string | null>(null);
    const [initialContent] = useState(() => reportBlocksFromMdx(content.body ?? '', content.visuals, markdown));
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [ReportDocument, ...reportProseExtensions(), ReportBlock, ReportAtom],
        content: initialContent,
        editorProps: { attributes: { class: 'work-prose outline-none min-h-60', role: 'textbox', 'aria-label': t('Body'), 'aria-multiline': 'true' } },
        onUpdate: ({ editor }) => {
            try {
                const body = reportBlocksToMdx(editor.getJSON(), latest.current.content.visuals, markdown);
                setError('');
                if (body === lastBody.current) return;
                lastBody.current = body;
                latest.current.onChange(body, latest.current.content.visuals);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            }
        },
    });
    useEffect(() => {
        if (!editor || content.body === lastBody.current) return;
        // Save acknowledgements do not recreate the editor, selection or history.
        editor.commands.setContent(reportBlocksFromMdx(content.body ?? '', content.visuals, markdown), { emitUpdate: false });
        lastBody.current = content.body ?? '';
    }, [content.body, content.visuals, editor, markdown]);
    useImperativeHandle(
        ref,
        () => ({
            requestLeave: () => !error,
            resetInsertionAnchor: () => { anchor.current = null; },
            insertVisual: (visual, visuals) => {
                if (!editor) return;
                latest.current = { ...latest.current, content: { ...latest.current.content, visuals } };
                let at = editor.state.doc.content.size;
                if (anchor.current === '') at = 0;
                else if (anchor.current)
                    editor.state.doc.forEach((node, pos) => {
                        if (node.attrs.id === anchor.current) at = pos + node.nodeSize;
                    });
                else {
                    const { $from } = editor.state.selection;
                    if ($from.depth > 0) at = $from.after(1);
                }
                editor
                    .chain()
                    .focus()
                    .insertContentAt(at, { type: 'reportAtom', attrs: { id: crypto.randomUUID(), visualId: visual.id, source: reportTagSource(visual) } })
                    .run();
                anchor.current = null;
            },
        }),
        [editor, error],
    );
    const controls: Array<[string, () => void]> = editor
        ? [
              [
                  'Undo',
                  () => {
                      editor.chain().focus().undo().run();
                  },
              ],
              [
                  'Redo',
                  () => {
                      editor.chain().focus().redo().run();
                  },
              ],
              [
                  'Heading',
                  () => {
                      editor.chain().focus().toggleHeading({ level: 2 }).run();
                  },
              ],
              [
                  'Bold',
                  () => {
                      editor.chain().focus().toggleBold().run();
                  },
              ],
              [
                  'Italic',
                  () => {
                      editor.chain().focus().toggleItalic().run();
                  },
              ],
              [
                  'Strike',
                  () => {
                      editor.chain().focus().toggleStrike().run();
                  },
              ],
              [
                  'InlineCode',
                  () => {
                      editor.chain().focus().toggleCode().run();
                  },
              ],
              [
                  'BulletList',
                  () => {
                      editor.chain().focus().toggleBulletList().run();
                  },
              ],
              [
                  'OrderedList',
                  () => {
                      editor.chain().focus().toggleOrderedList().run();
                  },
              ],
              [
                  'Quote',
                  () => {
                      editor.chain().focus().toggleBlockquote().run();
                  },
              ],
              [
                  'Code',
                  () => {
                      editor.chain().focus().toggleCodeBlock().run();
                  },
              ],
              ['Link', () => setLink(String(editor.getAttributes('link').href ?? ''))],
          ]
        : [];
    return (
        <BlockContext.Provider
            value={{
                content,
                insert: (type, id) => {
                    anchor.current = id;
                    onInsert(type);
                },
                edit: onEdit,
                source: onSource,
            }}
        >
            <div data-testid="report-block-editor" className="min-w-0 space-y-3">
                <div role="toolbar" aria-label={t('Formatting')} className="flex flex-wrap gap-1 border-b pb-2">
                    {controls.map(([label, action]) => (
                        <Button type="button" key={label} size="sm" variant="ghost" onMouseDown={event => event.preventDefault()} onClick={action}>
                            {t(label)}
                        </Button>
                    ))}
                </div>
                {link !== null && (
                    <form
                        className="flex gap-2"
                        onSubmit={event => {
                            event.preventDefault();
                            const url = link.trim();
                            if (url && !/^(https?:\/\/|mailto:|#|dory:\/\/(?:evidence|evidence-group)\/[a-zA-Z0-9_-]+$)/i.test(url)) return;
                            if (url) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                            else editor?.chain().focus().unsetLink().run();
                            setLink(null);
                        }}
                    >
                        <Input autoFocus aria-label={t('LinkUrl')} value={link} onChange={event => setLink(event.target.value)} />
                        <Button type="submit">{t('Apply')}</Button>
                        <Button type="button" variant="ghost" onClick={() => setLink(null)}>
                            {t('Cancel')}
                        </Button>
                    </form>
                )}
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                {editor && (
                    <div className="flex justify-center">
                        <InsertMenu editor={editor} position={() => 0} afterId="" />
                    </div>
                )}
                <EditorContent editor={editor} />
            </div>
        </BlockContext.Provider>
    );
}
