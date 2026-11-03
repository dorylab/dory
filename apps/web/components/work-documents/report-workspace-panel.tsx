'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { SelectItem } from '@/registry/new-york-v4/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { ReportWorkingState } from '@dory/shared/types/report-workspace';
import type { WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import type { WorkspaceChartSpec } from '@dory/shared/types/workspace-chart';
import { ArrowLeft, BarChart3, ChevronRight, FileText, Lightbulb, MoreHorizontal, PanelRightClose, Table2, Hash } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { reportOutline } from '@/lib/work-documents/report-core';
import { reportDraftChanges, validateWorkingVisual } from '@/lib/work-documents/working-draft';
import {
    chartFields,
    flattenReportStructure,
    remapChartFields,
    reportNodePath,
    reportStructure,
    sameChartSpec,
    type ReportStructureNode,
} from '@/lib/work-documents/workspace-presentation';

import { ReportSelect } from './report-select';

export type PendingReportOperation = {
    type: 'insert' | 'replace';
    resultId: string;
    evidence: WorkEvidence;
    tabTitle: string;
    resultLabel: string;
    chartSpec?: WorkspaceChartSpec;
    title: string;
    targets: string[];
    sectionId: string;
    anchorId: string;
    position: 'before' | 'after' | 'end';
    fieldMappings: Record<string, Record<string, string>>;
};

function ItemLabel({ node }: { node: ReportStructureNode }) {
    const t = useTranslations('WorkDocuments.ConnectedWorkspace');
    const Icon = node.kind === 'chart' ? BarChart3 : node.kind === 'table' ? Table2 : node.kind === 'metric' ? Hash : node.kind === 'finding' ? Lightbulb : FileText;
    return (
        <>
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{node.title || t('Paragraph')}</span>
        </>
    );
}

function StructureChildren({
    node,
    selectedId,
    originId,
    changes,
    onSelect,
}: {
    node: ReportStructureNode;
    selectedId: string;
    originId?: string;
    changes: ReturnType<typeof reportDraftChanges>;
    onSelect: (id: string) => void;
}) {
    const t = useTranslations('WorkDocuments.ConnectedWorkspace');
    const chunks: Array<ReportStructureNode | ReportStructureNode[]> = [];
    for (const child of node.children) {
        const last = chunks.at(-1);
        if (child.kind === 'text') {
            if (Array.isArray(last)) last.push(child);
            else chunks.push([child]);
        } else chunks.push(child);
    }
    return (
        <ul className="space-y-0.5">
            {chunks.map(chunk => {
                if (Array.isArray(chunk))
                    return (
                        <li key={chunk[0].id}>
                            <details className="group/text text-sm">
                                <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-2 py-1.5 text-muted-foreground hover:bg-accent focus-visible:outline-ring focus-visible:outline-2">
                                    <ChevronRight className="size-3 shrink-0 group-open/text:rotate-90" aria-hidden />
                                    {t('TextCount', { count: chunk.length })}
                                </summary>
                                <ul className="ml-3 border-l pl-2">
                                    {chunk.map(item => (
                                        <li key={item.id}>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelect(item.id)}
                                                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-ring focus-visible:outline-2"
                                                        title={item.title}
                                                    >
                                                        <ItemLabel node={item} />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-sm">{item.title}</TooltipContent>
                                            </Tooltip>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        </li>
                    );
                if (chunk.kind === 'section')
                    return (
                        <li key={chunk.id}>
                            <details open data-section-id={chunk.id} className="group/section">
                                <summary
                                    className="flex cursor-pointer list-none items-center gap-2 rounded px-2 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-ring focus-visible:outline-2"
                                    title={chunk.title}
                                >
                                    <ChevronRight className="size-3 shrink-0 group-open/section:rotate-90" aria-hidden />
                                    <span className="truncate">{chunk.title}</span>
                                </summary>
                                <div className="ml-3 border-l pl-2">
                                    <StructureChildren node={chunk} selectedId={selectedId} originId={originId} changes={changes} onSelect={onSelect} />
                                </div>
                            </details>
                        </li>
                    );
                const id = chunk.visualId ?? chunk.id;
                const change = changes.find(item => item.id === id);
                return (
                    <li key={chunk.id}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    data-outline-id={id}
                                    aria-current={selectedId === id ? 'true' : undefined}
                                    onClick={() => onSelect(id)}
                                    title={chunk.title}
                                    className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm focus-visible:outline-ring focus-visible:outline-2 ${selectedId === id ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-accent'}`}
                                >
                                    <ItemLabel node={chunk} />
                                    {id === originId && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{t('Origin')}</span>}
                                    {change && <span className="shrink-0 rounded bg-muted px-1 text-[10px]">{t(change.type)}</span>}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">{chunk.title}</TooltipContent>
                        </Tooltip>
                    </li>
                );
            })}
        </ul>
    );
}

export function ReportWorkspacePanel({
    state,
    pending,
    onPendingChange,
    selectedId,
    originId,
    onSelect,
    view,
    onViewChange,
    onClose,
    onSubmit,
    onUpdate,
    onRemove,
    onRevert,
    hasResult,
    busy,
    error,
    feedback,
}: {
    state: ReportWorkingState;
    pending?: PendingReportOperation;
    onPendingChange: (value: PendingReportOperation | undefined) => void;
    selectedId: string;
    originId?: string;
    onSelect: (id: string) => void;
    view: string;
    onViewChange: (view: string) => void;
    onClose: () => void;
    onSubmit: () => void;
    onUpdate: (id: string) => void;
    onRemove: (id: string) => void;
    onRevert: (id: string) => void;
    hasResult: boolean;
    busy: boolean;
    error?: string;
    feedback?: { blockId: string; message: string };
}) {
    const t = useTranslations('WorkDocuments.ConnectedWorkspace');
    const w = useTranslations('WorkDocuments.Workspace');
    const format = useFormatter();
    const tree = useMemo(() => reportStructure(state.content), [state.content]);
    const nodes = useMemo(() => flattenReportStructure(tree), [tree]);
    const navigationTree = { ...tree, children: tree.children.flatMap(node => (node.kind === 'section' && node.title === state.title ? node.children : [node])) };
    const outline = useMemo(() => reportOutline(state.content.body ?? '', state.content.visuals), [state.content]);
    const baselineNodes = useMemo(() => (state.baseline ? flattenReportStructure(reportStructure(state.baseline.content)) : []), [state.baseline]);
    const changes = reportDraftChanges(state);
    const scroll = useRef<HTMLDivElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const pendingResultId = pending?.resultId;
    const pendingType = pending?.type;
    useEffect(() => {
        if (pendingResultId) heading.current?.focus();
    }, [pendingResultId, pendingType]);
    const [bulk, setBulk] = useState(false);
    const [showText, setShowText] = useState(false);
    const selected = state.content.visuals.find(item => item.id === selectedId);
    const selectedNode = nodes.find(item => item.visualId === selectedId || item.id === selectedId);
    const selectedEvidence = state.content.evidence.find(item => item.artifactId === selected?.evidenceId);
    const finding = state.content.evidenceGroups?.find(group => group.id === selectedNode?.groupId);
    useEffect(() => {
        if (pending || view !== 'outline') return;
        const item = Array.from(scroll.current?.querySelectorAll<HTMLElement>('[data-outline-id]') ?? []).find(element => element.dataset.outlineId === selectedId);
        if (!item) return;
        let ancestor = item.parentElement;
        while (ancestor && ancestor !== scroll.current) {
            if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
            ancestor = ancestor.parentElement;
        }
        item.scrollIntoView({ block: 'nearest' });
    }, [pending, selectedId, view]);
    useEffect(() => {
        setBulk(false);
        setShowText(false);
    }, [pending?.resultId, pending?.type]);

    const eligible = state.content.visuals.filter(item => (pending?.chartSpec ? item.type === 'chart' : ['chart', 'table'].includes(item.type)));
    const targets = pending?.targets.flatMap(id => eligible.filter(item => item.id === id)) ?? [];
    const candidate = (visual: WorkVisual) =>
        remapChartFields(pending?.chartSpec ? { ...visual, chart: undefined, chartSpec: pending.chartSpec } : visual, pending?.fieldMappings[visual.id] ?? {});
    const checks = targets.map(visual => {
        const next = candidate(visual);
        let invalid = false;
        try {
            validateWorkingVisual(next, pending!.evidence);
        } catch {
            invalid = true;
        }
        return { visual, invalid, missing: chartFields(next).filter(key => !pending!.evidence.columns.includes(key)) };
    });
    let insertInvalid = false;
    if (pending?.type === 'insert') {
        try {
            validateWorkingVisual(
                { id: '', type: pending.chartSpec ? 'chart' : 'table', title: pending.title, evidenceId: pending.evidence.artifactId, chartSpec: pending.chartSpec },
                pending.evidence,
            );
        } catch {
            insertInvalid = true;
        }
    }
    const alreadyApplied =
        pending?.type === 'replace' &&
        targets.length > 0 &&
        targets.every(visual => {
            const next = candidate(visual);
            return (
                visual.evidenceId === pending.evidence.artifactId && sameChartSpec(next.chartSpec, visual.chartSpec) && JSON.stringify(next.chart) === JSON.stringify(visual.chart)
            );
        });
    const invalid =
        pending?.type === 'replace'
            ? alreadyApplied || !targets.length || targets.length !== pending.targets.length || checks.some(check => check.invalid)
            : insertInvalid || !pending?.title.trim() || !outline.some(item => item.id === pending.anchorId);
    const path = (id: string, items = nodes) => reportNodePath(items, id).join(' → ') || t('ReportBody');
    const date = (value: string) => (value && Number.isFinite(Date.parse(value)) ? format.dateTime(new Date(value), { dateStyle: 'short', timeStyle: 'short' }) : '—');
    const detailEvidence = (evidence: WorkEvidence) => (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{t('DataSource')}</dt>
            <dd className="truncate">{evidence.connectionName ?? t('Attachment')}</dd>
            <dt className="text-muted-foreground">{t('Rows')}</dt>
            <dd>{evidence.rowCount ?? '—'}</dd>
            <dt className="text-muted-foreground">{t('CapturedAt')}</dt>
            <dd>{date(evidence.capturedAt)}</dd>
        </dl>
    );
    return (
        <section aria-label={t('Report')} className="flex h-full min-h-0 flex-col bg-card" data-testid="report-context-panel">
            <header className="shrink-0 border-b p-3">
                <div className="flex items-center justify-between gap-2">
                    <h2 ref={heading} tabIndex={-1} className="text-sm font-semibold outline-none">
                        {pending ? t(pending.type === 'replace' ? 'ConfirmUpdate' : pending.chartSpec ? 'AddChart' : 'AddTable') : t('Report')}
                    </h2>
                    <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label={t('CollapsePanel')}>
                        <PanelRightClose className="size-4" />
                    </Button>
                </div>
                {!pending && (
                    <Tabs value={view} onValueChange={onViewChange} className="mt-2">
                        <TabsList className="w-full">
                            <TabsTrigger value="outline" className="flex-1">
                                {t('Outline')}
                            </TabsTrigger>
                            <TabsTrigger value="changes" className="flex-1">
                                {t('Changes')}
                                {changes.length > 0 ? ` (${changes.length})` : ''}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                )}
            </header>
            {pending ? (
                <>
                    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3" data-testid="report-add-form">
                        <Button size="sm" variant="ghost" onClick={() => onPendingChange(undefined)} disabled={busy}>
                            <ArrowLeft className="size-4" />
                            {t('BackToStructure')}
                        </Button>
                        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                            <p className="text-xs text-muted-foreground">{t('UsingResult')}</p>
                            <p className="break-words text-sm font-medium">
                                {pending.tabTitle} / {pending.resultLabel}
                            </p>
                            {detailEvidence(pending.evidence)}
                            <p className="text-xs text-muted-foreground">{t('PinnedResult')}</p>
                        </div>
                        {pending.type === 'replace' ? (
                            <>
                                <label className="block space-y-2 text-sm">
                                    <span>{t('UpdateLocation')}</span>
                                    <ReportSelect
                                        aria-label={t('UpdateLocation')}
                                        value={pending.targets[0] ?? ''}
                                        disabled={busy}
                                        onValueChange={id => onPendingChange({ ...pending, targets: [id], fieldMappings: {} })}
                                    >
                                        <SelectItem value="__none">{t('ChooseTarget')}</SelectItem>
                                        {eligible.map(item => (
                                            <SelectItem key={item.id} value={item.id}>
                                                {path(item.id)}
                                            </SelectItem>
                                        ))}
                                    </ReportSelect>
                                </label>
                                <p className="text-xs text-muted-foreground">{t(pending.chartSpec ? 'ReplaceChartSettings' : 'KeepChartSettings')}</p>
                                <Button variant="ghost" size="sm" onClick={() => setBulk(!bulk)} aria-expanded={bulk}>
                                    {t('UpdateMore')}
                                </Button>
                                {bulk && (
                                    <div className="space-y-2 rounded border p-2">
                                        {eligible
                                            .filter(item => item.id !== pending.targets[0])
                                            .map(item => (
                                                <label key={item.id} className="flex items-start gap-2 text-sm">
                                                    <Checkbox
                                                        disabled={busy}
                                                        checked={pending.targets.includes(item.id)}
                                                        onCheckedChange={checked =>
                                                            onPendingChange({
                                                                ...pending,
                                                                targets: checked ? [...pending.targets, item.id] : pending.targets.filter(id => id !== item.id),
                                                            })
                                                        }
                                                    />
                                                    {path(item.id)}
                                                </label>
                                            ))}
                                    </div>
                                )}
                                {pending.targets.length > 1 && (
                                    <div className="text-xs">
                                        <p className="font-medium">{t('AffectedCount', { count: targets.length })}</p>
                                        <ul className="mt-1 list-inside list-disc">
                                            {targets.map(item => (
                                                <li key={item.id}>{item.title}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {checks
                                    .filter(check => check.invalid || Object.keys(pending.fieldMappings[check.visual.id] ?? {}).length)
                                    .map(({ visual, missing, invalid: fieldInvalid }) => (
                                        <div key={visual.id} className="space-y-2 rounded border p-3">
                                            <p className="text-sm font-medium">
                                                {visual.title} · {t('FieldMapping')}
                                            </p>
                                            {fieldInvalid && (
                                                <p role="alert" className="text-xs text-destructive">
                                                    {missing.length ? t('MissingFields', { fields: missing.join(', ') }) : t('InvalidFields')}
                                                </p>
                                            )}
                                            {chartFields(pending.chartSpec ? { chartSpec: pending.chartSpec } : visual).map(field => (
                                                <label key={field} className="block space-y-1 text-xs">
                                                    <span>{field}</span>
                                                    <ReportSelect
                                                        aria-label={t('MapField', { field })}
                                                        value={pending.fieldMappings[visual.id]?.[field] ?? (pending.evidence.columns.includes(field) ? field : '')}
                                                        onValueChange={value =>
                                                            onPendingChange({
                                                                ...pending,
                                                                fieldMappings: { ...pending.fieldMappings, [visual.id]: { ...pending.fieldMappings[visual.id], [field]: value } },
                                                            })
                                                        }
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
                                    ))}
                            </>
                        ) : (
                            <>
                                <label className="block space-y-2 text-sm">
                                    <span>{t('Title')}</span>
                                    <Input aria-label={t('Title')} value={pending.title} onChange={event => onPendingChange({ ...pending, title: event.target.value })} />
                                </label>
                                <label className="block space-y-2 text-sm">
                                    <span>{t('Section')}</span>
                                    <ReportSelect
                                        aria-label={t('Section')}
                                        value={pending.sectionId}
                                        onValueChange={id => onPendingChange({ ...pending, sectionId: id, anchorId: id, position: 'end' })}
                                    >
                                        {nodes
                                            .filter(item => item.kind === 'section')
                                            .map(item => (
                                                <SelectItem key={item.id} value={item.id}>
                                                    {path(item.id)}
                                                </SelectItem>
                                            ))}
                                    </ReportSelect>
                                </label>
                                <label className="block space-y-2 text-sm">
                                    <span>{t('Position')}</span>
                                    <ReportSelect
                                        aria-label={t('Position')}
                                        value={pending.position}
                                        onValueChange={value =>
                                            onPendingChange({
                                                ...pending,
                                                position: value as PendingReportOperation['position'],
                                                anchorId: value === 'end' ? pending.sectionId : '',
                                            })
                                        }
                                    >
                                        {(['end', 'before', 'after'] as const).map(position => (
                                            <SelectItem key={position} value={position}>
                                                {t(position)}
                                            </SelectItem>
                                        ))}
                                    </ReportSelect>
                                </label>
                                {pending.position !== 'end' && (
                                    <>
                                        <label className="flex items-center gap-2 text-xs">
                                            <Checkbox checked={showText} onCheckedChange={value => setShowText(value === true)} />
                                            {t('ShowText')}
                                        </label>
                                        <ReportSelect
                                            aria-label={t('InsertLocation')}
                                            value={pending.anchorId}
                                            onValueChange={anchorId => onPendingChange({ ...pending, anchorId })}
                                        >
                                            <SelectItem value="__none">{t('ChooseAnchor')}</SelectItem>
                                            {outline
                                                .filter(
                                                    item =>
                                                        item.id !== pending.sectionId &&
                                                        nodes.some(node => node.parentId === pending.sectionId && (node.id === item.id || node.start === item.start)) &&
                                                        (showText || item.kind !== 'text'),
                                                )
                                                .map(item => (
                                                    <SelectItem key={item.id} value={item.id}>
                                                        {item.title || t('Paragraph')}
                                                    </SelectItem>
                                                ))}
                                        </ReportSelect>
                                    </>
                                )}
                                <p className="rounded bg-muted p-2 text-xs" role="status">
                                    {path(pending.sectionId)} →{' '}
                                    {pending.position === 'end'
                                        ? t('end')
                                        : `${outline.find(item => item.id === pending.anchorId)?.title ?? t('ChooseAnchor')} · ${t(pending.position)}`}
                                </p>
                                {insertInvalid && (
                                    <p role="alert" className="text-xs text-destructive">
                                        {t('InvalidFields')}
                                    </p>
                                )}
                            </>
                        )}
                        {error && (
                            <p role="alert" className="text-sm text-destructive">
                                {error}
                            </p>
                        )}
                    </div>
                    <footer className="flex shrink-0 gap-2 border-t bg-card p-3">
                        <Button className="flex-1" disabled={busy || Boolean(invalid)} onClick={onSubmit}>
                            {t(
                                alreadyApplied
                                    ? 'AlreadyUsed'
                                    : pending.type === 'insert'
                                      ? pending.chartSpec
                                          ? 'AddChart'
                                          : 'AddTable'
                                      : targets.length > 1
                                        ? 'UpdateSelected'
                                        : targets[0]?.type === 'chart'
                                          ? 'UpdateChart'
                                          : 'UpdateTable',
                            )}
                        </Button>
                        <Button variant="outline" disabled={busy} onClick={() => onPendingChange(undefined)}>
                            {w('Cancel')}
                        </Button>
                    </footer>
                </>
            ) : (
                <>
                    {feedback && (
                        <div role="status" className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
                            <span className="flex-1">{feedback.message}</span>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRevert(feedback.blockId)}>
                                {t('Undo')}
                            </Button>
                        </div>
                    )}
                    {error && (
                        <p role="alert" className="p-3 text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <div ref={scroll} className="min-h-0 flex-1 overflow-auto p-2">
                        {view === 'outline' ? (
                            <nav aria-label={t('Outline')}>
                                <StructureChildren node={navigationTree} selectedId={selectedId} originId={originId} changes={changes} onSelect={onSelect} />
                                {!tree.children.length && <p className="p-3 text-sm text-muted-foreground">{t('EmptyReport')}</p>}
                            </nav>
                        ) : (
                            <div className="space-y-2">
                                {!changes.length && <p className="p-3 text-sm text-muted-foreground">{t('NoChanges')}</p>}
                                {changes.map(item => (
                                    <div key={item.id} className="rounded border p-3 text-sm">
                                        <p className="text-xs text-muted-foreground">{t(item.type)}</p>
                                        <Button
                                            variant="link"
                                            className="h-auto max-w-full justify-start truncate p-0"
                                            onClick={() => {
                                                onSelect(item.id);
                                                if (item.type !== 'remove') onViewChange('outline');
                                            }}
                                        >
                                            {item.title}
                                        </Button>
                                        <p className="mt-1 text-xs text-muted-foreground">{path(item.id, item.type === 'remove' ? baselineNodes : nodes)}</p>
                                        <Button size="sm" variant="ghost" className="mt-1" disabled={busy} onClick={() => onRevert(item.id)}>
                                            {t(item.type === 'remove' ? 'Restore' : 'Undo')}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {view === 'outline' && (selected || selectedNode) && (
                        <div className="max-h-[40%] shrink-0 space-y-3 overflow-auto border-t p-3" data-testid="report-selected-detail">
                            <div className="flex items-start gap-2">
                                <h3 className="min-w-0 flex-1 break-words text-sm font-medium">{selected?.title ?? selectedNode?.title}</h3>
                                {selected && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="size-7" aria-label={t('BlockActions')}>
                                                <MoreHorizontal className="size-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem disabled={busy} onSelect={() => onRemove(selected.id)}>
                                                {t('Remove')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                            {selected && <p className="text-xs text-muted-foreground">{t(selected.type === 'chart' ? 'Chart' : selected.type === 'table' ? 'Table' : 'Metric')}</p>}
                            {selectedEvidence && (
                                <>
                                    {detailEvidence(selectedEvidence)}
                                    <details className="text-xs text-muted-foreground">
                                        <summary className="cursor-pointer">{t('SourceDetails')}</summary>
                                        <p className="mt-1 break-all">{selectedEvidence.artifactId}</p>
                                        {selectedEvidence.snapshotId && <p className="break-all">{selectedEvidence.snapshotId}</p>}
                                    </details>
                                </>
                            )}
                            {selected &&
                                ['chart', 'table'].includes(selected.type) &&
                                (hasResult ? (
                                    <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => onUpdate(selected.id)}>
                                        {t('ReplaceWithResult')}
                                    </Button>
                                ) : (
                                    <p className="text-xs text-muted-foreground">{t('RunBeforeUpdate')}</p>
                                ))}
                            {finding && (
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">{t('EvidenceCount', { count: finding.references.length })}</p>
                                    {finding.references.map(reference => {
                                        const evidence = state.content.evidence.find(item => item.artifactId === reference.artifactId);
                                        return (
                                            <details key={reference.artifactId} className="rounded border p-2 text-xs">
                                                <summary className="cursor-pointer">{evidence?.title ?? t('UnavailableEvidence')}</summary>
                                                {evidence && (
                                                    <div className="mt-2">
                                                        {detailEvidence(evidence)}
                                                        <pre className="mt-2 whitespace-pre-wrap">{evidence.sql}</pre>
                                                    </div>
                                                )}
                                                {reference.explanation && <p className="mt-2">{reference.explanation}</p>}
                                            </details>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
