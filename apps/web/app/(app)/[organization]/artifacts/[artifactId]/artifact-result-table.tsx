'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BarChart3, Download, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

import { executeActionClient } from '@/lib/actions/client';
import { VTableSearchBar } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar';
import { InspectorPanel } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/InspectorPanel';
import { VTableFilters } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters';
import type { ColumnFilter, VTableInspectorPayload, VTableRemoteSource } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/type';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';

const VTable = dynamic(() => import('@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
        </div>
    ),
});

const DIRECTIONS = ['asc', 'desc'] as const;
const REMOTE_PAGE_SIZE = 5000;
const INITIAL_PAGE_SIZE = 200;
const EMPTY_ROWS: Array<{ rowData: Record<string, unknown> }> = [];
const NOOP_STATS = () => undefined;

type RowsOutput = {
    resultSetId: string;
    rows: Record<string, unknown>[];
    offset: number;
    limit: number;
    rowCount: number | null;
    unfilteredRowCount?: number | null;
    columns: unknown[];
    dataAvailability: string;
};

type ColumnMeta = {
    name?: unknown;
    type?: unknown;
    nullable?: unknown;
    isPrimaryKey?: unknown;
};

function parseFilters(value: string): ColumnFilter[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (filter): filter is ColumnFilter =>
                Boolean(filter) &&
                typeof filter === 'object' &&
                'col' in filter &&
                typeof filter.col === 'string' &&
                'kind' in filter &&
                (filter.kind === 'string' || filter.kind === 'number' || filter.kind === 'range') &&
                'op' in filter &&
                typeof filter.op === 'string',
        );
    } catch {
        return [];
    }
}

function serializeFilters(filters: ColumnFilter[]) {
    return filters.length ? JSON.stringify(filters) : '';
}

