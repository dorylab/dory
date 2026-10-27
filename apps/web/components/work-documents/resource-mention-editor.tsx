'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from '@tiptap/react';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { history, undo, redo, closeHistory } from '@tiptap/pm/history';
import { Plugin } from '@tiptap/pm/state';
import { useTranslations } from 'next-intl';
import type { AnalysisScope } from '@dory/shared/types/work-document';
import { ArrowLeft, AtSign, ChevronRight, Loader2, X } from 'lucide-react';

import { Popover, PopoverAnchor, PopoverContent } from '@/registry/new-york-v4/ui/popover';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { useChatReferences } from '@/lib/chat-context/use-references';
import { defaultReferences, mentionLabel, referenceInScope, type ReferenceCategory } from '@/lib/chat-context/mentions';
import { buildMentionDocument, serializeMentionDocument, type MentionDraft } from '@/lib/chat-context/mention-document';
import { chatReferenceSchema, referenceKey, type ChatReference } from '@/lib/chat-context/types';
import { ResourceIcon } from './resource-icon';
import type { RecentReference } from '@/lib/chat-context/recent-references';

const ScopeContext = createContext<AnalysisScope>({ connectionIds: [] });

function MentionNodeView({ node, deleteNode, editor }: NodeViewProps) {
    const scope = useContext(ScopeContext);
    const t = useTranslations('ChatComposer');
    const reference = chatReferenceSchema.parse(node.attrs.reference);
    const invalid = !referenceInScope(reference, scope);
    return (
        <NodeViewWrapper as="span" contentEditable={false} className="inline" data-testid="mention-chip">
            <Tooltip>
                <TooltipTrigger asChild>
                    <span
                        className={`mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 align-middle text-sm ${invalid ? 'border-destructive text-destructive' : ''}`}
                    >
                        <ResourceIcon reference={reference} />
                        <span className="max-w-64 truncate">{reference.title}</span>
                        {reference.kind === 'report' && reference.revision && <span className="text-xs text-muted-foreground">v{reference.revision}</span>}
                        {invalid && <span className="text-xs">{t('Picker.OutOfScopeShort')}</span>}
                        <button
                            type="button"
                            disabled={!editor.isEditable}
                            aria-label={t('Remove', { name: reference.title })}
                            className="shrink-0 rounded hover:bg-accent"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => {
                                editor.view.dispatch(closeHistory(editor.state.tr));
                                deleteNode();
                                editor.commands.focus();
                            }}
                        >
                            <X className="size-3" />
                        </button>
                    </span>
                </TooltipTrigger>
                <TooltipContent>
                    {invalid
                        ? t('Picker.OutOfScope')
                        : reference.kind === 'table'
                          ? [reference.connectionId, reference.database, reference.schema, reference.table].filter(Boolean).join(' / ')
                          : mentionLabel(reference)}
                </TooltipContent>
            </Tooltip>
        </NodeViewWrapper>
    );
}

const ResourceMention = Node.create({
    name: 'resourceMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
        return {
            reference: {
                default: null,
                rendered: false,
                parseHTML: element => {
                    try {
                        return chatReferenceSchema.parse(JSON.parse(element.getAttribute('data-dory-reference') ?? 'null'));
                    } catch {
                        return null;
                    }
                },
            },
        };
    },
    parseHTML() {
        return [
            {
                tag: 'span[data-dory-reference]',
                getAttrs: element => {
                    try {
                        const ref = chatReferenceSchema.parse(JSON.parse(element.getAttribute('data-dory-reference') ?? 'null'));
                        return { reference: ref };
                    } catch {
                        return false;
                    }
                },
            },
        ];
    },
    renderHTML({ node, HTMLAttributes }) {
        const reference = chatReferenceSchema.parse(node.attrs.reference);
        return ['span', mergeAttributes(HTMLAttributes, { 'data-dory-reference': JSON.stringify(reference) }), mentionLabel(reference)];
    },
    renderText({ node }) {
        return mentionLabel(chatReferenceSchema.parse(node.attrs.reference));
    },
    addNodeView() {
        return ReactNodeViewRenderer(MentionNodeView);
    },
});
const extensions = [
    Node.create({ name: 'doc', topNode: true, content: 'paragraph+' }),
    Node.create({ name: 'paragraph', group: 'block', content: 'inline*', parseHTML: () => [{ tag: 'p' }, { tag: 'div' }], renderHTML: () => ['p', 0] }),
    Node.create({ name: 'text', group: 'inline' }),
    Node.create({ name: 'hardBreak', group: 'inline', inline: true, selectable: false, parseHTML: () => [{ tag: 'br' }], renderHTML: () => ['br'], renderText: () => '\n' }),
    ResourceMention,
    Extension.create({
        name: 'mentionHistory',
        addProseMirrorPlugins: () => [history()],
        addKeyboardShortcuts() {
            return {
                'Mod-z': () => undo(this.editor.state, this.editor.view.dispatch),
                'Mod-Shift-z': () => redo(this.editor.state, this.editor.view.dispatch),
                'Mod-y': () => redo(this.editor.state, this.editor.view.dispatch),
                'Shift-Enter': () => this.editor.commands.insertContent({ type: 'hardBreak' }),
            };
        },
    }),
];

