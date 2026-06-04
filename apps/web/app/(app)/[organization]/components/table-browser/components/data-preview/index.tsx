'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { RotateCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';

import { fetchTablePreview } from '../../lib/fetch-table-preview';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ResultRow } from '@dory/shared/types/sql-console';
import { SQLTab } from '@dory/shared/types/tabs';
import { VTableSearchBar } from '../../../../[connectionId]/sql-console/components/result-table/components/TableSearchBar';
import { currentSessionMetaAtom } from '../../../../[connectionId]/sql-console/components/result-table/stores/result-table.atoms';
import VTable from '../../../../[connectionId]/sql-console/components/result-table/vtable';
import { InspectorPanel } from '../../../../[connectionId]/sql-console/components/result-table/vtable/InspectorPanel';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';
import { useTablePropertiesQuery } from '../table-queries';
import { DataPreviewPaginationBar } from './DataPreviewPaginationBar';

type PreviewColumn = {
    name: string;
};

type PreviewResultSet = {
    columns?: Array<Record<string, unknown>> | null;
};

type PreviewStats = {
    filteredCount: number;
    totalCount: number;
};

type PreviewCacheEntry = {
    columns: PreviewColumn[];
    rows: ResultRow[];
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

function normalizeParam(value?: string | string[]) {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
}

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function getColumnName(column: unknown) {
    if (!column || typeof column !== 'object' || !('name' in column)) return null;
    const name = column.name;
    return typeof name === 'string' && name.trim() ? name : null;
}

function isString(value: string | null): value is string {
    return value !== null;
}

function buildPreviewQueryKey({
    connectionId,
    databaseName,
    tableName,
    storageKey,
    source,
    pageIndex,
    pageSize,
}: {
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    storageKey?: string;
    source: string;
    pageIndex: number;
    pageSize: number;
}) {
    return ['table-preview', source, connectionId, databaseName, tableName, storageKey, pageIndex, pageSize] as const;
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

function DataPreview(props: DataPreviewProps) {
    const { connectionId, databaseName, tableName, source = 'table-browser-data-preview' } = props;
    const resetKey = [source, connectionId, databaseName, tableName].join('::');

    return <DataPreviewInner key={resetKey} {...props} source={source} />;
}

function DataPreviewInner({ connectionId, databaseName, tableName, storageKey, source = 'table-browser-data-preview', emptyMessage }: DataPreviewProps) {
    const t = useTranslations('TableBrowser');
    const sessionMeta = useAtomValue(currentSessionMetaAtom);
    const setSessionMeta = useSetAtom(currentSessionMetaAtom);

    const [query, setQuery] = useState('');
    const [vtableStats, setVtableStats] = useState<{ filteredCount: number } | null>(null);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectorMode, setInspectorMode] = useState<'cell' | 'row' | null>(null);
    const [inspectorPayload, setInspectorPayload] = useState<InspectorPayload>(null);
    const [rowViewMode, setRowViewMode] = useState<'table' | 'json'>('table');
    const [inspectorWidth, setInspectorWidth] = useState(360);
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PREVIEW_LIMIT);

    const { data: tableProperties } = useTablePropertiesQuery({ connectionId, databaseName, tableName });
    const totalRowEstimate = tableProperties?.totalRows ?? null;

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
            }),
        [connectionId, databaseName, pageIndex, pageSize, source, storageKey, tableName],
    );

    const previewQuery = useQuery({
        queryKey: previewQueryKey,
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: PREVIEW_STALE_TIME,
        gcTime: PREVIEW_GC_TIME,
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

            return {
                columns: buildColumns(rawRows, firstSet),
                rows: mappedRows,
                stats: {
                    filteredCount: mappedRows.length,
                    totalCount: mappedRows.length,
                },
            } satisfies PreviewCacheEntry;
        },
    });

    const previewData = previewQuery.data;
    const rows = useMemo(() => previewData?.rows ?? EMPTY_ROWS, [previewData]);
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

    const filteredResults = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return rows;

        const metaColumns = Array.isArray(sessionMeta?.columns) ? (sessionMeta.columns as unknown[]) : [];
        const columns = metaColumns.map(getColumnName).filter(isString);

        if (columns.length === 0) return rows;

        return rows.filter(row => {
            for (const column of columns) {
                const value = row.rowData?.[column];
                const normalized = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);

                if (normalized.toLowerCase().includes(keyword)) {
                    return true;
                }
            }

            return false;
        });
    }, [query, rows, sessionMeta]);

    const stats = useMemo<PreviewStats>(() => {
        if (query.trim() && filteredResults.length === 0) {
            return {
                filteredCount: 0,
                totalCount: rows.length,
            };
        }

        if (vtableStats) {
            return {
                filteredCount: vtableStats.filteredCount,
                totalCount: filteredResults.length,
            };
        }

        return previewData?.stats ?? { filteredCount: rows.length, totalCount: rows.length };
    }, [filteredResults.length, previewData?.stats, query, rows.length, vtableStats]);

    const onStatsChange = useCallback((nextStats: { filteredCount: number }) => {
        setVtableStats({
            filteredCount: nextStats.filteredCount,
        });
    }, []);

    const handleQueryChange = useCallback((nextQuery: string) => {
        setQuery(nextQuery);
        setVtableStats(null);
    }, []);

    const handleClearQuery = useCallback(() => {
        setQuery('');
        setVtableStats(null);
    }, []);

    const handlePageChange = useCallback((newPageIndex: number) => {
        setVtableStats(null);
        setPageIndex(newPageIndex);
    }, []);

    const handlePageSizeChange = useCallback((newPageSize: number) => {
        setVtableStats(null);
        setPageSize(newPageSize);
        setPageIndex(0);
    }, []);

    const handleRefresh = useCallback(() => {
        if (refreshing) return;
        void previewQuery.refetch();
    }, [previewQuery, refreshing]);

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
        return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{t('Loading preview')}</div>;
    }

    if (rows.length === 0 && !loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <div>{t('No data')}</div>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                    <RotateCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    {t('Refresh')}
                </Button>
            </div>
        );
    }

    return (
        <div className="h-full min-h-0 flex flex-col">
            <div className="flex items-center justify-between w-full gap-3 flex-none">
                <VTableSearchBar
                    query={query}
                    className="w-96 pl-0"
                    onQueryChange={handleQueryChange}
                    onClearQuery={handleClearQuery}
                    filteredCount={query.trim() ? stats.filteredCount : undefined}
                    totalCount={query.trim() ? stats.totalCount : undefined}
                />
                <Button variant="ghost" size="sm" className="gap-2" onClick={handleRefresh} disabled={refreshing}>
                    <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    {t('Refresh')}
                </Button>
            </div>

            <div className="flex-1 min-h-0">
                <VTable
                    results={filteredResults}
                    storageKey={storageKey}
                    onStatsChange={onStatsChange}
                    showSearchBar={true}
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
