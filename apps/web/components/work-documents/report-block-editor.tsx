'use client';

import { Component, Suspense, createContext, useContext, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { BlockNoteSchema, filterSuggestionItems, type BlockNoteEditor, type DefaultInlineContentSchema } from '@blocknote/core';
import { en, es, ja, zh } from '@blocknote/core/locales';
import { SideMenuExtension } from '@blocknote/core/extensions';
import {
    BasicTextStyleButton,
    BlockTypeSelect,
    CreateLinkButton,
    DragHandleMenu,
    FormattingToolbar,
    FormattingToolbarController,
    RemoveBlockItem,
    SideMenu,
    SideMenuController,
    SuggestionMenuController,
    createReactBlockSpec,
    getDefaultReactSlashMenuItems,
    useBlockNoteEditor,
    useComponentsContext,
    useCreateBlockNote,
    useExtensionState,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import type { ReportEvidenceGroup, WorkDocumentContent, WorkVisual } from '@dory/shared/types/work-document';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import { reconcileReportEvidenceGroups } from '@/lib/work-documents/evidence-groups';
import { reportBlocksFromMdx, reportBlocksToMdx, type ReportBlockSchema, type ReportStyleSchema } from '@/lib/work-documents/report-blocks';
import { reportSourceBlockConfig, reportStyleSpecs, reportTextBlockSpecs, reportVisualBlockConfig } from '@/lib/work-documents/report-block-schema';
import { ReportVisual } from './report-body';
import { ReportEvidenceDialog } from './report-evidence-editor';
import '@blocknote/shadcn/style.css';

export type ReportBlockEditorHandle = {
    requestLeave: () => boolean;
    resetInsertionAnchor: () => void;
    insertVisual: (visual: WorkVisual, visuals: WorkVisual[]) => void;
};
type ReportEditor = BlockNoteEditor<ReportBlockSchema, DefaultInlineContentSchema, ReportStyleSchema>;
type Block = ReportEditor['document'][number];
const groupLinkPrefix = 'dory://evidence-group/';
function evidenceTarget(block?: Block) {
    if (!block || !(block.type === 'paragraph' || block.type === 'quote' || block.type === 'bulletListItem' || block.type === 'numberedListItem')) return;
    const prose = block.content.filter(item => item.type !== 'link' || !item.href.startsWith(groupLinkPrefix));
    const text = prose
        .map(item => (item.type === 'text' ? item.text : item.content.map(span => span.text).join('')))
        .join('')
        .trim();
    if (!text) return;
    const marker = block.content.find(item => item.type === 'link' && item.href.startsWith(groupLinkPrefix));
    return { blockId: block.id, text, groupId: marker?.type === 'link' ? marker.href.slice(groupLinkPrefix.length) : undefined, prose };
}
type EvidenceTarget = NonNullable<ReturnType<typeof evidenceTarget>>;
type Context = { content: WorkDocumentContent; edit: (visual: WorkVisual) => void; source: () => void; manageEvidence: (target: EvidenceTarget) => void };
const ReportContext = createContext<Context | null>(null);
const VisualBlock = createReactBlockSpec(reportVisualBlockConfig, {
    render: function ReportVisualBlock({ block }) {
        const context = useContext(ReportContext)!;
        const t = useTranslations('WorkDocuments.BlockEditor');
        const visual = context.content.visuals.find(item => item.id === block.props.visualId);
        const evidence = context.content.evidence.find(item => item.artifactId === visual?.evidenceId);
        return (
            <div className="w-full min-w-0" contentEditable={false}>
                {visual && evidence ? (
                    <Suspense fallback={<p role="status">{visual.title}</p>}>
                        <ReportVisual visual={visual} evidence={evidence} onEditComponent={() => context.edit(visual)} />
                    </Suspense>
                ) : visual ? (
                    <Button variant="outline" onClick={() => context.edit(visual)}>
                        {t('Configure', { title: visual.title })}
                    </Button>
                ) : (
                    <p role="alert">{t('SourceOnly')}</p>
                )}
            </div>
        );
    },
});
const SourceBlock = createReactBlockSpec(reportSourceBlockConfig, {
    render: function ReportSourceBlock({ block }) {
        const context = useContext(ReportContext)!;
        const t = useTranslations('WorkDocuments.BlockEditor');
        return (
            <div contentEditable={false} className="w-full rounded border bg-muted p-3 text-sm">
                <p className="text-muted-foreground">{t('SourceOnly')}</p>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap">{block.props.source}</pre>
                <Button size="sm" variant="outline" onClick={context.source}>
                    {t('OpenSource')}
                </Button>
            </div>
        );
    },
});
const schema = BlockNoteSchema.create({
    blockSpecs: {
        ...reportTextBlockSpecs,
        reportVisual: VisualBlock(),
        reportSource: SourceBlock(),
    },
    styleSpecs: reportStyleSpecs,
});
const dictionaries = { en, es, ja, zh };
function BlockActions() {
    const editor = useBlockNoteEditor<ReportBlockSchema, DefaultInlineContentSchema, ReportStyleSchema>();
    const components = useComponentsContext()!;
    const t = useTranslations('WorkDocuments.BlockEditor');
    const block = useExtensionState(SideMenuExtension, { editor, selector: state => state?.block });
    const { manageEvidence } = useContext(ReportContext)!;
    const evidenceT = useTranslations('WorkDocuments.Evidence');
    const target = block && evidenceTarget(editor.getBlock(block.id));
    return (
        <DragHandleMenu>
            {target && <components.Generic.Menu.Item onClick={() => manageEvidence(target)}>{evidenceT('Manage')}</components.Generic.Menu.Item>}
            <components.Generic.Menu.Item
                onClick={() => {
                    if (block) editor.moveBlocksUp(block.id);
                }}
            >
                {t('MoveUp')}
            </components.Generic.Menu.Item>
            <components.Generic.Menu.Item
                onClick={() => {
                    if (block) editor.moveBlocksDown(block.id);
                }}
            >
                {t('MoveDown')}
            </components.Generic.Menu.Item>
            <RemoveBlockItem>{t('Delete')}</RemoveBlockItem>
        </DragHandleMenu>
    );
}
function ReportSideMenu() {
    return <SideMenu dragHandleMenu={BlockActions} />;
}
function ReportFormattingToolbar() {
    return (
        <FormattingToolbar>
            <BlockTypeSelect />
            {(['bold', 'italic', 'strike', 'code'] as const).map(style => (
                <BasicTextStyleButton key={style} basicTextStyle={style} />
            ))}
            <CreateLinkButton />
        </FormattingToolbar>
    );
}
type ReportBlockEditorProps = {
    ref?: Ref<ReportBlockEditorHandle>;
    content: WorkDocumentContent;
    documentId?: string;
    displayEvidence: WorkDocumentContent['evidence'];
    onEvidenceChange: (content: WorkDocumentContent) => void;
    onChange: (body: string, visuals?: WorkVisual[]) => void;
    onInsert: (type: WorkVisual['type']) => void;
    onEdit: (visual: WorkVisual) => void;
    onSource: () => void;
};

class BlockEditorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}

export default function ReportBlockEditor(props: ReportBlockEditorProps) {
    const t = useTranslations('WorkDocuments.BlockEditor');
    return (
        <BlockEditorBoundary
            fallback={
                <div role="alert" className="space-y-3 rounded border bg-muted p-4 text-sm">
                    <p>{t('InitializationFailed')}</p>
                    <Button variant="outline" size="sm" onClick={props.onSource}>
                        {t('OpenSource')}
                    </Button>
                </div>
            }
        >
            <ReportBlockEditorSurface {...props} />
        </BlockEditorBoundary>
    );
}

function ReportBlockEditorSurface({ ref, content, documentId, displayEvidence, onChange, onEvidenceChange, onInsert, onEdit, onSource }: ReportBlockEditorProps) {
    const t = useTranslations('WorkDocuments.BlockEditor');
    const evidenceT = useTranslations('WorkDocuments.Evidence');
    const locale = useLocale();
    const { resolvedTheme } = useTheme();
    const latest = useRef({ content, onChange });
    latest.current = { content, onChange };
    const lastBody = useRef(content.body ?? '');
    const [initial] = useState(() => reportBlocksFromMdx(content.body ?? '', content.visuals));
    const projection = useRef(initial);
    const anchor = useRef<string | null>(null);
    const [error, setError] = useState('');
    const [menuTarget, setMenuTarget] = useState<EvidenceTarget>();
    const [editingEvidence, setEditingEvidence] = useState<EvidenceTarget>();
    const [evidenceError, setEvidenceError] = useState('');
    const manageEvidence = (target: EvidenceTarget) => {
        setEvidenceError('');
        setEditingEvidence(target);
    };
    const editor: ReportEditor = useCreateBlockNote({
        schema,
        trailingBlock: false,
        initialContent: initial.blocks,
        dictionary: dictionaries[locale as keyof typeof dictionaries] ?? en,
        tables: { splitCells: false, cellBackgroundColor: false, cellTextColor: false, headers: false },
        links: { onClick: () => {}, isValidLink: href => /^(https?:\/\/|mailto:|#|dory:\/\/(?:evidence|evidence-group)\/[a-zA-Z0-9_-]+$)/i.test(href) },
        domAttributes: { editor: { role: 'textbox', 'aria-label': t('Body'), 'aria-multiline': 'true' } },
    });
    useEffect(
        () =>
            editor.onChange(() => {
                try {
                    const body = reportBlocksToMdx(editor.document, projection.current, latest.current.content.visuals);
                    setError('');
                    if (body === lastBody.current) return;
                    lastBody.current = body;
                    latest.current.onChange(body, latest.current.content.visuals);
                } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            }),
        [editor],
    );
    // ReportEditor remounts the surface for Source edits. Save acknowledgements
    // update metadata only; never replace the document, caret or undo history.
    useImperativeHandle(
        ref,
        () => ({
            requestLeave: () => !error,
            resetInsertionAnchor: () => {
                anchor.current = null;
            },
            insertVisual: (visual, visuals) => {
                latest.current = { ...latest.current, content: { ...latest.current.content, visuals } };
                const target = anchor.current && editor.getBlock(anchor.current) ? anchor.current : editor.getTextCursorPosition().block.id;
                editor.insertBlocks([{ type: 'reportVisual', props: { visualId: visual.id } }], target, 'after');
                anchor.current = null;
            },
        }),
        [editor, error],
    );
    const applyEvidence = (references: ReportEvidenceGroup['references'], reviewed: boolean) => {
        if (!editingEvidence) return;
        const target = evidenceTarget(editor.getBlock(editingEvidence.blockId));
        if (!target || target.groupId !== editingEvidence.groupId) {
            setEvidenceError(evidenceT('FixBodyFirst'));
            return;
        }
        try {
            const next = editor.transact(() => {
                const id = target.groupId ?? `evidence_${crypto.randomUUID().replaceAll('-', '')}`;
                if (references.length && !target.groupId) {
                    editor.updateBlock(target.blockId, { content: [...target.prose, ' ', { type: 'link', href: groupLinkPrefix + id, content: 'Evidence' }] });
                } else if (!references.length && target.groupId) {
                    editor.updateBlock(target.blockId, { content: target.prose });
                }
                const body = reportBlocksToMdx(editor.document, projection.current, content.visuals);
                const groups = (content.evidenceGroups ?? []).filter(group => group.id !== id);
                if (references.length) groups.push({ id, references });
                const reviewedIds = (content.reviewedEvidenceGroupIds ?? []).filter(groupId => groupId !== id);
                if (reviewed && references.length) reviewedIds.push(id);
                const evidenceGroups = reconcileReportEvidenceGroups(content, body, groups, reviewedIds);
                // The block change event must not emit a second draft without the new references.
                lastBody.current = body;
                return { ...content, body, evidenceGroups, reviewedEvidenceGroupIds: reviewedIds };
            });
            onEvidenceChange(next);
            setEditingEvidence(undefined);
        } catch (err) {
            setEvidenceError(err instanceof Error ? err.message : String(err));
        }
    };
    const items = () => [
        ...getDefaultReactSlashMenuItems(editor),
        ...(['metric', 'chart', 'table'] as const).map(type => ({
            title: t(type),
            group: t('InsertBlock'),
            onItemClick: () => {
                anchor.current = editor.getTextCursorPosition().block.id;
                onInsert(type);
            },
        })),
    ];
    return (
        <ReportContext.Provider value={{ content: { ...content, evidence: displayEvidence }, edit: onEdit, source: onSource, manageEvidence }}>
            <div data-testid="report-block-editor" className="report-blocknote min-w-0 space-y-3">
                <div role="toolbar" aria-label={t('Formatting')} className="flex flex-wrap gap-1 border-b pb-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            editor.undo();
                            editor.focus();
                        }}
                    >
                        {t('Undo')}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            editor.redo();
                            editor.focus();
                        }}
                    >
                        {t('Redo')}
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" size="sm" variant="ghost">
                                {t('InsertBlock')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            {items().map(item => (
                                <DropdownMenuItem key={item.title} onSelect={item.onItemClick}>
                                    {item.title}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu onOpenChange={open => open && setMenuTarget(evidenceTarget(editor.getTextCursorPosition().block))}>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" size="sm" variant="ghost">
                                {t('BlockActions')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            {menuTarget && <DropdownMenuItem onSelect={() => manageEvidence(menuTarget)}>{evidenceT('Manage')}</DropdownMenuItem>}
                            <DropdownMenuItem onSelect={() => editor.moveBlocksUp()}>{t('MoveUp')}</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => editor.moveBlocksDown()}>{t('MoveDown')}</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => editor.removeBlocks([editor.getTextCursorPosition().block])}>{t('Delete')}</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                <BlockNoteView editor={editor} theme={resolvedTheme === 'dark' ? 'dark' : 'light'} formattingToolbar={false} sideMenu={false} slashMenu={false}>
                    <FormattingToolbarController formattingToolbar={ReportFormattingToolbar} />
                    {/* Closing animations clone inert menu HTML; remove it immediately when the report scrolls. */}
                    <SideMenuController sideMenu={ReportSideMenu} floatingUIOptions={{ useTransitionStylesProps: { duration: 0 }, useTransitionStatusProps: { duration: 0 } }} />
                    <SuggestionMenuController triggerCharacter="/" getItems={async query => filterSuggestionItems(items(), query)} />
                </BlockNoteView>
            </div>
            {editingEvidence && (
                <ReportEvidenceDialog
                    content={content}
                    text={editingEvidence.text}
                    groupId={editingEvidence.groupId}
                    error={evidenceError}
                    documentId={documentId}
                    onClose={() => setEditingEvidence(undefined)}
                    onApply={applyEvidence}
                />
            )}
        </ReportContext.Provider>
    );
}
