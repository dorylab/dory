'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { RotateCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { fetchTablePreview } from '../../lib/fetch-table-preview';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ResultRow } from '@/types/sql-console';
import { SQLTab } from '@/types/tabs';
import { VTableSearchBar } from '../../../../[connectionId]/sql-console/components/result-table/components/TableSearchBar';
import { currentSessionMetaAtom } from '../../../../[connectionId]/sql-console/components/result-table/stores/result-table.atoms';
import VTable from '../../../../[connectionId]/sql-console/components/result-table/vtable';
import { InspectorPanel } from '../../../../[connectionId]/sql-console/components/result-table/vtable/InspectorPanel';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';

type PreviewColumn = {
    name: string;
};

type PreviewResultSet = {
    columns?: Array<Record<string, unknown>> | null;
};

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

function normalizeParam(value?: string | string[]) {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
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

function DataPreview({
    connectionId,
    databaseName,
    tableName,
    storageKey,
    source = 'table-browser-data-preview',
    emptyMessage,
}: DataPreviewProps) {
    const t = useTranslations('TableBrowser');
    const sessionMeta = useAtomValue(currentSessionMetaAtom);
    const setSessionMeta = useSetAtom(currentSessionMetaAtom);

    const [query, setQuery] = useState('');
    const [rows, setRows] = useState<ResultRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState({ filteredCount: 0, totalCount: 0 });
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectorMode, setInspectorMode] = useState<'cell' | 'row' | null>(null);
    const [inspectorPayload, setInspectorPayload] = useState<any>(null);
    const [rowViewMode, setRowViewMode] = useState<'table' | 'json'>('table');
    const [inspectorWidth, setInspectorWidth] = useState(360);

    useEffect(() => {
        setRows([]);
        setSessionMeta({});
        setQuery('');
        setStats({ filteredCount: 0, totalCount: 0 });
        setInspectorOpen(false);
        setInspectorMode(null);
        setInspectorPayload(null);
        setRowViewMode('table');
        setError(null);
    }, [connectionId, databaseName, tableName, setSessionMeta]);

    const runPreview = useCallback(
        async (signal?: AbortSignal) => {
            if (!connectionId || !databaseName || !tableName) return;

            setLoading(true);
            setError(null);

            try {
                const res = await fetchTablePreview({
                    connectionId,
                    databaseName,
                    tableName,
                    limit: DEFAULT_TABLE_PREVIEW_LIMIT,
                    source,
                    signal,
                });

                if (!isSuccess(res as any)) {
                    setError(res?.message ?? t('Failed to load data preview'));
                    return;
                }

                const firstSet = (res?.data?.queryResultSets?.[0] ?? null) as PreviewResultSet | null;
                const rawRows = Array.isArray(res?.data?.results?.[0]) ? (res.data.results[0] as Record<string, unknown>[]) : [];
                const nextStorageKey = storageKey ?? `preview:${connectionId}:${databaseName}:${tableName}`;
                const mappedRows = mapPreviewRows(rawRows, nextStorageKey);

                setSessionMeta({ columns: buildColumns(rawRows, firstSet) });
                setRows(mappedRows);
                setStats({
                    filteredCount: mappedRows.length,
                    totalCount: mappedRows.length,
                });
            } catch (e: any) {
                if (e?.name === 'AbortError') return;
                setError(e?.message ?? t('Failed to load data preview'));
            } finally {
                setLoading(false);
            }
        },
        [connectionId, databaseName, source, storageKey, tableName, setSessionMeta, t],
    );

    useEffect(() => {
        if (!connectionId || !databaseName || !tableName) return;

        const controller = new AbortController();
        void runPreview(controller.signal);

        return () => controller.abort();
    }, [connectionId, databaseName, tableName, runPreview]);

    const filteredResults = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return rows;

        const columns = (sessionMeta?.columns ?? [])
            .map((column: any) => column?.name)
            .filter(Boolean);

        if (columns.length === 0) return rows;

        return rows.filter(row => {
            for (const column of columns) {
                const value = row.rowData?.[column];
                const normalized =
                    value == null
                        ? ''
                        : typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value);

                if (normalized.toLowerCase().includes(keyword)) {
                    return true;
                }
            }

            return false;
        });
    }, [query, rows, sessionMeta]);

    useEffect(() => {
        if (filteredResults.length === 0) {
            setStats({
                filteredCount: 0,
                totalCount: rows.length,
            });
        }
    }, [filteredResults.length, rows.length]);

    const onStatsChange = useCallback(
        (nextStats: { filteredCount: number }) => {
            setStats({
                filteredCount: nextStats.filteredCount,
                totalCount: filteredResults.length,
            });
        },
        [filteredResults.length],
    );

    const handleRefresh = useCallback(() => {
        if (loading) return;
        void runPreview();
    }, [loading, runPreview]);

    if (!connectionId || !databaseName || !tableName) {
        return (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {emptyMessage ?? t('No table preview')}
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <div>{error}</div>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                    <RotateCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    {t('Refresh')}
                </Button>
            </div>
        );
    }

    if (loading && rows.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {t('Loading preview')}
            </div>
        );
    }

    if (rows.length === 0 && !loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <div>{t('No data')}</div>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                    <RotateCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    {t('Refresh')}
                </Button>
            </div>
        );
    }

    return (
        <div className="h-full min-h-0">
            <div className="flex items-center justify-between w-full gap-3">
                <VTableSearchBar
                    query={query}
                    className="w-96 pl-0"
                    onQueryChange={setQuery}
                    onClearQuery={() => setQuery('')}
                    filteredCount={stats.filteredCount}
                    totalCount={stats.totalCount}
                />
                <Button variant="ghost" size="sm" className="gap-2" onClick={handleRefresh} disabled={loading}>
                    <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    {t('Refresh')}
                </Button>
            </div>

            <VTable
                results={filteredResults}
                storageKey={storageKey}
                onStatsChange={onStatsChange}
                showSearchBar={true}
                setInspectorOpen={setInspectorOpen}
                setInspectorMode={setInspectorMode}
                setInspectorPayload={setInspectorPayload}
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

    return (
        <DataPreview
            connectionId={resolvedConnectionId}
            databaseName={resolvedDatabase}
            tableName={resolvedTable}
            storageKey={storageKey}
            source="table-tab-data-preview"
        />
    );
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

    return (
        <DataPreview
            connectionId={currentConnection?.connection?.id}
            databaseName={databaseName}
            tableName={tableName}
            storageKey={storageKey}
            source="catalog-data-preview"
        />
    );
}
