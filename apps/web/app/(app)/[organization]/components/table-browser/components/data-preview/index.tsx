'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { FileText, RotateCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { createParser, parseAsIndex, useQueryStates } from 'nuqs';

import { fetchTablePreview } from '../../lib/fetch-table-preview';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { TablePreviewFilter, TablePreviewSort } from '@dory/drivers/types';
import { ResultRow } from '@dory/shared/types/sql-console';
import { SQLTab } from '@dory/shared/types/tabs';
import { VTableSearchBar } from '../../../../[connectionId]/sql-console/components/result-table/components/TableSearchBar';
import { currentSessionMetaAtom } from '../../../../[connectionId]/sql-console/components/result-table/stores/result-table.atoms';
import VTable from '../../../../[connectionId]/sql-console/components/result-table/vtable';
import { InspectorPanel } from '../../../../[connectionId]/sql-console/components/result-table/vtable/InspectorPanel';
import { VTableFilters } from '../../../../[connectionId]/sql-console/components/result-table/vtable/VTableFilters';
import type { ColumnFilter } from '../../../../[connectionId]/sql-console/components/result-table/vtable/type';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';
import { useTablePropertiesQuery, useTableStatsQuery, useTableStructureColumnsQuery } from '../table-queries';
import { DataPreviewPaginationBar } from './DataPreviewPaginationBar';

type PreviewColumn = {
    name: string;
};

type PreviewResultSet = {
    columns?: Array<Record<string, unknown>> | null;
    totalRows?: number | string | null;
    unfilteredTotalRows?: number | string | null;
};

type PreviewStats = {
    filteredCount: number;
    totalCount: number;
};

type PreviewCacheEntry = {
    columns: PreviewColumn[];
    rows: ResultRow[];
    totalRows: number | null;
    unfilteredTotalRows: number | null;
    stats: PreviewStats;
};

type InspectorPayload =
    | {
          row: number;
          col: string;
          value: unknown;
      }
    | {
          row: number;
          rowData: Record<string, unknown>;
      }
    | null;

type DataPreviewProps = {
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    storageKey?: string;
    source?: string;
    emptyMessage?: string;
};

type TableDataPreviewProps = {
    activeTab?: SQLTab;
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
};

const PREVIEW_STALE_TIME = 1000 * 60 * 5;
const PREVIEW_GC_TIME = PREVIEW_STALE_TIME * 2;
const EMPTY_ROWS: ResultRow[] = [];
const EMPTY_SEARCH_COLUMNS: string[] = [];
const parseAsNonNegativeIndex = createParser({
    parse: value => {
        const parsed = parseAsIndex.parse(value);
        return parsed != null && parsed >= 0 ? parsed : null;
    },
    serialize: value => parseAsIndex.serialize(value),
});
const parseAsPositiveInteger = createParser({
    parse: value => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    },
    serialize: value => String(value),
});
const dataPreviewPaginationParsers = {
    pageIndex: parseAsNonNegativeIndex.withDefault(0),
    pageSize: parseAsPositiveInteger.withDefault(DEFAULT_TABLE_PREVIEW_LIMIT),
};

function normalizeParam(value?: string | string[]) {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
}

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildPreviewQueryKey({
    connectionId,
    databaseName,
    tableName,
    storageKey,
    source,
    pageIndex,
    pageSize,
    search,
    filters,
    sort,
    searchColumns,
}: {
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    storageKey?: string;
    source: string;
    pageIndex: number;
    pageSize: number;
    search: string;
    filters: ColumnFilter[];
    sort: TablePreviewSort | null;
    searchColumns: string[];
}) {
    return ['table-preview', source, connectionId, databaseName, tableName, storageKey, pageIndex, pageSize, search, filters, sort, searchColumns] as const;
}

function mapPreviewRows(rows: Record<string, unknown>[], rowKeyPrefix: string): ResultRow[] {
    return rows.map((row, idx) => ({
        tabId: rowKeyPrefix,
        rid: idx,
        rowData: row,
    }));
}

function buildColumns(rows: Record<string, unknown>[], resultSet?: PreviewResultSet | null): PreviewColumn[] {
    const resultColumns = (resultSet?.columns ?? [])
        .map(column => {
            const name = column?.name ?? column?.columnName;
            return typeof name === 'string' && name.trim() ? { name } : null;
        })
        .filter((column): column is PreviewColumn => Boolean(column));

    if (resultColumns.length > 0) {
        return resultColumns;
    }

    return Object.keys(rows[0] ?? {}).map(name => ({ name }));
}

function quoteSqlIdentifier(identifier: string) {
    return `"${identifier.replaceAll('"', '""')}"`;
}

