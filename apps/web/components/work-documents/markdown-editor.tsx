'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { GripVertical, Trash2 } from 'lucide-react';
import type { WorkDocumentContent } from '@dory/shared/types/work-document';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { hasUnsupportedMarkdown, markdownSemantics } from '@/lib/work-documents/markdown';
import { workVisualHtml } from '@/lib/work-documents/render';

const SourceEditor = dynamic(() => import('./source-editor'), { ssr: false });
const VisualContext = createContext<{ content: WorkDocumentContent; onEvidence: (id: string) => void } | null>(null);
function VisualNode({ node, deleteNode, selected }: NodeViewProps) {
    const context = useContext(VisualContext)!;
    const t = useTranslations('WorkDocuments');
    const id = String(node.attrs.src ?? '').replace('dory://visual/', '');
    const visual = context.content.visuals.find(item => item.id === id);
    const evidence = visual && context.content.evidence.find(item => item.artifactId === visual.evidenceId);
    return (
        <NodeViewWrapper contentEditable={false} className={`my-5 rounded-lg border bg-muted/20 p-3 ${selected ? 'ring-2 ring-ring' : ''}`} data-testid="visual-card">
            <div className="flex items-center justify-end gap-2">
                <span draggable data-drag-handle className="cursor-grab" aria-label={t('MoveVisual')}>
                    <GripVertical className="size-4" />
                </span>
                {evidence ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => context.onEvidence(evidence.artifactId)}>
                        {t('Evidence')}
                    </Button>
                ) : null}
                <Button type="button" size="icon" variant="ghost" aria-label={t('Delete')} onClick={deleteNode}>
                    <Trash2 className="size-4" />
                </Button>
            </div>
            {visual && evidence ? (
                <div dangerouslySetInnerHTML={{ __html: workVisualHtml(visual, evidence) }} />
            ) : (
                <p role="alert">
                    {t('InvalidReference')}: {id}
                </p>
            )}
        </NodeViewWrapper>
    );
}
const WorkImage = Image.extend({
    addNodeView() {
        return ReactNodeViewRenderer(VisualNode);
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', { 'data-work-visual': HTMLAttributes.src }, HTMLAttributes.alt ?? ''];
    },
});

export default function MarkdownEditor({
    content,
    onChange,
    onEvidence,
}: {
    content: WorkDocumentContent;
    onChange: (markdown: string) => void;
    onEvidence: (id: string) => void;
}) {
    const t = useTranslations('WorkDocuments');
    const [source, setSource] = useState(false);
    const [unsupported, setUnsupported] = useState(false);
    const [linkUrl, setLinkUrl] = useState<string | null>(null);
    const latest = useRef({ content, onChange });
    latest.current = { content, onChange };
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({ underline: false, trailingNode: false, link: { openOnClick: false, protocols: ['dory'], autolink: false, linkOnPaste: false } }),
            TableKit,
            WorkImage,
            Markdown,
        ],
        content: '',
        contentType: 'markdown',
        editorProps: { attributes: { class: 'work-prose min-h-96 outline-none', role: 'textbox', 'aria-label': t('DocumentBody') } },
        onUpdate: ({ editor }) => latest.current.onChange(editor.getMarkdown()),
    });
    const checkContent = () => {
        if (!editor) return false;
        const markdown = latest.current.content.markdown;
        if (hasUnsupportedMarkdown(markdown)) {
            setUnsupported(true);
            return false;
        }
        editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
        const supported = markdownSemantics(markdown) === markdownSemantics(editor.getMarkdown());
        setUnsupported(!supported);
        return supported;
    };
    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled && editor && !editor.isDestroyed && !checkContent()) setSource(true);
        });
        // Initialize once. Autosave revisions must not reset the cursor or undo history.
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor]);
    return (
        <VisualContext.Provider value={{ content, onEvidence }}>
            <div className="my-6 space-y-3" data-testid="markdown-editor">
                <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                    <Button
                        type="button"
                        size="sm"
                        variant={!source ? 'secondary' : 'ghost'}
                        onClick={() => {
                            if (source && checkContent()) setSource(false);
                        }}
                    >
                        {t('DocumentMode')}
                    </Button>
                    <Button type="button" size="sm" variant={source ? 'secondary' : 'ghost'} onClick={() => setSource(true)}>
                        {t('SourceMode')}
                    </Button>
                    {!source && editor ? (
                        <>
                            <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                                {t('Heading')}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBold().run()}>
                                {t('Bold')}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleItalic().run()}>
                                {t('Italic')}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBulletList().run()}>
                                {t('List')}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
                                {t('Quote')}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setLinkUrl(String(editor.getAttributes('link').href ?? ''))}>
                                {t('Link')}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
                                {t('Code')}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}>
                                {t('Table')}
                            </Button>
                        </>
                    ) : null}
                </div>
                {!source && linkUrl !== null ? (
                    <div className="flex items-center gap-2">
                        <Input aria-label={t('LinkUrl')} value={linkUrl} onChange={event => setLinkUrl(event.target.value)} placeholder="https://" />
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                                const url = linkUrl.trim();
                                if (url && !/^(https?:\/\/|mailto:|dory:\/\/evidence\/|#)/i.test(url)) return;
                                if (url) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                                else editor?.chain().focus().extendMarkRange('link').unsetLink().run();
                                setLinkUrl(null);
                            }}
                        >
                            {t('Save')}
                        </Button>
                    </div>
                ) : null}
                {unsupported ? (
                    <p role="status" className="rounded border p-3 text-sm text-muted-foreground">
                        {t('SourceOnly')}
                    </p>
                ) : null}
                {source ? <SourceEditor value={content.markdown} onChange={onChange} /> : <EditorContent editor={editor} />}
            </div>
        </VisualContext.Provider>
    );
}