type Mention = { from: number; to: number; query: string };
type Props = {
    draft: MentionDraft;
    onChange: (draft: MentionDraft) => void;
    onSubmit: () => void;
    onError: (message: string) => void;
    disabled: boolean;
    organization: string;
    chatId: string | null;
    runIds: string[];
    scope: AnalysisScope;
    recent: RecentReference[];
    sourceNames: Record<string, string>;
    editorRef: RefObject<Editor | null>;
    openPickerRef: RefObject<(() => void) | null>;
};

export function ResourceMentionEditor(props: Props) {
    const t = useTranslations('ChatComposer');
    const latest = useRef(props);
    latest.current = props;
    const [mention, setMention] = useState<Mention | null>(null);
    const [search, setSearch] = useState<string | null>(null);
    const [category, setCategory] = useState<ReferenceCategory>(null);
    const [active, setActive] = useState(0);
    const dismissed = useRef<string | null>(null);
    const id = useId();
    const root = useRef<HTMLDivElement>(null);
    const candidates = useChatReferences(props.organization, props.chatId, props.scope, search, props.runIds, category, props.recent, props.sourceNames);
    const fresh = mention?.query === search;
    const matches = fresh ? (!search?.trim() && !category ? defaultReferences(candidates.options) : candidates.options) : [];
    const options = matches.slice(0, 60);
    const browse = !mention?.query.trim() && !category ? (['report', 'result_set', 'table'] as const) : [];
    const count = options.length + browse.length;
    const selected = Math.min(active, Math.max(0, count - 1));
    const controls = useRef({ mention, options, browse, selected, fresh, category });
    controls.current = { mention, options, browse, selected, fresh, category };
    const inspect = (editor: Editor) => {
        if (!editor.state.selection.empty) {
            setMention(null);
            return;
        }
        const { $from } = editor.state.selection;
        const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc');
        const match = /(?:^|[^a-zA-Z0-9_])@([^@\n\ufffc]*)$/u.exec(before);
        const next = match ? { from: $from.pos - match[1].length - 1, to: $from.pos, query: match[1] } : null;
        const key = next ? JSON.stringify(next) : null;
        if (dismissed.current && dismissed.current === key) return;
        dismissed.current = null;
        const previous = controls.current.mention;
        if (previous?.from === next?.from && previous?.to === next?.to && previous?.query === next?.query) return;
        setActive(0);
        if (!next || previous?.from !== next.from) setCategory(null);
        setMention(next);
    };
    const close = () => {
        dismissed.current = JSON.stringify(controls.current.mention);
        setMention(null);
        setCategory(null);
    };
    const choose = (editor: Editor, reference: ChatReference) => {
        const current = controls.current;
        if (!current.mention || !current.fresh) return;
        const draft = serializeMentionDocument(editor.getJSON());
        if (!draft.references.some(ref => referenceKey(ref) === referenceKey(reference)) && draft.references.length >= 20) {
            latest.current.onError(t('ReferenceLimit'));
            return;
        }
        editor.view.dispatch(closeHistory(editor.state.tr));
        editor
            .chain()
            .focus()
            .insertContentAt({ from: current.mention.from, to: current.mention.to }, [
                { type: 'resourceMention', attrs: { reference } },
                { type: 'text', text: ' ' },
            ])
            .run();
        close();
    };
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            ...extensions,
            Extension.create({
                name: 'mentionLimits',
                addProseMirrorPlugins: () => [
                    new Plugin({
                        filterTransaction: transaction => {
                            if (!transaction.docChanged) return true;
                            const draft = serializeMentionDocument(transaction.doc.toJSON());
                            if (draft.references.length <= 20 && draft.mentionSpans.length <= 200) return true;
                            queueMicrotask(() => latest.current.onError(t('ReferenceLimit')));
                            return false;
                        },
                    }),
                ],
            }),
        ],
        content: buildMentionDocument(props.draft.text, props.draft.references, props.draft.mentionSpans),
        editorProps: {
            // Let the browser finish IME composition without running ProseMirror shortcuts.
            handleDOMEvents: { keydown: (view, event) => event.isComposing || view.composing || event.keyCode === 229 },
            attributes: {
                role: 'textbox',
                'aria-label': t('Question'),
                'aria-multiline': 'true',
                class: 'min-h-24 max-h-64 overflow-y-auto whitespace-pre-wrap break-words px-4 pt-4 pb-3 text-sm outline-none [&_p]:m-0',
            },
            handleKeyDown: (view, event) => {
                if (event.isComposing || view.composing || event.keyCode === 229) return false;
                const state = controls.current;
                if (state.mention && !event.shiftKey && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) {
                    event.preventDefault();
                    if (event.key === 'Escape') close();
                    else if (event.key === 'Enter') {
                        const option = state.options[state.selected];
                        if (option && latest.current.editorRef.current) choose(latest.current.editorRef.current, option.reference);
                        else if (state.fresh && state.browse[state.selected - state.options.length]) {
                            setCategory(state.browse[state.selected - state.options.length]);
                            setActive(0);
                        }
                    } else
                        setActive(
                            previous =>
                                (previous + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(1, state.options.length + state.browse.length)) %
                                Math.max(1, state.options.length + state.browse.length),
                        );
                    return true;
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    latest.current.onSubmit();
                    return true;
                }
                return false;
            },
            transformPasted: slice => {
                const known = new Map([...controls.current.options.map(option => option.reference), ...latest.current.draft.references].map(ref => [referenceKey(ref), ref]));
                const clean = (fragment: Fragment): Fragment => {
                    const nodes: ProseMirrorNode[] = [];
                    fragment.forEach(node => {
                        if (node.type.name === 'resourceMention') {
                            const parsed = chatReferenceSchema.safeParse(node.attrs.reference);
                            const canonical = parsed.success ? known.get(referenceKey(parsed.data)) : undefined;
                            if (canonical && referenceInScope(canonical, latest.current.scope)) nodes.push(node.type.create({ reference: canonical }));
                            else if (parsed.success) nodes.push(node.type.schema.text(mentionLabel(parsed.data)));
                        } else nodes.push(node.content.size ? node.copy(clean(node.content)) : node);
                    });
                    return Fragment.fromArray(nodes);
                };
                return new Slice(clean(slice.content), slice.openStart, slice.openEnd);
            },
        },
        onUpdate: ({ editor }) => {
            latest.current.onChange(serializeMentionDocument(editor.getJSON()));
            inspect(editor);
        },
        onSelectionUpdate: ({ editor }) => inspect(editor),
    });
    props.editorRef.current = editor;
    props.openPickerRef.current = () => {
        if (!editor || props.disabled) return;
        dismissed.current = null;
        const { $from, empty } = editor.state.selection;
        const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc');
        if (empty && /(?:^|[^a-zA-Z0-9_])@([^@\n\ufffc]*)$/u.test(before)) {
            inspect(editor);
            editor.commands.focus();
        } else {
            const separator = /[a-zA-Z0-9_]$/.test(before) ? ' ' : '';
            editor.chain().focus().insertContent(`${separator}@`).run();
        }
    };
    useEffect(() => {
        if (!editor) return;
        const current = serializeMentionDocument(editor.getJSON());
        if (current.text !== props.draft.text || JSON.stringify(current.mentionSpans) !== JSON.stringify(props.draft.mentionSpans)) {
            editor.commands.setContent(buildMentionDocument(props.draft.text, props.draft.references, props.draft.mentionSpans), { emitUpdate: false });
            const normalized = serializeMentionDocument(editor.getJSON());
            if (JSON.stringify(normalized) !== JSON.stringify(latest.current.draft)) latest.current.onChange(normalized);
            setMention(null);
        }
    }, [editor, props.draft]);
    useEffect(() => {
        editor?.setEditable(!props.disabled);
    }, [editor, props.disabled]);
    useEffect(() => {
        const timer = setTimeout(() => setSearch(mention?.query ?? null), mention?.query === '' ? 0 : 180);
        return () => clearTimeout(timer);
    }, [mention?.query]);
    useEffect(() => {
        const element = editor?.view.dom;
        if (!element) return;
        element.setAttribute('aria-autocomplete', 'list');
        element.setAttribute('aria-expanded', String(Boolean(mention)));
        if (mention) element.setAttribute('aria-controls', id);
        else element.removeAttribute('aria-controls');
        if (mention && count) element.setAttribute('aria-activedescendant', `${id}-${selected}`);
        else element.removeAttribute('aria-activedescendant');
        document.getElementById(`${id}-${selected}`)?.scrollIntoView({ block: 'nearest' });
    }, [editor, mention, count, selected, id]);
    const categoryLabel = (value: Exclude<ReferenceCategory, null>) => t(`Picker.Categories.${value}`);
    return (
        <ScopeContext.Provider value={props.scope}>
            <Popover
                open={Boolean(mention) && !props.disabled}
                onOpenChange={open => {
                    if (!open) close();
                }}
            >
                <PopoverAnchor asChild>
                    <div ref={root} className="relative">
                        {!props.draft.text && (
                            <div aria-hidden="true" className="pointer-events-none absolute left-4 right-4 top-4 text-sm text-muted-foreground">
                                {t('Placeholder')}
                            </div>
                        )}
                        <EditorContent editor={editor} />
                    </div>
                </PopoverAnchor>
                <PopoverContent
                    side="top"
                    align="start"
                    sideOffset={8}
                    collisionPadding={12}
                    className="flex w-[440px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl p-0"
                    style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}
                    onOpenAutoFocus={event => event.preventDefault()}
                    onCloseAutoFocus={event => event.preventDefault()}
                    onInteractOutside={event => {
                        if (event.target instanceof globalThis.Node && root.current?.contains(event.target)) event.preventDefault();
                    }}
                >
                    <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
                        {category ? (
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-6"
                                aria-label={t('Picker.AllResources')}
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => {
                                    setCategory(null);
                                    setActive(0);
                                    editor?.commands.focus();
                                }}
                            >
                                <ArrowLeft className="size-3" />
                            </Button>
                        ) : (
                            <AtSign className="size-4" />
                        )}
                        <span className="flex-1">{category ? categoryLabel(category) : t('Picker.Search')}</span>
                        <button type="button" aria-label={t('Picker.Close')} className="rounded border px-1" onClick={close}>
                            Esc
                        </button>
                    </div>
                    <div className="min-h-0 max-h-[340px] overflow-y-auto p-1" role="listbox" id={id} aria-label={t('References')} aria-busy={!fresh || candidates.loading}>
                        {(!fresh || candidates.loading) && (
                            <div role="status" className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                                <Loader2 className="size-3 animate-spin" />
                                {t('Loading')}
                            </div>
                        )}
                        {candidates.error && (
                            <div role="alert" className="px-2 py-1 text-xs text-destructive">
                                {t('SearchFailed')}{' '}
                                <Button type="button" variant="ghost" size="sm" onClick={candidates.retry}>
                                    {t('Retry')}
                                </Button>
                            </div>
                        )}
                        {fresh && !candidates.loading && !options.length && (
                            <div role="status" className="p-3 text-sm text-muted-foreground">
                                {!search && !category ? t('Picker.NoRecent') : t('NoReferences')}
                            </div>
                        )}
                        {options.map((option, index) => (
                            <div key={referenceKey(option.reference)}>
                                {option.group && (index === 0 || options[index - 1].group !== option.group) && (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground">{t(option.group === 'current' ? 'Picker.CurrentWork' : 'Picker.Recent')}</div>
                                )}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            role="option"
                                            id={`${id}-${index}`}
                                            aria-selected={selected === index}
                                            onMouseDown={event => event.preventDefault()}
                                            onMouseMove={() => setActive(index)}
                                            onClick={() => editor && choose(editor, option.reference)}
                                            className={`flex min-h-12 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm ${selected === index ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
                                        >
                                            <ResourceIcon reference={option.reference} artifactType={option.artifactType} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate">{option.reference.title}</span>
                                                <span className="block truncate text-xs text-muted-foreground">{option.detail}</span>
                                            </span>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {option.reference.title}
                                        <br />
                                        {option.detail}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        ))}
                        {browse.length > 0 && <div className="px-2 pb-1 pt-2 text-xs text-muted-foreground">{t('Picker.Browse')}</div>}
                        {browse.map((value, index) => (
                            <button
                                key={value}
                                type="button"
                                role="option"
                                id={`${id}-${options.length + index}`}
                                aria-selected={selected === options.length + index}
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => {
                                    setCategory(value);
                                    setActive(0);
                                    editor?.commands.focus();
                                }}
                                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-sm ${selected === options.length + index ? 'bg-accent' : 'hover:bg-accent'}`}
                            >
                                {categoryLabel(value)}
                                <ChevronRight className="size-3 text-muted-foreground" />
                            </button>
                        ))}
                    </div>
                    <div className="shrink-0 border-t px-3 py-2 text-xs text-muted-foreground">{matches.length > options.length ? t('Picker.Refine') : t('Picker.Keyboard')}</div>
                </PopoverContent>
            </Popover>
        </ScopeContext.Provider>
    );
}