function formatSqlLiteral(value: string) {
    return `'${value.replaceAll("'", "''")}'`;
}

function formatSqlLikeLiteral(value: string) {
    return formatSqlLiteral(`%${value}%`);
}

function buildFilterSql(filter: ColumnFilter) {
    const column = quoteSqlIdentifier(filter.col);
    const value = filter.value ?? '';

    if (filter.kind === 'number') {
        const operatorMap = {
            eq: '=',
            ne: '<>',
            gt: '>',
            ge: '>=',
            lt: '<',
            le: '<=',
        } as const;

        const operator = operatorMap[filter.op as keyof typeof operatorMap];
        return operator ? `${column} ${operator} ${formatSqlLiteral(value)}` : null;
    }

    if (filter.kind === 'range') {
        const start = filter.value ? `${column} >= ${formatSqlLiteral(filter.value)}` : null;
        const end = filter.valueTo ? `${column} <= ${formatSqlLiteral(filter.valueTo)}` : null;
        return [start, end].filter(Boolean).join(' AND ') || null;
    }

    switch (filter.op) {
        case 'contains':
            return `${column} ILIKE ${formatSqlLikeLiteral(value)}`;
        case 'equals':
            return `${column} = ${formatSqlLiteral(value)}`;
        case 'startsWith':
            return `${column} ILIKE ${formatSqlLiteral(`${value}%`)}`;
        case 'endsWith':
            return `${column} ILIKE ${formatSqlLiteral(`%${value}`)}`;
        case 'empty':
            return `(${column} IS NULL OR ${column} = '')`;
        case 'notEmpty':
            return `(${column} IS NOT NULL AND ${column} <> '')`;
        case 'regex':
            return `${column} ~ ${formatSqlLiteral(value)}`;
        default:
            return null;
    }
}

function buildCurrentPreviewSql({
    databaseName,
    tableName,
    pageIndex,
    pageSize,
    search,
    filters,
    sort,
    searchColumns,
}: {
    databaseName: string;
    tableName: string;
    pageIndex: number;
    pageSize: number;
    search: string;
    filters: ColumnFilter[];
    sort: TablePreviewSort | null;
    searchColumns: string[];
}) {
    const from = `${quoteSqlIdentifier(databaseName)}.${quoteSqlIdentifier(tableName)}`;
    const clauses: string[] = [`SELECT *`, `FROM ${from}`];
    const whereClauses: string[] = [];
    const trimmedSearch = search.trim();

    if (trimmedSearch && searchColumns.length > 0) {
        whereClauses.push(`(${searchColumns.map(column => `${quoteSqlIdentifier(column)} ILIKE ${formatSqlLikeLiteral(trimmedSearch)}`).join(' OR ')})`);
    }

    for (const filter of filters) {
        const filterSql = buildFilterSql(filter);
        if (filterSql) {
            whereClauses.push(filterSql);
        }
    }

    if (whereClauses.length > 0) {
        clauses.push(`WHERE ${whereClauses.join('\n  AND ')}`);
    }

    if (sort) {
        clauses.push(`ORDER BY ${quoteSqlIdentifier(sort.column)} ${sort.direction.toUpperCase()}`);
    }

    clauses.push(`LIMIT ${pageSize}`);
    clauses.push(`OFFSET ${pageIndex * pageSize}`);

    return `${clauses.join('\n')};`;
}

function DataPreviewLoadingBar({ ariaLabel }: { ariaLabel: string }) {
    return (
        <div className="h-0.5 w-full overflow-hidden bg-primary/10" role="progressbar" aria-label={ariaLabel}>
            <div className="h-full w-1/3 origin-left bg-primary animate-data-preview-progress" />
        </div>
    );
}

function DataPreview(props: DataPreviewProps) {
    const { connectionId, databaseName, tableName, source = 'table-browser-data-preview' } = props;
    const resetKey = [source, connectionId, databaseName, tableName].join('::');

    return <DataPreviewInner key={resetKey} {...props} source={source} />;
}

