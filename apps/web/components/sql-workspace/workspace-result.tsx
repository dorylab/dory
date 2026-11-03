'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import type { WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import type { WorkspaceChart, WorkspaceChartSpec } from '@dory/shared/types/workspace-chart';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import type { ReportCanvasSource } from '@/components/work-documents/report-canvas-dnd';
import { resultUsedBy, workspaceErrorMessage } from '@/lib/work-documents/workspace-presentation';

import { executeActionClient } from '@/lib/actions/client';
import type { AggregatedChartData, ChartState } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared';
import { VTableSearchBar } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar';
import type { ColumnFilter, VTableRemoteSource } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/type';
import { VTableFilters } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';

import { SqlResultChartPane, SqlResultTablePane, SqlResultView, type SqlResultViewMode } from './sql-result-view';

const noop = () => undefined;
type Rows = { rows: Record<string, unknown>[]; rowCount: number | null; dataAvailability: string };

export function useWorkspaceChartSource(resultSetId: string | undefined, spec?: Pick<WorkspaceChartSpec, 'filters' | 'search'>) {
    const organizationId = useOrganizationId();
    const client = useQueryClient();
    return useMemo(
        () =>
            resultSetId
                ? {
                      cacheKey: JSON.stringify([resultSetId, spec?.filters, spec?.search]),
                      readChart: (state: ChartState) =>
                          client.fetchQuery({
                              queryKey: ['workspace-chart', organizationId, resultSetId, state, spec?.filters, spec?.search],
                              staleTime: Infinity,
                              retry: false,
                              queryFn: ({ signal: querySignal }) =>
                                  executeActionClient<AggregatedChartData>(
                                      'resultSet.chart.read',
                                      { resultSetId, ...state, filters: spec?.filters, search: spec?.search },
                                      { organizationId, signal: querySignal },
                                  ),
                          }),
                  }
                : null,
        [client, organizationId, resultSetId, spec?.filters, spec?.search],
    );
}

