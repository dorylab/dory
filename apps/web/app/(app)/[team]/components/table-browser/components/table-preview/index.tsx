'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { RotateCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useQuery } from '@/hooks/use-query';
import { useDB } from '@/lib/client/use-pglite';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { activeTabIdAtom } from '@/shared/stores/app.store';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ResultRow } from '@/types/sql-console';
import { SQLTab } from '@/types/tabs';
import {
    activeSessionIdAtom,
    runningTabsAtom,
    localDataLoadingAtom,
} from '../../../../[connectionId]/sql-console/sql-console.store';
import { VTableSearchBar } from '../../../../[connectionId]/sql-console/components/result-table/components/TableSearchBar';
import { currentSessionMetaAtom } from '../../../../[connectionId]/sql-console/components/result-table/stores/result-table.atoms';
import VTable from '../../../../[connectionId]/sql-console/components/result-table/vtable';
import { InspectorPanel } from '../../../../[connectionId]/sql-console/components/result-table/vtable/InspectorPanel';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '../../../../[connectionId]/sql-console/hooks/useSqlTableQueryBuilder';

interface TablePreviewProps {
    activeTab: SQLTab;
    onRefresh: (tab: SQLTab) => void | Promise<void>;
}

function normalizeParam(value?: string | string[]) {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
}

function buildPreviewSql(databaseName?: string, tableName?: string) {
    if (!tableName) return '';
    const hasDbInName = tableName.includes('.');
    const prefix = databaseName && !hasDbInName ? `${databaseName}.` : '';
    return `SELECT * FROM ${prefix}${tableName} LIMIT ${DEFAULT_TABLE_PREVIEW_LIMIT}`;
}

