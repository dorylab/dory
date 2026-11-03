'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { ReportCanvasBlock, ReportWorkingState } from '@dory/shared/types/report-workspace';
import type { WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { SelectItem } from '@/registry/new-york-v4/ui/select';
import { GripVertical, MoreHorizontal, Maximize2, Minimize2, PanelRightClose, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { parseReport } from '@/lib/work-documents/report-core';
import { withReportCanvas } from '@/lib/work-documents/report-canvas';
import { reportDraftChanges, validateWorkingVisual, type ReportDraftOperation } from '@/lib/work-documents/working-draft';
import { chartFields, remapChartFields } from '@/lib/work-documents/workspace-presentation';

import { ReportBlockView } from './report-body';
import type { ReportCanvasSource, ReportDropTarget } from './report-canvas-dnd';
import { ReportSelect } from './report-select';

type CanvasProps = {
    state: ReportWorkingState;
    source?: ReportCanvasSource;
    draggingBlock?: string;
    selectedId: string;
    onSelect: (id: string) => void;
    onPlace: (target: ReportDropTarget) => void;
    onCancel: () => void;
    onOperation: (operation: ReportDraftOperation) => void;
    busy: boolean;
    error?: string;
    notice?: string;
    onClose: () => void;
    expanded: boolean;
    onExpand: () => void;
};
function Gap({
    id,
    target,
    active,
    busy,
    onPlace,
    empty = false,
}: {
    id: string;
    target: ReportDropTarget;
    active: boolean;
    busy: boolean;
    onPlace: CanvasProps['onPlace'];
    empty?: boolean;
}) {
    const t = useTranslations('WorkDocuments.ConnectedWorkspace');
    const { setNodeRef, isOver } = useDroppable({ id: `gap:${id}`, data: { target }, disabled: busy || !active });
    return (
        <div ref={setNodeRef} data-drop-gap={id} className={empty ? 'p-4' : active ? 'h-9 py-1' : 'h-3'}>
            <button
                type="button"
                disabled={!active || busy}
                onClick={() => onPlace(target)}
                aria-label={t('InsertHere')}
                className={`flex w-full items-center justify-center gap-2 rounded text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring ${empty ? 'min-h-40 border border-dashed p-4' : 'h-full'} ${isOver ? 'bg-primary text-primary-foreground' : active ? 'border border-dashed border-primary/50 text-primary hover:bg-accent' : 'text-muted-foreground'}`}
            >
                {(active || empty) && (
                    <>
                        <Plus className="size-3" />
                        {t(empty ? 'DropEmpty' : 'InsertHere')}
                    </>
                )}
            </button>
        </div>
    );
}
function CanvasBlock({
    block,
    index,
    blocks,
    props,
    onDetails,
    change,
    definitions,
}: {
    block: ReportCanvasBlock;
    index: number;
    blocks: ReportCanvasBlock[];
    props: CanvasProps;
    onDetails: (id: string) => void;
    change?: ReturnType<typeof reportDraftChanges>[number];
    definitions: string;
}) {
    const t = useTranslations('WorkDocuments.ConnectedWorkspace');
    const { state, source, busy, onPlace, onOperation } = props;
    const visual = state.content.visuals.find(item => item.id === block.visualId);
    const accepts = Boolean(source && visual && (source.chartSpec ? visual.type === 'chart' : ['table', 'chart'].includes(visual.type)));
    const drag = useDraggable({ id: `report-block:${block.id}`, data: { item: { kind: 'block', blockId: block.id, title: block.title } }, disabled: busy || Boolean(source) });
    const drop = useDroppable({ id: `replace:${block.id}`, data: { target: { kind: 'replace', blockId: block.id } }, disabled: busy || !accepts || Boolean(props.draggingBlock) });
    const [renaming, setRenaming] = useState(false);
    const [title, setTitle] = useState('');
    const submitTitle = () => {
        if (title.trim() && title.trim() !== visual?.title) onOperation({ type: 'rename', blockId: block.id, title });
        setRenaming(false);
    };
    return (
        <article
            ref={node => {
                drag.setNodeRef(node);
                drop.setNodeRef(node);
            }}
            data-canvas-block={block.id}
            aria-label={block.title}
            className={`group/block relative min-w-0 rounded-md border p-3 transition-colors ${drag.isDragging ? 'opacity-40' : ''} ${drop.isOver ? 'border-primary bg-accent ring-2 ring-ring' : props.selectedId === block.id ? 'border-primary/50' : 'border-transparent hover:border-border focus-within:border-border'}`}
        >
            {change && <span className="absolute right-3 top-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">{t(change.type)}</span>}
            <div className="absolute -top-3 right-2 z-10 flex h-7 items-center gap-1 rounded border bg-card shadow-sm opacity-0 transition-opacity group-hover/block:opacity-100 group-focus-within/block:opacity-100">
                <Button
                    ref={drag.setActivatorNodeRef}
                    {...drag.listeners}
                    {...drag.attributes}
                    variant="ghost"
                    size="icon"
                    className="size-7 cursor-grab touch-none"
                    aria-label={t('MoveNamed', { title: block.title })}
                    disabled={busy || Boolean(source)}
                >
                    <GripVertical className="size-4" />
                </Button>
                {change && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{t(change.type)}</span>}
                <div className="flex-1" />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7" aria-label={t('BlockActions')} disabled={busy}>
                            <MoreHorizontal className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            disabled={index === 0}
                            onSelect={() => onOperation({ type: 'move', blockId: block.id, anchorId: blocks[index - 1].id, position: 'before' })}
                        >
                            {t('MoveUp')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            disabled={index === blocks.length - 1}
                            onSelect={() => onOperation({ type: 'move', blockId: block.id, anchorId: blocks[index + 1].id, position: 'after' })}
                        >
                            {t('MoveDown')}
                        </DropdownMenuItem>
                        {visual && (
                            <DropdownMenuItem
                                onSelect={() => {
                                    setTitle(visual.title);
                                    setRenaming(true);
                                }}
                            >
                                {t('RenameTitle')}
                            </DropdownMenuItem>
                        )}
                        {visual && <DropdownMenuItem onSelect={() => onDetails(block.id)}>{t('SourceDetails')}</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => onOperation({ type: 'remove', blockId: block.id })}>{t('Remove')}</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {renaming ? (
                <form
                    className="mb-3 flex gap-2"
                    onSubmit={event => {
                        event.preventDefault();
                        submitTitle();
                    }}
                >
                    <Input
                        autoFocus
                        aria-label={t('Title')}
                        value={title}
                        maxLength={300}
                        onChange={event => setTitle(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Escape') setRenaming(false);
                        }}
                    />
                    <Button size="sm" type="submit" disabled={!title.trim()}>
                        {t('SaveTitle')}
                    </Button>
                </form>
            ) : null}
            <div onClick={() => props.onSelect(block.id)}>
                <ReportBlockView block={block} content={state.content} definitions={definitions} onEvidenceGroup={id => onDetails(`finding:${id}`)} />
            </div>
            {accepts && !props.draggingBlock && (
                <button
                    type="button"
                    onClick={() => onPlace({ kind: 'replace', blockId: block.id })}
                    className={`absolute inset-0 flex items-center justify-center rounded-md border-2 border-dashed text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring ${drop.isOver ? 'border-primary bg-background/90 text-primary' : 'border-primary/30 bg-background/60 text-foreground'}`}
                >
                    {t(visual?.type === 'chart' ? 'UpdateChart' : 'UpdateTable')}
                </button>
            )}
        </article>
    );
}
export function ReportCanvas(props: CanvasProps) {
    const t = useTranslations('WorkDocuments.ConnectedWorkspace');
    const state = useMemo(() => withReportCanvas(props.state), [props.state]);
    const blocks = state.canvas.blocks;
    const changes = useMemo(() => new Map(reportDraftChanges(state).map(item => [item.id, item])), [state]);
    const definitions = useMemo(
        () =>
            parseReport(state.content.body ?? '', state.content.visuals)
                .tree?.children.filter(node => node.type === 'definition')
                .map(node => (state.content.body ?? '').slice(node.position?.start.offset, node.position?.end.offset))
                .join('\n') ?? '',
        [state.content],
    );
    const scroll = useRef<HTMLDivElement>(null);
    const [detail, setDetail] = useState<string>();
    useEffect(() => {
        const target = Array.from(scroll.current?.querySelectorAll<HTMLElement>('[data-canvas-block]') ?? []).find(element => element.dataset.canvasBlock === props.selectedId);
        target?.scrollIntoView({ block: 'nearest' });
    }, [props.selectedId]);
    const visual = state.content.visuals.find(item => item.id === detail);
    const finding = detail?.startsWith('finding:') ? state.content.evidenceGroups?.find(group => group.id === detail.slice(8)) : undefined;
    const evidence = state.content.evidence.filter(item => item.artifactId === visual?.evidenceId || finding?.references.some(ref => ref.artifactId === item.artifactId));
    const active = Boolean(props.source || props.draggingBlock);
    return (
        <section aria-label={t('Report')} data-testid="report-canvas" className="flex h-full min-h-0 flex-col bg-card">
            <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                <h2 className="flex-1 text-sm font-semibold">{t('ReportDraft')}</h2>
                <Button variant="ghost" size="icon" className="size-7" onClick={props.onExpand} aria-label={t(props.expanded ? 'CollapsePreview' : 'ExpandCanvas')}>
                    {props.expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={props.onClose} aria-label={t('CollapsePanel')}>
                    <PanelRightClose className="size-4" />
                </Button>
            </header>
            {props.source && (
                <div className="flex shrink-0 items-center gap-2 border-b bg-accent/40 p-3 text-xs">
                    <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{props.source.title}</p>
                        <p>{t('ChooseCanvasPosition')}</p>
                    </div>
                    <Button variant="ghost" size="sm" disabled={props.busy} onClick={props.onCancel}>
                        {t('CancelPlacement')}
                    </Button>
                </div>
            )}
            {props.busy && (
                <p role="status" className="border-b p-2 text-xs">
                    {t('Applying')}
                </p>
            )}
            {props.notice && (
                <p role="status" className="border-b px-3 py-2 text-xs">
                    {props.notice}
                </p>
            )}
            {state.canvas.undo && (
                <div className="flex justify-end border-b px-3">
                    <Button variant="ghost" size="sm" disabled={props.busy} onClick={() => props.onOperation({ type: 'undo' })}>
                        {t('Undo')}
                    </Button>
                </div>
            )}
            {props.error && (
                <p role="alert" className="border-b p-3 text-sm text-destructive">
                    {props.error}
                </p>
            )}
            <div ref={scroll} className="report-canvas report-surface work-prose min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-8" data-testid="report-canvas-scroll">
                {!blocks.length && <Gap id="root" target={{ kind: 'gap', anchorId: 'root', position: 'end' }} active={active} busy={props.busy} onPlace={props.onPlace} empty />}
                {blocks.map((block, index) => (
                    <div key={block.id}>
                        <Gap id={`before:${block.id}`} target={{ kind: 'gap', anchorId: block.id, position: 'before' }} active={active} busy={props.busy} onPlace={props.onPlace} />
                        <CanvasBlock
                            block={block}
                            index={index}
                            blocks={blocks}
                            props={{ ...props, state }}
                            onDetails={setDetail}
                            change={changes.get(block.id)}
                            definitions={definitions}
                        />
                    </div>
                ))}
                {blocks.length > 0 && (
                    <Gap id="end" target={{ kind: 'gap', anchorId: blocks.at(-1)!.id, position: 'after' }} active={active} busy={props.busy} onPlace={props.onPlace} />
                )}
            </div>
            <Dialog
                open={Boolean(detail)}
                onOpenChange={open => {
                    if (!open) setDetail(undefined);
                }}
            >
                <DialogContent className="max-h-[80vh] overflow-auto">
                    <DialogHeader>
                        <DialogTitle>{visual?.title ?? t('SourceDetails')}</DialogTitle>
                        <DialogDescription>{t('SourceDetails')}</DialogDescription>
                    </DialogHeader>
                    {evidence.map(item => (
                        <div key={item.artifactId} className="space-y-2 text-sm">
                            <h3>{item.title}</h3>
                            <p className="text-muted-foreground">
                                {item.connectionName} · {item.capturedAt} · {t('RowCount', { count: item.rowCount ?? item.rows.length })}
                            </p>
                            <pre className="whitespace-pre-wrap text-xs">{item.sql}</pre>
                            <details>
                                <summary>{t('SourceDetails')}</summary>
                                <p className="break-all text-xs">{item.artifactId}</p>
                            </details>
                        </div>
                    ))}
                </DialogContent>
            </Dialog>
        </section>
    );
}

export type CanvasReplacement = { source: ReportCanvasSource; evidence: WorkEvidence; target: WorkVisual; fields: Record<string, string> };
export function ReportReplacementDialog({
    pending,
    onChange,
    onApply,
    busy,
    error,
}: {
    pending?: CanvasReplacement;
    onChange: (value?: CanvasReplacement) => void;
    onApply: () => void;
    busy: boolean;
    error?: string;
}) {
    const t = useTranslations('WorkDocuments.ConnectedWorkspace');
    const w = useTranslations('WorkDocuments.Workspace');
    if (!pending) return null;
    const base = pending.source.chartSpec ? { ...pending.target, chart: undefined, chartSpec: pending.source.chartSpec } : pending.target;
    const candidate = remapChartFields(base, pending.fields);
    let invalid = false;
    try {
        validateWorkingVisual(candidate, pending.evidence);
    } catch {
        invalid = true;
    }
    const fields = chartFields(base);
    const missing = chartFields(candidate).filter(key => !pending.evidence.columns.includes(key));
    return (
        <Dialog
            open
            onOpenChange={open => {
                if (!open && !busy) onChange(undefined);
            }}
        >
            <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t(pending.target.type === 'chart' ? 'UpdateChart' : 'UpdateTable')}</DialogTitle>
                    <DialogDescription>{t(pending.source.chartSpec ? 'ReplaceChartSettings' : 'KeepChartSettings')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 rounded border bg-muted/20 p-3 text-sm">
                    <div>
                        <p className="text-xs text-muted-foreground">{t('UsingResult')}</p>
                        <p>
                            {pending.source.tabTitle} / {pending.source.resultLabel}
                        </p>
                        <p className="text-xs">
                            {pending.source.sourceLabel} · {t('RowCount', { count: pending.evidence.rowCount ?? pending.evidence.rows.length })}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">{t('UpdateLocation')}</p>
                        <p>{pending.target.title}</p>
                    </div>
                </div>
                {(invalid || Object.keys(pending.fields).length > 0) && (
                    <div className="space-y-2">
                        <p role="alert" className="text-sm text-destructive">
                            {invalid ? (missing.length ? t('MissingFields', { fields: missing.join(', ') }) : t('InvalidFields')) : t('FieldMapping')}
                        </p>
                        {fields.map(field => (
                            <label key={field} className="block space-y-1 text-xs">
                                <span>{field}</span>
                                <ReportSelect
                                    aria-label={t('MapField', { field })}
                                    value={pending.fields[field] ?? (pending.evidence.columns.includes(field) ? field : '')}
                                    onValueChange={value => onChange({ ...pending, fields: { ...pending.fields, [field]: value } })}
                                >
                                    <SelectItem value="__none">{t('ChooseField')}</SelectItem>
                                    {pending.evidence.columns.map(column => (
                                        <SelectItem key={column} value={column}>
                                            {column}
                                        </SelectItem>
                                    ))}
                                </ReportSelect>
                            </label>
                        ))}
                    </div>
                )}
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={() => onChange(undefined)}>
                        {w('Cancel')}
                    </Button>
                    <Button disabled={busy || invalid} onClick={onApply}>
                        {t(pending.target.type === 'chart' ? 'UpdateChart' : 'UpdateTable')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