function DataPreviewInner({ connectionId, databaseName, tableName, storageKey, source = 'table-browser-data-preview', emptyMessage }: DataPreviewProps) {
    const t = useTranslations('TableBrowser');
    const setSessionMeta = useSetAtom(currentSessionMetaAtom);

    const [query, setQuery] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectorMode, setInspectorMode] = useState<'cell' | 'row' | null>(null);
    const [inspectorPayload, setInspectorPayload] = useState<InspectorPayload>(null);
    const [rowViewMode, setRowViewMode] = useState<'table' | 'json'>('table');
    const [inspectorWidth, setInspectorWidth] = useState(360);
    const [{ pageIndex, pageSize }, setPagination] = useQueryStates(dataPreviewPaginationParsers, {
        history: 'replace',
        shallow: true,
        scroll: false,
        urlKeys: {
            pageIndex: 'previewPage',
            pageSize: 'previewPageSize',
        },
    });
    const [activeFilters, setActiveFilters] = useState<ColumnFilter[]>([]);
    const [sortState, setSortState] = useState<TablePreviewSort | null>(null);
    const [hasUserRequestedPreviewUpdate, setHasUserRequestedPreviewUpdate] = useState(false);

    useEffect(() => {
        void setPagination({ pageIndex: 0 });
    }, [connectionId, databaseName, source, storageKey, tableName, setPagination]);

    const { data: tableProperties } = useTablePropertiesQuery({ connectionId, databaseName, tableName });
    const { data: tableStats } = useTableStatsQuery({ connectionId, databaseName, tableName });
    const { data: tableColumns } = useTableStructureColumnsQuery({ connectionId, databaseName, tableName });
    const metadataTotalRowEstimate = tableProperties?.totalRows ?? tableStats?.rowCount ?? null;
    const searchColumns = useMemo(() => tableColumns?.columns.map(column => column.name) ?? EMPTY_SEARCH_COLUMNS, [tableColumns?.columns]);
    const effectiveSearchColumns = query.trim() ? searchColumns : EMPTY_SEARCH_COLUMNS;

    const previewQueryKey = useMemo(
        () =>
            buildPreviewQueryKey({
                connectionId,
                databaseName,
                tableName,
                storageKey,
                source,
                pageIndex,
                pageSize,
                search: query,
                filters: activeFilters,
                sort: sortState,
                searchColumns: effectiveSearchColumns,
            }),
        [activeFilters, connectionId, databaseName, effectiveSearchColumns, pageIndex, pageSize, query, sortState, source, storageKey, tableName],
    );

    const currentPreviewSql = useMemo(() => {
        if (!databaseName || !tableName) return '';

        return buildCurrentPreviewSql({
            databaseName,
            tableName,
            pageIndex,
            pageSize,
            search: query,
            filters: activeFilters,
            sort: sortState,
            searchColumns: effectiveSearchColumns,
        });
    }, [activeFilters, databaseName, effectiveSearchColumns, pageIndex, pageSize, query, sortState, tableName]);

    const previewQuery = useQuery<PreviewCacheEntry>({
        queryKey: previewQueryKey,
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: PREVIEW_STALE_TIME,
        gcTime: PREVIEW_GC_TIME,
        placeholderData: previousData => previousData,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async ({ signal }) => {
            if (!connectionId || !databaseName || !tableName) {
                throw new Error(t('Failed to load data preview'));
            }

            const res = await fetchTablePreview({
                connectionId,
                databaseName,
                tableName,
                limit: pageSize,
                offset: pageIndex * pageSize,
                sort: sortState,
                filters: activeFilters as TablePreviewFilter[],
                search: query,
                searchColumns: effectiveSearchColumns,
                source,
                signal,
            });

            if (!isSuccess(res)) {
                throw new Error(res?.message ?? t('Failed to load data preview'));
            }

            const firstSet = (res?.data?.queryResultSets?.[0] ?? null) as PreviewResultSet | null;
            const rawRows = Array.isArray(res?.data?.results?.[0]) ? (res.data.results[0] as Record<string, unknown>[]) : [];
            const nextStorageKey = storageKey ?? `preview:${connectionId}:${databaseName}:${tableName}`;
            const mappedRows = mapPreviewRows(rawRows, nextStorageKey);
            const columns = buildColumns(rawRows, firstSet);
            const totalRows = toNumberOrNull(firstSet?.totalRows);
            const unfilteredTotalRows = toNumberOrNull(firstSet?.unfilteredTotalRows) ?? totalRows;

            return {
                columns,
                rows: mappedRows,
                totalRows,
                unfilteredTotalRows,
                stats: {
                    filteredCount: mappedRows.length,
                    totalCount: totalRows ?? mappedRows.length,
                },
            } satisfies PreviewCacheEntry;
        },
    });

    const previewData = previewQuery.data;
    const rows = useMemo(() => previewData?.rows ?? EMPTY_ROWS, [previewData]);
    const totalRowEstimate = previewData?.totalRows ?? metadataTotalRowEstimate;
    const loading = previewQuery.isLoading;
    const refreshing = previewQuery.isFetching;
    const error = previewData ? null : previewQuery.error ? getErrorMessage(previewQuery.error, t('Failed to load data preview')) : null;

    useEffect(() => {
        if (!previewData) {
            setSessionMeta({});
            return;
        }

        setSessionMeta({ columns: previewData.columns });
    }, [previewData, setSessionMeta]);

    const handleVTableStatsChange = useCallback(() => {}, []);

    const handleQueryInputChange = useCallback((nextQuery: string) => {
        setSearchInput(nextQuery);
    }, []);

    const handleSearchSubmit = useCallback(() => {
        setHasUserRequestedPreviewUpdate(true);
        const nextQuery = searchInput.trim();
        if (nextQuery === query) {
            void previewQuery.refetch();
            return;
        }
        setQuery(nextQuery);
        void setPagination({ pageIndex: 0 });
    }, [previewQuery, query, searchInput, setPagination]);

    const handleClearQuery = useCallback(() => {
        setHasUserRequestedPreviewUpdate(true);
        setSearchInput('');
        setQuery('');
        void setPagination({ pageIndex: 0 });
    }, [setPagination]);

    const handleUpsertFilter = useCallback(
        (filter: ColumnFilter) => {
            setHasUserRequestedPreviewUpdate(true);
            setActiveFilters(prev => {
                const others = prev.filter(item => item.col !== filter.col);
                return [...others, filter];
            });
            void setPagination({ pageIndex: 0 });
        },
        [setPagination],
    );

    const handleRemoveFilter = useCallback(
        (column: string) => {
            setHasUserRequestedPreviewUpdate(true);
            setActiveFilters(prev => prev.filter(filter => filter.col !== column));
            void setPagination({ pageIndex: 0 });
        },
        [setPagination],
    );

    const handleClearAllFilters = useCallback(() => {
        setHasUserRequestedPreviewUpdate(true);
        setActiveFilters([]);
        void setPagination({ pageIndex: 0 });
    }, [setPagination]);

    const handleSortChange = useCallback(
        (nextSort: TablePreviewSort | null) => {
            setHasUserRequestedPreviewUpdate(true);
            setSortState(nextSort);
            void setPagination({ pageIndex: 0 });
        },
        [setPagination],
    );

    const handlePageChange = useCallback(
        (newPageIndex: number) => {
            setHasUserRequestedPreviewUpdate(true);
            void setPagination({ pageIndex: newPageIndex });
        },
        [setPagination],
    );

    const handlePageSizeChange = useCallback(
        (newPageSize: number) => {
            setHasUserRequestedPreviewUpdate(true);
            void setPagination({ pageIndex: 0, pageSize: newPageSize });
        },
        [setPagination],
    );

    const handleRefresh = useCallback(() => {
        if (refreshing) return;
        setHasUserRequestedPreviewUpdate(true);
        void previewQuery.refetch();
    }, [previewQuery, refreshing]);

    const rowsSummaryValue = previewData?.totalRows ?? metadataTotalRowEstimate;
    const rowsSummaryTotal = previewData?.unfilteredTotalRows ?? metadataTotalRowEstimate ?? rowsSummaryValue;
    const totalRowsLabel = rowsSummaryTotal != null ? t('Pagination.TotalLabel', { total: rowsSummaryTotal.toLocaleString() }) : null;
    const rowsLabel = rowsSummaryValue != null ? t('Pagination.RowsLabel', { rows: rowsSummaryValue.toLocaleString() }) : null;

    const previewControls = (
        <div className="flex items-center justify-between w-full gap-3 flex-none">
            <div className="flex min-w-0 items-center gap-2">
                <VTableSearchBar
                    query={searchInput}
                    className="w-72 pl-0"
                    onQueryChange={handleQueryInputChange}
                    onClearQuery={handleClearQuery}
                    onSearchSubmit={handleSearchSubmit}
                />
                {totalRowsLabel && <div className="shrink-0 rounded-sm border bg-muted/40 px-2 py-1 text-xs tabular-nums text-muted-foreground">{totalRowsLabel}</div>}
            </div>
            <div className="flex min-w-0 items-center gap-2">
                <Button variant="ghost" size="sm" className="gap-2" onClick={handleRefresh} disabled={refreshing}>
                    <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    {t('Refresh')}
                </Button>
                <Popover>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={t('Current SQL')}>
                                    <FileText />
                                </Button>
                            </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent>{t('Current SQL')}</TooltipContent>
                    </Tooltip>
                    <PopoverContent align="end" className="w-[420px] p-0">
                        <div className="space-y-4 p-4">
                            <div className="space-y-1">
                                <div className="text-lg font-semibold text-foreground">{t('Current SQL')}</div>
                            </div>
                            <SmartCodeBlock value={currentPreviewSql || ' '} type="sql" maxHeightClassName="max-h-64" />
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );

    const previewProgress = <div className="h-0.5 flex-none">{refreshing ? <DataPreviewLoadingBar ariaLabel={t('Loading Data')} /> : null}</div>;

    if (!connectionId || !databaseName || !tableName) {
        return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{emptyMessage ?? t('No table preview')}</div>;
    }

    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <div>{error}</div>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                    <RotateCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    {t('Refresh')}
                </Button>
            </div>
        );
    }

    if (loading && rows.length === 0) {
        return (
            <div className="h-full min-h-0 flex flex-col">
                {previewControls}
                {previewProgress}
                <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-muted-foreground">{hasUserRequestedPreviewUpdate ? null : t('Loading Data')}</div>
            </div>
        );
    }

    if (rows.length === 0 && !loading) {
        return (
            <div className="h-full min-h-0 flex flex-col">
                {previewControls}
                {previewProgress}
                <VTableFilters
                    activeFilters={activeFilters}
                    columnsRaw={previewData?.columns ?? []}
                    onUpsertFilter={handleUpsertFilter}
                    onRemoveFilter={handleRemoveFilter}
                    onClearAllFilters={handleClearAllFilters}
                />
                <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-muted-foreground">{t('No data')}</div>
                <DataPreviewPaginationBar
                    pageIndex={pageIndex}
                    pageSize={pageSize}
                    totalRowEstimate={totalRowEstimate}
                    currentPageRowCount={rows.length}
                    rowsLabel={rowsLabel}
                    loading={refreshing}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                />
            </div>
        );
    }

    return (
        <div className="h-full min-h-0 flex flex-col">
            {previewControls}
            {previewProgress}

            <div className="flex-1 min-h-0">
                <VTable
                    results={rows}
                    storageKey={storageKey}
                    onStatsChange={handleVTableStatsChange}
                    showSearchBar={true}
                    activeFilters={activeFilters}
                    onUpsertFilter={handleUpsertFilter}
                    onRemoveFilter={handleRemoveFilter}
                    onClearAllFilters={handleClearAllFilters}
                    serverSideOperations={true}
                    initialSort={sortState}
                    onSortChange={handleSortChange}
                    setInspectorOpen={setInspectorOpen}
                    setInspectorMode={setInspectorMode}
                    setInspectorPayload={setInspectorPayload}
                />
            </div>

            <DataPreviewPaginationBar
                pageIndex={pageIndex}
                pageSize={pageSize}
                totalRowEstimate={totalRowEstimate}
                currentPageRowCount={rows.length}
                rowsLabel={rowsLabel}
                loading={refreshing}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
            />

            <InspectorPanel
                open={inspectorOpen}
                setOpen={setInspectorOpen}
                mode={inspectorMode}
                payload={inspectorPayload}
                rowViewMode={rowViewMode}
                setRowViewMode={setRowViewMode}
                inspectorWidth={inspectorWidth}
                setInspectorWidth={setInspectorWidth}
                inspectorTopOffset={56}
            />
        </div>
    );
}