export default function TablePreview({ activeTab, onRefresh }: TablePreviewProps) {
    const tabId = useAtomValue(activeTabIdAtom);
    const sessionId = useAtomValue(activeSessionIdAtom);
    const runningTabs = useAtomValue(runningTabsAtom);
    const localLoading = useAtomValue(localDataLoadingAtom);
    const sessionMeta = useAtomValue(currentSessionMetaAtom);
    const setSessionMeta = useSetAtom(currentSessionMetaAtom);

    const { dbReady, listResultSetsMeta, getResultRows, dataVersion } = useDB();

    const [query, setQuery] = useState('');
    const [rows, setRows] = useState<ResultRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ filteredCount: 0, totalCount: 0 });

    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectorMode, setInspectorMode] = useState<'cell' | 'row' | null>(null);
    const [inspectorPayload, setInspectorPayload] = useState<any>(null);
    const [rowViewMode, setRowViewMode] = useState<'table' | 'json'>('table');
    const [inspectorWidth, setInspectorWidth] = useState(360);
    const t = useTranslations('TableBrowser');

    const storageKey = useMemo(() => {
        if (!tabId || !sessionId) return undefined;
        return `${tabId}:${sessionId}:table-preview`;
    }, [tabId, sessionId]);

    
    useEffect(() => {
        setRows([]);
        setSessionMeta({});
        setQuery('');
        setStats({ filteredCount: 0, totalCount: 0 });
        setInspectorOpen(false);
        setInspectorMode(null);
        setInspectorPayload(null);
        setRowViewMode('table');
    }, [sessionId, setSessionMeta]);

    
    useEffect(() => {
        if (!dbReady || !sessionId) return;

        let canceled = false;
        setLoading(true);

        (async () => {
            try {
                const metas = await listResultSetsMeta(sessionId);
                const first = metas?.find(m => m.setIndex === 0) ?? metas?.[0];

                if (canceled) return;

                if (first) {
                    setSessionMeta(first);
                    const resultRows = await getResultRows(sessionId, first.setIndex);
                    if (!canceled && resultRows) {
                        setRows(resultRows);
                        setStats({
                            filteredCount: resultRows.length,
                            totalCount: resultRows.length,
                        });
                    }
                } else {
                    
                    
                    setRows([]);
                    setStats({ filteredCount: 0, totalCount: 0 });
                }
            } catch (e) {
                console.error('Failed to load table preview', e);
            } finally {
                if (!canceled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            canceled = true;
        };
    }, [dbReady, sessionId, dataVersion, listResultSetsMeta, getResultRows, setSessionMeta]);

    const filteredResults = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return rows;

        const columns = (sessionMeta?.columns ?? [])
            .map((x: any) => x?.name)
            .filter(Boolean);

        if (columns.length === 0) return rows;

        return rows.filter(row => {
            for (const c of columns) {
                const v = row.rowData?.[c];
                const s =
                    v == null
                        ? ''
                        : typeof v === 'object'
                            ? JSON.stringify(v)
                            : String(v);
                if (s.toLowerCase().includes(keyword)) return true;
            }
            return false;
        });
    }, [rows, sessionMeta, query]);

    
    useEffect(() => {
        if (filteredResults.length === 0) {
            setStats({
                filteredCount: 0,
                totalCount: rows.length,
            });
        }
    }, [filteredResults.length, rows.length]);

    const showLocalLoading = tabId ? localLoading[tabId] && rows.length === 0 : false;
    const showRunning = tabId ? runningTabs[tabId] === 'running' : false;
    const isRefreshing = loading || showRunning || showLocalLoading;

    const onStatsChange = useCallback(
        (s: { filteredCount: number }) => {
            setStats({
                filteredCount: s.filteredCount,
                totalCount: filteredResults.length,
            });
        },
        [filteredResults.length],
    );

    const handleRefresh = useCallback(() => {
        if (isRefreshing) return;
        void onRefresh(activeTab);
    }, [activeTab, isRefreshing, onRefresh]);

    

    if (!sessionId) {
        return (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {t('No table preview')}
            </div>
        );
    }

    if (showRunning) {
        return (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {t('Loading preview')}
            </div>
        );
    }

    if (rows.length === 0 && !loading && !showLocalLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <div>{t('No data')}</div>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                    <RotateCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
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
                <Button variant="ghost" size="sm" className="gap-2" onClick={handleRefresh} disabled={isRefreshing}>
                    <RotateCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
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

export function UrlTablePreview() {
    const params = useParams();
    const databaseName = normalizeParam(params?.database);
    const tableName = normalizeParam(params?.table);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const { run } = useQuery();
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

    const sql = useMemo(() => buildPreviewSql(databaseName, tableName), [databaseName, tableName]);

    const storageKey = useMemo(() => {
        if (!databaseName || !tableName) return undefined;
        const connectionId = currentConnection?.connection?.id ?? 'default';
        return `url:${connectionId}:${databaseName}:${tableName}:table-preview`;
    }, [currentConnection?.connection?.id, databaseName, tableName]);

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
    }, [databaseName, tableName, setSessionMeta]);

    const runPreview = useCallback(
        async (signal?: AbortSignal) => {
            if (!databaseName || !tableName || !sql) return;
            setLoading(true);
            setError(null);
            try {
                const res = await run(
                    { sql, database: databaseName, source: 'catalog-table-preview' },
                    { signal },
                );
                if (isSuccess(res as any)) {
                    const firstSet = res?.data?.queryResultSets?.[0] ?? null;
                    const resultRows = res?.data?.results?.[0] ?? [];
                    const normalizedRows = Array.isArray(resultRows) ? resultRows : [];
                    const inferredColumns =
                        normalizedRows.length > 0 ? Object.keys(normalizedRows[0] ?? {}) : [];
                    const columnMeta = (firstSet?.columns ?? [])
                        .map((col: any) => {
                            const name = col?.name ?? col?.columnName ?? String(col ?? '');
                            if (!name) return null;
                            return col?.name ? col : { name };
                        })
                        .filter(Boolean);

                    const columns =
                        columnMeta.length > 0
                            ? columnMeta
                            : inferredColumns.map(name => ({ name }));

                    setSessionMeta({ columns });

                    const tabId = `url:${databaseName}:${tableName}`;
                    const mappedRows = normalizedRows.map((row, idx) => ({
                        tabId,
                        rid: idx,
                        rowData: row,
                    }));
                    setRows(mappedRows);
                    setStats({
                        filteredCount: mappedRows.length,
                        totalCount: mappedRows.length,
                    });
                } else {
                    setError(res?.message ?? t('Failed to load data preview'));
                }
            } catch (e: any) {
                if (e?.name === 'AbortError') return;
                setError(e?.message ?? t('Failed to load data preview'));
            } finally {
                setLoading(false);
            }
        },
        [databaseName, tableName, run, sql, setSessionMeta, t],
    );

    useEffect(() => {
        if (!databaseName || !tableName) return;
        const controller = new AbortController();
        void runPreview(controller.signal);
        return () => controller.abort();
    }, [databaseName, tableName, runPreview]);

    const filteredResults = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return rows;

        const columns = (sessionMeta?.columns ?? [])
            .map((x: any) => x?.name)
            .filter(Boolean);

        if (columns.length === 0) return rows;

        return rows.filter(row => {
            for (const c of columns) {
                const v = row.rowData?.[c];
                const s =
                    v == null
                        ? ''
                        : typeof v === 'object'
                            ? JSON.stringify(v)
                            : String(v);
                if (s.toLowerCase().includes(keyword)) return true;
            }
            return false;
        });
    }, [rows, sessionMeta, query]);

    useEffect(() => {
        if (filteredResults.length === 0) {
            setStats({
                filteredCount: 0,
                totalCount: rows.length,
            });
        }
    }, [filteredResults.length, rows.length]);

    const onStatsChange = useCallback(
        (s: { filteredCount: number }) => {
            setStats({
                filteredCount: s.filteredCount,
                totalCount: filteredResults.length,
            });
        },
        [filteredResults.length],
    );

    const handleRefresh = useCallback(() => {
        if (loading) return;
        void runPreview();
    }, [loading, runPreview]);

    if (!databaseName || !tableName) {
        return (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {t('No table preview')}
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