/** Result-level actions carry an immutable result ID and an explicit chart configuration. */
export function WorkspaceResult({
    resultSetId,
    evidence,
    charts,
    onSaveChart,
    onPlace,
    reportSource,
    adoptedVisuals,
    baselineVisuals,
    isSnapshot,
    resultLabel,
    onLocate,
    disabled = false,
}: {
    resultSetId?: string;
    evidence: WorkEvidence;
    charts: WorkspaceChart[];
    onSaveChart: (chart: WorkspaceChart) => void;
    onPlace: (source: ReportCanvasSource) => void;
    reportSource: Omit<ReportCanvasSource, 'title' | 'chartSpec'>;
    adoptedVisuals: WorkVisual[];
    baselineVisuals: WorkVisual[];
    isSnapshot: boolean;
    resultLabel: string;
    onLocate: (id: string) => void;
    disabled?: boolean;
}) {
    const t = useTranslations('WorkDocuments.ConnectedWorkspace');
    const organizationId = useOrganizationId();
    const [objectSelected, setObjectSelected] = useState(false);
    const [view, setView] = useState<SqlResultViewMode>('table');
    const [query, setQuery] = useState('');
    const [filters, setFilters] = useState<ColumnFilter[]>([]);
    const [chartId, setChartId] = useState<string>();
    const [title, setTitle] = useState(evidence.title);
    const [chart, setChart] = useState<ChartState>();
    const [error, setError] = useState<string>();
    const operations = useMemo(() => ({ filters, search: query ? { text: query } : undefined }), [filters, query]);
    const rowsQuery = useQuery({
        queryKey: ['workspace-result', organizationId, resultSetId, operations],
        enabled: Boolean(resultSetId),
        retry: false,
        queryFn: ({ signal }) => executeActionClient<Rows>('resultSet.rows.read', { resultSetId, offset: 0, limit: 200, ...operations }, { organizationId, signal }),
    });
    const rows = useMemo(() => (rowsQuery.data?.rows ?? evidence.rows).map(rowData => ({ rowData })), [rowsQuery.data, evidence.rows]);
    const columns = useMemo(() => evidence.columnTypes ?? evidence.columns.map(name => ({ name })), [evidence.columnTypes, evidence.columns]);
    const remoteSource = useMemo<VTableRemoteSource | null>(
        () =>
            resultSetId && rowsQuery.data?.dataAvailability === 'full'
                ? {
                      cacheKey: JSON.stringify([resultSetId, operations]),
                      sourceId: resultSetId,
                      rowCount: rowsQuery.data.rowCount ?? 0,
                      pageSize: 5000,
                      initialRows: rows,
                      getRows: async (offset, limit, signal) => {
                          const output = await executeActionClient<Rows>('resultSet.rows.read', { resultSetId, offset, limit, ...operations }, { organizationId, signal });
                          return { ready: output.dataAvailability === 'full', rows: output.rows.map(rowData => ({ rowData })) };
                      },
                      onError: failure => setError(String(failure)),
                  }
                : null,
        [organizationId, resultSetId, rowsQuery.data, operations, rows],
    );
    const chartSource = useWorkspaceChartSource(resultSetId, operations);
    const exportResult = useMutation({
        mutationFn: async (format: 'csv' | 'parquet') => {
            const output = await executeActionClient<{ downloadUrl: string }>('resultSet.export.create', { resultSetId, format, ...operations }, { organizationId });
            window.location.assign(output.downloadUrl);
        },
    });
    const upsertFilter = useCallback((filter: ColumnFilter) => setFilters(previous => [...previous.filter(item => item.col !== filter.col), filter]), []);
    const spec = chart ? { version: 1 as const, ...chart, ...operations } : undefined;
    const selectedChart = charts.find(item => item.id === chartId);
    const currentSpec = view === 'charts' ? spec : undefined;
    const adopted = view === 'charts' && !spec ? [] : resultUsedBy(adoptedVisuals, evidence, currentSpec);
    const baseline = view === 'charts' && !spec ? [] : resultUsedBy(baselineVisuals, evidence, currentSpec);
    const unavailable = disabled || !resultSetId || Boolean(rowsQuery.error) || (view === 'charts' && !spec);
    const canvasSource: ReportCanvasSource = { ...reportSource, title: view === 'charts' ? title.trim() || evidence.title : evidence.title, chartSpec: currentSpec };
    const drag = useDraggable({ id: `result:${resultSetId}:${view}:${chartId ?? 'new'}`, data: { item: { kind: 'result', source: canvasSource } }, disabled: unavailable });
    return (
        <div ref={drag.setNodeRef} className={`flex h-full min-h-0 flex-col ${objectSelected ? 'ring-1 ring-inset ring-primary/40' : ''}`}>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-1.5 text-xs" data-testid="report-result-status">
                <Button
                    ref={drag.setActivatorNodeRef}
                    {...drag.listeners}
                    {...drag.attributes}
                    size="icon"
                    variant="ghost"
                    className="size-7 cursor-grab touch-none"
                    disabled={unavailable}
                    aria-label={t('DragResult')}
                >
                    <GripVertical className="size-4" />
                </Button>
                <button type="button" className="max-w-56 truncate text-left font-medium" onClick={() => setObjectSelected(true)} aria-pressed={objectSelected}>
                    {canvasSource.title}
                </button>
                <span className="text-muted-foreground">{resultLabel}</span>
                <span className="max-w-40 truncate text-muted-foreground" title={reportSource.sourceLabel}>
                    {reportSource.sourceLabel}
                </span>
                <span className="text-muted-foreground">{t('RowCount', { count: evidence.rowCount ?? evidence.rows.length })}</span>
                <span role="status" className="rounded bg-muted px-2 py-0.5">
                    {t(adopted.length ? (baseline.length ? 'CurrentSnapshot' : 'AddedToDraft') : 'NotInReport')}
                </span>
                {adopted.map(item => (
                    <Button key={item.id} variant="link" size="sm" className="h-auto max-w-48 truncate p-0 text-xs" onClick={() => onLocate(item.id)}>
                        {item.title}
                    </Button>
                ))}
                {!adopted.length && !isSnapshot && <span className="text-muted-foreground">{t('RunComplete')}</span>}
                <Button
                    className="ml-auto"
                    size="sm"
                    disabled={unavailable}
                    onClick={() => {
                        setObjectSelected(true);
                        onPlace(structuredClone(canvasSource));
                    }}
                >
                    {t('PlaceInReport')}
                </Button>
                {objectSelected && <span className="basis-full text-muted-foreground">{t('DragHint')}</span>}
            </div>
            {(error || rowsQuery.error || exportResult.error) && (
                <p role="alert" className="p-2 text-sm text-destructive">
                    {workspaceErrorMessage(error ?? rowsQuery.error ?? exportResult.error, t('ResultUnavailable'))}
                </p>
            )}
            {view === 'charts' && (
                <div className="flex flex-wrap items-center gap-2 border-b p-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            setChartId(undefined);
                            setTitle(evidence.title);
                        }}
                    >
                        {t('NewChart')}
                    </Button>
                    {charts.map(item => (
                        <Button
                            key={item.id}
                            size="sm"
                            variant={chartId === item.id ? 'secondary' : 'ghost'}
                            onClick={() => {
                                setChartId(item.id);
                                setTitle(item.title);
                                setChart(item.spec);
                                setFilters((item.spec.filters ?? []) as ColumnFilter[]);
                                setQuery(item.spec.search?.text ?? '');
                            }}
                        >
                            {item.title}
                        </Button>
                    ))}
                    <Input aria-label={t('ChartTitle')} className="h-8 w-48" value={title} onChange={event => setTitle(event.target.value)} />
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!spec || !resultSetId}
                        onClick={() => {
                            if (spec && resultSetId) {
                                const id = chartId ?? crypto.randomUUID();
                                onSaveChart({ id, resultSetId, title, spec });
                                setChartId(id);
                            }
                        }}
                    >
                        {t('SaveChart')}
                    </Button>
                </div>
            )}
            <SqlResultView
                view={view}
                onViewChange={setView}
                filters={
                    <>
                        <VTableSearchBar
                            query={query}
                            onQueryChange={setQuery}
                            onClearQuery={() => setQuery('')}
                            filteredCount={rowsQuery.data?.rowCount ?? rows.length}
                            totalCount={evidence.rowCount ?? rows.length}
                            className="w-56"
                        />
                        <VTableFilters
                            activeFilters={filters}
                            columnsRaw={columns}
                            onUpsertFilter={upsertFilter}
                            onRemoveFilter={col => setFilters(previous => previous.filter(filter => filter.col !== col))}
                            onClearAllFilters={() => setFilters([])}
                            className="border-0 bg-transparent p-0"
                        />
                    </>
                }
                actions={
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" disabled={!resultSetId || exportResult.isPending}>
                                    {t('Export')}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                {(['csv', 'parquet'] as const).map(format => (
                                    <DropdownMenuItem key={format} onSelect={() => exportResult.mutate(format)}>
                                        {format.toUpperCase()}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                }
                tables={
                    <SqlResultTablePane
                        visible={view === 'table'}
                        isActive={view === 'table'}
                        results={rows}
                        columnMetas={columns}
                        storageKey={`workspace-result:${resultSetId ?? evidence.artifactId}`}
                        remoteSource={remoteSource}
                        onStatsChange={noop}
                        activeFilters={filters}
                        onUpsertFilter={upsertFilter}
                        onRemoveFilter={col => setFilters(previous => previous.filter(filter => filter.col !== col))}
                        onClearAllFilters={() => setFilters([])}
                        showFiltersBar={false}
                        editable={false}
                    />
                }
                charts={
                    <SqlResultChartPane
                        key={chartId ?? 'new'}
                        visible={view === 'charts'}
                        rows={rows}
                        columnsRaw={columns}
                        remoteSource={chartSource}
                        initialState={selectedChart?.spec}
                        onStateChange={setChart}
                        stateSyncEnabled
                        onApplyFilters={next => next.forEach(upsertFilter)}
                    />
                }
            />
        </div>
    );
}
