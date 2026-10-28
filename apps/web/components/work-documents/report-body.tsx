'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { WorkDocumentContent, WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type SortingState } from '@tanstack/react-table';
import { ArrowUpRight, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { reportMetrics } from '@/lib/work-documents/format';
import { formatWorkValue, renderWorkMarkdown } from '@/lib/work-documents/render';
import { editableReport, parseReport, resolvedReport } from '@/lib/work-documents/report-core';

const ReportChart = dynamic(() => import('./report-chart'));

function SnapshotTable({ evidence }: { evidence: WorkEvidence }) {
    const t = useTranslations('WorkDocuments.Report');
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
function ReportVisual({
    visual,
    evidence,
    onEvidence,
    onEditComponent,
    previewOnly,
}: {
    visual: WorkVisual;
    evidence: WorkEvidence;
    onEvidence: (id: string) => void;
    onEditComponent?: (id: string) => void;
    previewOnly?: boolean;
}) {
    const t = useTranslations('WorkDocuments.Report');
    const workspaceT = useTranslations('AgentRuns.Actions');
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
                <SnapshotTable evidence={evidence} />
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                    {evidence.connectionName ?? evidence.title} · {t(evidence.truncated ? 'Subset' : 'Complete')} · {t('Rows', { count: evidence.rows.length })}
                </span>
                {!previewOnly && (
                    <Button className="h-7 gap-1 px-2 text-xs" variant="ghost" size="sm" onClick={() => onEvidence(evidence.artifactId)}>
                        {evidence.connectionId ? workspaceT('OpenWorkspace') : t('OpenResult')}
                        <ArrowUpRight className="size-3.5" />
                    </Button>
                )}
            </div>
        </figure>
    );
}
export function ReportBody({
    content,
    title,
    onEvidence,
    onEditComponent,
    previewOnly,
}: {
    content: WorkDocumentContent;
    title: string;
    onEvidence: (id: string) => void;
    onEditComponent?: (id: string) => void;
    previewOnly?: boolean;
}) {
    if (!content.format) return <div data-testid="work-markdown" className="report-prose" dangerouslySetInnerHTML={{ __html: renderWorkMarkdown(content, true, title) }} />;
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
        <div key={`prose-${key}`} className="report-prose" dangerouslySetInnerHTML={{ __html: renderWorkMarkdown({ ...prepared, format: undefined, markdown: body }) }} />
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
        sections.push(
            <ReportVisual key={component.start} visual={visual} evidence={evidence} onEvidence={onEvidence} onEditComponent={onEditComponent} previewOnly={previewOnly} />,
        );
        offset = component.end;
    }
    sections.push(prose(editable.body!.slice(offset), offset));
    return <div data-testid="work-markdown">{sections}</div>;
}