export function ArtifactResultTable({
    artifactId,
    resultSetId,
    columns,
    rowCount,
    onCreateChart,
    onExport,
    exportPending,
}: {
    artifactId: string;
    resultSetId: string;
    columns: unknown[];
    rowCount: number | null;
    onCreateChart: () => void;
    onExport: (format: 'csv' | 'parquet') => void;
    exportPending: boolean;
}) {
    const t = useTranslations('Artifacts.Viewer');
    const [tableState, setTableState] = useQueryStates({
        q: parseAsString.withDefault(''),
        sort: parseAsString.withDefault(''),
        direction: parseAsStringLiteral(DIRECTIONS).withDefault('asc'),
        filters: parseAsString.withDefault(''),
    });
    const activeFilters = useMemo(() => parseFilters(tableState.filters), [tableState.filters]);
    const operations = useMemo(
        () => ({
            sorts: tableState.sort ? [{ column: tableState.sort, direction: tableState.direction }] : undefined,
            filters: activeFilters.length ? activeFilters : undefined,
            search: tableState.q.trim() ? { text: tableState.q.trim() } : undefined,
        }),
        [activeFilters, tableState.direction, tableState.q, tableState.sort],
    );
    const operationKey = useMemo(() => JSON.stringify(operations), [operations]);
    const [remoteError, setRemoteError] = useState<string | null>(null);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectorMode, setInspectorMode] = useState<'cell' | 'row' | null>(null);
    const [inspectorPayload, setInspectorPayload] = useState<VTableInspectorPayload>(null);
    const [rowViewMode, setRowViewMode] = useState<'table' | 'json'>('table');
    const [inspectorWidth, setInspectorWidth] = useState(360);
    const [inspectorContainer, setInspectorContainer] = useState<HTMLDivElement | null>(null);

    const initialQuery = useQuery({
        queryKey: ['artifact-result-rows', resultSetId, operationKey],
        queryFn: ({ signal }) =>
            executeActionClient<RowsOutput>(
                'resultSet.rows.read',
                {
                    resultSetId,
                    offset: 0,
                    limit: INITIAL_PAGE_SIZE,
                    ...operations,
                },
                { signal },
            ),
    });

    const effectiveColumns = (initialQuery.data?.columns?.length ? initialQuery.data.columns : columns) as ColumnMeta[];
    const effectiveRowCount = initialQuery.data?.rowCount ?? rowCount ?? 0;
    const unfilteredRowCount = initialQuery.data?.unfilteredRowCount ?? rowCount ?? effectiveRowCount;
    const initialRows = useMemo(() => initialQuery.data?.rows.map(row => ({ rowData: row })) ?? EMPTY_ROWS, [initialQuery.data?.rows]);
    const fullResult = initialQuery.data?.dataAvailability === 'full';

    const remoteSource = useMemo<VTableRemoteSource | null>(() => {
        if (!fullResult || effectiveRowCount <= 0) return null;
        return {
            cacheKey: `${resultSetId}:${operationKey}`,
            sourceId: resultSetId,
            rowCount: effectiveRowCount,
            pageSize: REMOTE_PAGE_SIZE,
            initialRows,
            getRows: async (offset, limit, signal) => {
                const output = await executeActionClient<RowsOutput>('resultSet.rows.read', { resultSetId, offset, limit, ...operations }, signal ? { signal } : undefined);
                setRemoteError(null);
                return {
                    ready: output.dataAvailability === 'full',
                    rows: output.rows.map(row => ({ rowData: row })),
                };
            },
            onError: error => setRemoteError(error instanceof Error ? error.message : t('ActionFailed')),
        };
    }, [effectiveRowCount, fullResult, initialRows, operationKey, operations, resultSetId, t]);

    const setFilters = useCallback(
        (nextFilters: ColumnFilter[]) => {
            setRemoteError(null);
            void setTableState({ filters: serializeFilters(nextFilters) });
        },
        [setTableState],
    );
    const upsertFilter = useCallback((filter: ColumnFilter) => setFilters([...activeFilters.filter(item => item.col !== filter.col), filter]), [activeFilters, setFilters]);
    const removeFilter = useCallback((column: string) => setFilters(activeFilters.filter(filter => filter.col !== column)), [activeFilters, setFilters]);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card" data-testid="artifact-result-table">
            <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-b bg-muted/30 px-2 py-1">
                <span className="px-2 text-sm font-semibold">{t('DataPreview')}</span>
                <div className="flex min-w-0 flex-1 items-center">
                    <VTableSearchBar
                        query={tableState.q}
                        onQueryChange={query => {
                            setRemoteError(null);
                            void setTableState({ q: query });
                        }}
                        onClearQuery={() => void setTableState({ q: '' })}
                        filteredCount={effectiveRowCount}
                        totalCount={unfilteredRowCount}
                        className="w-80 max-w-full"
                    />
                    <VTableFilters
                        activeFilters={activeFilters}
                        columnsRaw={effectiveColumns.filter((column): column is { name: string; type?: string | null } => typeof column.name === 'string')}
                        onUpsertFilter={upsertFilter}
                        onRemoveFilter={removeFilter}
                        onClearAllFilters={() => setFilters([])}
                        className="border-0 bg-transparent px-0 py-0"
                    />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onCreateChart}>
                        <BarChart3 className="h-3.5 w-3.5" />
                        {t('CreateChart')}
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5" disabled={exportPending}>
                                {exportPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                {t('Export')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => onExport('csv')}>CSV</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onExport('parquet')}>Parquet</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            <div ref={setInspectorContainer} className="relative min-h-0 flex-1">
                {initialQuery.isLoading ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-card text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('LoadingRows')}
                    </div>
                ) : null}
                {initialQuery.isError || remoteError ? (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-card px-6 text-center text-sm text-muted-foreground">
                        <AlertCircle className="h-5 w-5" />
                        <span>{remoteError ?? (initialQuery.error instanceof Error ? initialQuery.error.message : t('ActionFailed'))}</span>
                    </div>
                ) : null}
                {!initialQuery.isLoading && !initialQuery.isError && effectiveRowCount === 0 ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-card text-sm text-muted-foreground">{t('NoRows')}</div>
                ) : null}
                {!initialQuery.isLoading && !initialQuery.isError && effectiveRowCount > 0 ? (
                    <VTable
                        key={`${artifactId}:${operationKey}`}
                        results={fullResult ? EMPTY_ROWS : initialRows}
                        columnMetas={effectiveColumns}
                        remoteSource={remoteSource}
                        storageKey={`artifact:${artifactId}`}
                        onStatsChange={NOOP_STATS}
                        setInspectorOpen={setInspectorOpen}
                        setInspectorMode={setInspectorMode}
                        setInspectorPayload={setInspectorPayload}
                        activeFilters={activeFilters}
                        onUpsertFilter={upsertFilter}
                        onRemoveFilter={removeFilter}
                        onClearAllFilters={() => setFilters([])}
                        showFiltersBar={false}
                        serverSideOperations={fullResult}
                        initialSort={tableState.sort ? { column: tableState.sort, direction: tableState.direction } : null}
                        onSortChange={sort =>
                            void setTableState({
                                sort: sort?.column ?? '',
                                direction: sort?.direction ?? 'asc',
                            })
                        }
                    />
                ) : null}
                <InspectorPanel
                    open={inspectorOpen}
                    setOpen={setInspectorOpen}
                    mode={inspectorMode}
                    payload={inspectorPayload}
                    portalContainer={inspectorContainer}
                    rowViewMode={rowViewMode}
                    setRowViewMode={setRowViewMode}
                    inspectorWidth={inspectorWidth}
                    setInspectorWidth={setInspectorWidth}
                />
            </div>
        </div>
    );
}
