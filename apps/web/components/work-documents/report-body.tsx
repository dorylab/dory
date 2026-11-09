'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { ReportCanvasBlock } from '@dory/shared/types/report-workspace';
import type { WorkDocumentContent, WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type SortingState } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { reportMetrics } from '@/lib/work-documents/format';
import { escapeHtml, formatWorkValue, renderWorkMarkdown } from '@/lib/work-documents/render';
import { editableReport, parseReport, resolvedReport } from '@/lib/work-documents/report-core';

const ReportChart = dynamic(() => import('./report-chart'));

export function SnapshotTable({ evidence, compact = false }: { evidence: WorkEvidence; compact?: boolean }) {
    const t = useTranslations('WorkDocuments.Report');
    const evidenceT = useTranslations('WorkDocuments.Evidence');
    const [sorting, setSorting] = useState<SortingState>([]);
    const [filter, setFilter] = useState('');
    const [visibility, setVisibility] = useState<Record<string, boolean>>({});
    const columns = useMemo(
        () =>
            evidence.columns.map(column => ({
                id: column,
                accessorFn: (row: Record<string, unknown>) => row[column],
                header: column,
                cell: ({ getValue }: { getValue: () => unknown }) => formatWorkValue(getValue()),
            })),
        [evidence.columns],
    );
    const table = useReactTable({
        data: evidence.rows,
        columns,
        state: { sorting, globalFilter: filter, columnVisibility: visibility },
        onSortingChange: setSorting,
        onGlobalFilterChange: setFilter,
        onColumnVisibilityChange: setVisibility,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: { pagination: { pageSize: 25 } },
        globalFilterFn: 'includesString',
    });
    if (compact)
        return (
            <div>
                <div className="work-table-scroll" tabIndex={0}>
                    <table>
                        <thead>
                            <tr>
                                {evidence.columns.map(column => (
                                    <th key={column}>{column}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {evidence.rows.slice(0, 5).map((row, index) => (
                                <tr key={index}>
                                    {evidence.columns.map(column => (
                                        <td key={column}>{formatWorkValue(row[column])}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-muted-foreground">
                    {evidenceT('DisplayRange', { shown: Math.min(5, evidence.rows.length), total: evidence.rowCount ?? evidence.rows.length })}
                </p>
            </div>
        );
    return (
        <div>
            <div className="flex flex-wrap items-center gap-3">
                <Input className="max-w-xs" value={filter} onChange={event => setFilter(event.target.value)} placeholder={t('Filter')} aria-label={t('Filter')} />
                <details>
                    <summary className="cursor-pointer text-sm">{t('Columns')}</summary>
                    <div className="flex flex-wrap gap-3 py-2">
                        {table.getAllLeafColumns().map(column => (
                            <label key={column.id} className="text-sm">
                                <input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} /> {column.id}
                            </label>
                        ))}
                    </div>
                </details>
            </div>
            <div className="work-table-scroll" tabIndex={0}>
                <table>
                    <thead>
                        {table.getHeaderGroups().map(group => (
                            <tr key={group.id}>
                                {group.headers.map(header => (
                                    <th
                                        key={header.id}
                                        aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}
                                    >
                                        <button onClick={header.column.getToggleSortingHandler()}>
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            {header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                                        </button>
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map(row => (
                            <tr key={row.id}>
                                {row.getVisibleCells().map(cell => (
                                    <td className="min-w-28" key={cell.id}>
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {evidence.rowCount === 0 ? <p className="py-2 text-sm text-muted-foreground">{evidenceT('NoRows')}</p> : null}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Button size="sm" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                    {t('Previous')}
                </Button>
                {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())} · {t('Rows', { count: table.getFilteredRowModel().rows.length })}
                <Button size="sm" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                    {t('Next')}
                </Button>
            </div>
        </div>
    );
}
export function ReportVisual({
    visual,
    evidence,
    onEditComponent,
    compact = false,
}: {
    compact?: boolean;
    visual: WorkVisual;
    evidence: WorkEvidence;
    onEditComponent?: (id: string) => void;
}) {
    const t = useTranslations('WorkDocuments.Report');
    const evidenceT = useTranslations('WorkDocuments.Evidence');
    return (
        <figure className="report-wide group relative min-w-0 space-y-3" data-visual={visual.id}>
            {onEditComponent && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon"
                            variant="outline"
                            className="report-component-edit absolute right-2 top-2 z-10 size-9 bg-background"
                            aria-label={t('EditNamedComponent', { title: visual.title })}
                            onClick={() => onEditComponent(visual.id)}
                        >
                            <Pencil className="size-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('EditComponent')}</TooltipContent>
                </Tooltip>
            )}
            <figcaption className="pr-12 text-sm font-medium leading-6">{visual.title}</figcaption>
            {visual.type === 'metric' ? (
                <div className="report-metric-grid grid gap-4 py-2">
                    {reportMetrics(visual, evidence).map((item, index) => (
                        <div key={index}>
                            {visual.metric?.items?.length || item.label !== visual.title ? <div className="mb-1 text-xs text-muted-foreground">{item.label}</div> : null}
                            <strong className="text-3xl tabular-nums">{item.value}</strong>
                            {item.comparison && (
                                <p>
                                    {t('Change')}: {item.comparison}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            ) : visual.type === 'chart' ? (
                <ReportChart visual={visual} evidence={evidence} />
            ) : (
                <SnapshotTable evidence={evidence} compact={compact} />
            )}
            <div className={compact ? 'hidden' : 'mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'}>
                <span>
                    {evidence.attachmentSource?.files
                        .map(file => file.filename)
                        .filter((name, index, all) => all.indexOf(name) === index)
                        .join(', ') ||
                        evidence.connectionName ||
                        evidence.title}
                    {' · '}
                    {new Date(evidence.capturedAt).toLocaleString()}
                    {' · '}
                    {evidence.rowCount == null
                        ? evidenceT('UnknownRange', { shown: evidence.rows.length })
                        : evidenceT('DisplayRange', { shown: evidence.rows.length, total: evidence.rowCount })}
                </span>
            </div>
        </figure>
    );
}
export function ReportBody({
    content,
    title,
    onEvidenceGroup,
    onEditComponent,
}: {
    content: WorkDocumentContent;
    title: string;
    onEvidenceGroup?: (id: string) => void;
    onEditComponent?: (id: string) => void;
}) {
    const evidenceT = useTranslations('WorkDocuments.Evidence');
    const labels = (html: string) =>
        html.replace(/(<a\b[^>]*data-evidence-group="([^"]+)"[^>]*>)[\s\S]*?<\/a>/g, (_match, opening: string, id: string) => {
            const count = content.evidenceGroups?.find(group => group.id === id)?.references.length ?? 0;
            return `${opening}${escapeHtml(evidenceT('ViewEvidence', { count }))}</a>`;
        });
    const groupClick = (event: React.MouseEvent) => {
        const link = event.target instanceof Element ? event.target.closest('[data-evidence-group]') : null;
        const id = link?.getAttribute('data-evidence-group');
        if (id && onEvidenceGroup) {
            event.preventDefault();
            event.stopPropagation();
            onEvidenceGroup(id);
        }
    };
    if (!content.format)
        return (
            <div data-testid="work-markdown" className="report-prose" onClick={groupClick} dangerouslySetInnerHTML={{ __html: labels(renderWorkMarkdown(content, true, title)) }} />
        );
    let prepared: WorkDocumentContent;
    try {
        prepared = resolvedReport(content);
    } catch (error) {
        return (
            <p role="alert" className="text-destructive">
                {error instanceof Error ? error.message : 'Invalid report'}
            </p>
        );
    }
    const editable = editableReport(prepared);
    const parsed = parseReport(editable.body!, prepared.visuals);
    if (parsed.diagnostics.length)
        return (
            <p role="alert" className="text-destructive">
                {parsed.diagnostics.map(item => item.message).join('; ')}
            </p>
        );
    let offset = 0;
    const sections: React.ReactNode[] = [];
    const prose = (body: string, key: number) => (
        <div key={`prose-${key}`} className="report-prose" dangerouslySetInnerHTML={{ __html: labels(renderWorkMarkdown({ ...prepared, format: undefined, markdown: body })) }} />
    );
    // Suppress only a matching leading H1; the stored content stays untouched.
    const first = parsed.tree?.children[0];
    if (
        first?.type === 'heading' &&
        first.depth === 1 &&
        first.children.every(child => child.type === 'text') &&
        first.children.map(child => ('value' in child ? child.value : '')).join('') === title
    )
        offset = first.position?.end.offset ?? 0;
    for (const component of parsed.components) {
        sections.push(prose(editable.body!.slice(offset, component.start), offset));
        const visual = prepared.visuals.find(item => item.id === component.visualId)!;
        const evidence = prepared.evidence.find(item => item.artifactId === visual.evidenceId);
        if (!evidence) return <p role="alert">Missing report snapshot.</p>;
        sections.push(<ReportVisual key={component.start} visual={visual} evidence={evidence} onEditComponent={onEditComponent} />);
        offset = component.end;
    }
    sections.push(prose(editable.body!.slice(offset), offset));
    return (
        <div data-testid="work-markdown" onClick={groupClick}>
            {sections}
        </div>
    );
}

/** Uses the same safe Markdown and snapshot renderers as the full report. */
export function ReportBlockView({
    block,
    content,
    onEvidenceGroup,
    definitions = '',
}: {
    block: ReportCanvasBlock;
    content: WorkDocumentContent;
    onEvidenceGroup?: (id: string) => void;
    definitions?: string;
}) {
    const t = useTranslations('WorkDocuments.Evidence');
    if (block.visualId) {
        const visual = content.visuals.find(item => item.id === block.visualId);
        const evidence = content.evidence.find(item => item.artifactId === visual?.evidenceId);
        return visual && evidence ? <ReportVisual visual={visual} evidence={evidence} compact /> : <p role="alert">{t('Unavailable')}</p>;
    }
    const html = renderWorkMarkdown({ ...content, format: undefined, markdown: `${block.source}\n\n${definitions}` }).replace(
        /(<a\b[^>]*data-evidence-group="([^"]+)"[^>]*>)[\s\S]*?<\/a>/g,
        (_match, opening: string, id: string) =>
            `${opening}${escapeHtml(t('ViewEvidence', { count: content.evidenceGroups?.find(group => group.id === id)?.references.length ?? 0 }))}</a>`,
    );
    return (
        <div
            className="report-prose"
            onClick={event => {
                const id = event.target instanceof Element ? event.target.closest('[data-evidence-group]')?.getAttribute('data-evidence-group') : null;
                if (id) {
                    event.preventDefault();
                    onEvidenceGroup?.(id);
                }
            }}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