export default function TableDataPreview({ activeTab, connectionId, databaseName, tableName }: TableDataPreviewProps) {
    const storageKey = useMemo(() => {
        if (activeTab?.tabId) return `${activeTab.tabId}:data-preview`;
        if (databaseName && tableName) return `preview:${databaseName}:${tableName}:data-preview`;
        return undefined;
    }, [activeTab?.tabId, databaseName, tableName]);

    const resolvedConnectionId = activeTab?.connectionId ?? connectionId;
    const resolvedDatabase = activeTab?.tabType === 'table' ? activeTab.databaseName : databaseName;
    const resolvedTable = activeTab?.tabType === 'table' ? activeTab.tableName : tableName;

    return <DataPreview connectionId={resolvedConnectionId} databaseName={resolvedDatabase} tableName={resolvedTable} storageKey={storageKey} source="table-tab-data-preview" />;
}

export function UrlDataPreview() {
    const params = useParams();
    const currentConnection = useAtomValue(currentConnectionAtom);
    const databaseName = normalizeParam(params?.database);
    const tableName = normalizeParam(params?.table);

    const storageKey = useMemo(() => {
        if (!databaseName || !tableName) return undefined;

        const connectionId = currentConnection?.connection?.id ?? 'default';
        return `url:${connectionId}:${databaseName}:${tableName}:data-preview`;
    }, [currentConnection?.connection?.id, databaseName, tableName]);

    return <DataPreview connectionId={currentConnection?.connection?.id} databaseName={databaseName} tableName={tableName} storageKey={storageKey} source="catalog-data-preview" />;
}
