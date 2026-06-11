'use client';

import React, { Activity, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, MoreHorizontal, RefreshCw } from 'lucide-react';

import VTable from './vtable';
import { InspectorPanel } from './vtable/InspectorPanel';
import { activeTabIdAtom } from '@/shared/stores/app.store';
import { activeSessionIdAtom, localDataLoadingAtom, runningTabsAtom, selectedResultRowIndexesByKeyAtom } from '../../sql-console.store';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCsvDownload } from './hooks/use-csv-download';
import { useDB } from '@/lib/client/use-pglite';
import { MetaState } from '@dory/shared/types/sql-console';
import { Toolbar } from './Toolbar';
import type { ExecMeta } from './Toolbar';
import { makeCacheKey, hydrateFromCache, touchCache, RESULTS_CACHE } from './hooks/useResultsCache';
import { OverviewItem, ResultRow } from './types';
import { useSessionMeta } from './hooks/useSessionMeta';
import { debugModeAtom, uiRowBudgetAtom } from './stores/prefs.atoms';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { OverviewTable } from './OverviewTable';
import { currentSessionMetaAtom } from './stores/result-table.atoms';
import { chartStatesByKeyAtom, viewModesByTabAtom } from './components/charts/stores/chart-state.atoms';
import { ResultStatusBar } from './ResultStatusBar';
import { DebugPanel, DebugPayload } from './components/DebugPanel';
import { makeSetUserPickedAtom, makeActiveSetAtom, makeAutoSetActiveSetAtom, makeSetActiveSetAtom, makeUserPickedAtom } from './stores/active-set.atoms';
import { useAutoJumpToLastResult } from './hooks/useAutoJumpToLastResult';
import { SQLErrorAlert } from './components/SQLErrorAlert';
import { VTableSearchBar } from './components/TableSearchBar';
import { Charts } from './components/charts';
import { useLocale, useTranslations } from 'next-intl';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useVTableFilters, VTableFilters } from './vtable/VTableFilters';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import type { ColumnFilter } from './vtable/type';
import type { ResultSetViewState } from '@/lib/client/type';
/* =================================== constants =================================== */

const MAX_ROWS_HINT = 5_000_000; // UI hint only
const OVERVIEW_SET = -1;
type ResultViewMode = 'table' | 'charts';

function serializeViewFilters(filters: ColumnFilter[]): NonNullable<ResultSetViewState['filters']> {
    return filters.map(filter => ({
        column: filter.col,
        op: filter.op,
        value:
            filter.kind === 'range'
                ? {
                      from: filter.value,
                      to: filter.valueTo,
                      rangeValueType: filter.rangeValueType,
                  }
                : {
                      value: filter.value,
                      caseSensitive: filter.caseSensitive ?? false,
                  },
    }));
}

function deserializeViewFilters(filters: ResultSetViewState['filters']): ColumnFilter[] {
    return (filters ?? []).map(filter => {
        const payload = filter.value;
        if (filter.op === 'range' && payload && typeof payload === 'object') {
            const range = payload as { from?: unknown; to?: unknown; rangeValueType?: unknown };
            return {
                col: String(filter.column),
                kind: 'range',
                op: 'range',
                value: range.from == null ? undefined : String(range.from),
                valueTo: range.to == null ? undefined : String(range.to),
                rangeValueType: range.rangeValueType === 'date' ? 'date' : 'number',
            };
        }

        const scalar = payload && typeof payload === 'object' ? (payload as { value?: unknown; caseSensitive?: unknown }) : null;
        const rawValue = scalar ? scalar.value : payload;
        const isNumeric =
            typeof rawValue === 'number' ||
            (typeof rawValue === 'string' &&
                rawValue.trim() !== '' &&
                Number.isFinite(Number(rawValue)) &&
                !['contains', 'equals', 'startsWith', 'endsWith', 'empty', 'notEmpty', 'regex'].includes(filter.op));

        return {
            col: String(filter.column),
            kind: isNumeric ? 'number' : 'string',
            op: filter.op as any,
            value: rawValue == null ? undefined : String(rawValue),
            caseSensitive: scalar?.caseSensitive === true,
        };
    });
}

function areNumberArraysEqual(left: number[] | undefined, right: number[] | undefined) {
    if (left === right) return true;
    if (!left || !right) return !left && !right;
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

/* =================================== component =================================== */

export function ResultTable() {
    const t = useTranslations('SqlConsole');
    const locale = useLocale();
    const [viewModesByKey, setViewModesByKey] = useAtom(viewModesByTabAtom);
    const [currentViewMode, setCurrentViewMode] = useState<ResultViewMode>('table');
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectorMode, setInspectorMode] = useState<'cell' | 'row' | null>(null);
    const [inspectorPayload, setInspectorPayload] = useState<any>(null);
    const [rowViewMode, setRowViewMode] = useState<'table' | 'json'>('table');
    const [inspectorWidth, setInspectorWidth] = useState(360);
    const [meta, setMeta] = useState<MetaState>({});
    const [sessionMetas, setSessionMetas] = useAtom(currentSessionMetaAtom);

    const [debugMode, setDebugMode] = useAtom(debugModeAtom);
    const [uiRowBudget, setUiRowBudget] = useAtom(uiRowBudgetAtom);
    const runningTabs = useAtomValue(runningTabsAtom);

    // Atoms
    const tabId = useAtomValue(activeTabIdAtom);
    const sessionIdFromAtom = useAtomValue(activeSessionIdAtom);
    const sessionId = sessionIdFromAtom ?? (typeof window !== 'undefined' ? (localStorage.getItem(`sqlconsole:sessionId:${tabId}`) ?? undefined) : undefined);

    const { dbReady, listResultSetIndices, listResultSetsMeta, getResultRows, clearResults, dataVersion, getSession, updateResultSetViewState } = useDB();

    // Session status
    const [sessionStatus, setSessionStatus] = useState<'running' | 'success' | 'error' | 'canceled' | null>(null);
    const lastSessionRef = useRef<string | null>(null);

    const [indices, setIndices] = useState<number[]>([]);
    const prevStatusRef = useRef<'running' | 'success' | 'error' | 'canceled' | null | undefined>(null);

    const readActiveSetAtom = useMemo(() => makeActiveSetAtom(tabId, sessionId), [tabId, sessionId]);
    const manualSetAtom = useMemo(() => makeSetActiveSetAtom(tabId, sessionId), [tabId, sessionId]);
    const autoSetAtom = useMemo(() => makeAutoSetActiveSetAtom(tabId, sessionId), [tabId, sessionId]);

    const activeSet = useAtomValue(readActiveSetAtom);
    const setActiveSet = useSetAtom(manualSetAtom);
    const autoSetActiveSet = useSetAtom(autoSetAtom);

    const userPickedAtom = useMemo(() => makeUserPickedAtom(tabId, sessionId), [tabId, sessionId]);
    const userPicked = useAtomValue(userPickedAtom);

    useAutoJumpToLastResult({
        tabId,
        sessionId,
        indices,
        sessionStatus, // 'running' | 'success' | 'error' | 'canceled' | null

        userPicked,
        autoSetActiveSet: v => autoSetActiveSet(v),
        getCurrentActiveSet: () => (typeof activeSet === 'number' ? activeSet : undefined),
    });

    // Rows / Loading
    const firstChunkArrivedRef = useRef(false);

    // Accumulator + one-frame flush
    const rafRef = useRef<number | null>(null);
    const fetchControllerRef = useRef<AbortController | null>(null);

    const lastTabIdRef = useRef<string | null>(null);

    // Rows / Loading
    const [results, setResults] = useState<ResultRow[]>([]);
    const [localDataLoading, setLocalDataLoading] = useAtom(localDataLoadingAtom);

    // Accumulator + one-frame flush
    const resultsRef = useRef<ResultRow[]>([]);

    useSessionMeta({ dbReady, tabId, sessionId, activeSet, dataVersion, getSession, setMeta, sessionStatus });

    const storageKey = useMemo(() => (tabId && sessionId ? `${tabId}:${sessionId}#${activeSet}` : 'unknown'), [tabId, sessionId, activeSet]);
    const viewModeKey = useMemo(() => (tabId && activeSet >= 0 ? `tab:${tabId}:set:${activeSet}` : 'unknown'), [activeSet, tabId]);

    const showEmpty = !localDataLoading[tabId] && results.length === 0;
    const noSessionId = !sessionId;
    const showLocalLoading = localDataLoading[tabId] && !firstChunkArrivedRef.current;
    const isResult = activeSet >= 0;

    const limited = !!sessionMetas?.limited;
    const limitText = typeof sessionMetas?.limit === 'number' ? sessionMetas.limit.toLocaleString() : null;
    const shouldShowLimitNotice = isResult && limited;

    const [query, setQuery] = useState('');
    const [sortState, setSortState] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
    const [selectedRowIndexes, setSelectedRowIndexes] = useState<number[]>([]);
    const setSelectedRowIndexesByKey = useSetAtom(selectedResultRowIndexesByKeyAtom);
    const hydratedViewStateKeyRef = useRef<string | null>(null);
    const persistedViewStateRef = useRef<string | null>(null);
    const [chartStatesByKey, setChartStatesByKey] = useAtom(chartStatesByKeyAtom);
    const [chartStateVersionByTab, setChartStateVersionByTab] = useState<Record<string, number>>({});
    const [chartSnapshotsBySet, setChartSnapshotsBySet] = useState<Record<number, { rows: Array<{ rowData: Record<string, unknown> }>; columnsRaw?: unknown }>>({});
    const rowCount = results.length;

    useEffect(() => {
        const savedViewMode = viewModesByKey[viewModeKey];
        const nextViewMode: ResultViewMode = savedViewMode === 'charts' ? 'charts' : 'table';
        setCurrentViewMode(nextViewMode);
        if (savedViewMode === 'overview') {
            setViewModesByKey(prev => ({
                ...prev,
                [viewModeKey]: 'table',
            }));
        }
    }, [setViewModesByKey, viewModeKey, viewModesByKey]);

    const chartSetIndices = useMemo(() => {
        const indicesFromSnapshot = Object.keys(chartSnapshotsBySet)
            .map(value => Number(value))
            .filter(value => Number.isFinite(value) && value >= 0);

        if (activeSet >= 0 && !indicesFromSnapshot.includes(activeSet)) {
            indicesFromSnapshot.push(activeSet);
        }

        return indicesFromSnapshot.sort((a, b) => a - b);
    }, [activeSet, chartSnapshotsBySet]);

    const setUserPickedFalse = useSetAtom(useMemo(() => makeSetUserPickedAtom(tabId, sessionId), [tabId, sessionId]));

    const debugPayload: DebugPayload = {
        tabId,
        sessionId: sessionId ?? undefined,
        activeSet,
        rowCount,
        sessionStatus,
        storageKey,
        meta: {
            truncated: !!meta.truncated,
            durationMs: meta.durationMs,
            startedAt: meta.startedAt,
            finishedAt: meta.finishedAt,
            fromCache: meta.fromCache,
            scannedRows: meta.scannedRows,
            scannedBytes: meta.scannedBytes,
            source: meta.source,
            syncing: !!meta.syncing,
            uiRowBudget,
        },
    };

    const [setsMeta, setSetsMeta] = useState<
        Array<{
            sessionId: string;
            setIndex: number;
            sqlText: string;
            status: 'success' | 'error';
            startedAt?: number | null;
            finishedAt?: number | null;
            durationMs?: number | null;
            rowCount?: number | null;
            affectedRows?: number | null;
            errorMessage?: string | null;
            limited?: boolean;
            limit?: number | null;
        }>
    >([]);

    useEffect(() => {
        const prev = prevStatusRef.current;
        const now = sessionStatus;
        if (prev !== 'running' && now === 'running') {
            setUserPickedFalse(false);
        }
        prevStatusRef.current = now;
    }, [sessionStatus, setUserPickedFalse]);

    useEffect(() => {
        if (!dbReady || !sessionId) {
            setSessionMetas({});
            return;
        }

        let canceled = false;
        (async () => {
            const metas = await listResultSetsMeta(sessionId);
            const currentSessionMeta = metas?.find(m => m.sessionId === sessionId && m.setIndex === activeSet) ?? { columns: [] };
            if (!canceled) {
                setSessionMetas(currentSessionMeta);
            }
        })();

        return () => {
            canceled = true;
        };
    }, [dbReady, sessionId, dataVersion, activeSet]);

    const filteredResults = useMemo(() => {
        const hasGlobal = query.trim().length > 0;
        const gq = query.trim().toLowerCase();
        if (!hasGlobal) return results;

        return results.filter(row => {
            if (hasGlobal) {
                let hit = false;
                for (const c of sessionMetas.columns.map((x: any) => x.name)) {
                    const v = row.rowData?.[c];
                    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                    if (s.toLowerCase().includes(gq)) {
                        hit = true;
                        break;
                    }
                }
                if (!hit) return false;
            }
            return true;
        });
    }, [results, sessionMetas, query]);

    const {
        activeFilters,
        filteredResults: columnFilteredResults,
        setColumnFilter,
        removeFilter,
        clearAllFilters,
        replaceFilters,
    } = useVTableFilters({
        results: filteredResults,
        storageKey,
        disableStorage: true,
    });

    useEffect(() => {
        if (!sessionId || activeSet < 0) {
            hydratedViewStateKeyRef.current = null;
            setQuery('');
            setSortState(null);
            setSelectedRowIndexes([]);
            if (storageKey !== 'unknown') {
                setSelectedRowIndexesByKey(prev => {
                    if (!prev[storageKey]) return prev;
                    const next = { ...prev };
                    delete next[storageKey];
                    return next;
                });
            }
            replaceFilters([]);
            return;
        }

        const viewStateKey = `${sessionId}:${activeSet}`;
        if (hydratedViewStateKeyRef.current === viewStateKey) {
            return;
        }

        hydratedViewStateKeyRef.current = viewStateKey;
        const viewState = (sessionMetas.viewState ?? null) as ResultSetViewState | null;
        persistedViewStateRef.current = JSON.stringify({
            searchText: viewState?.searchText ?? undefined,
            sorts: viewState?.sorts?.[0] ? [viewState.sorts[0]] : undefined,
            filters: viewState?.filters ?? undefined,
            hiddenColumns: [],
            pinnedColumns: [],
            selectedRowIndexes: viewState?.selectedRowIndexes?.length ? viewState.selectedRowIndexes : undefined,
        });

        setQuery(viewState?.searchText ?? '');
        setSortState(viewState?.sorts?.[0] ?? null);
        setSelectedRowIndexes(viewState?.selectedRowIndexes ?? []);
        replaceFilters(deserializeViewFilters(viewState?.filters));
    }, [activeSet, replaceFilters, sessionId, sessionMetas.viewState, setSelectedRowIndexesByKey, storageKey]);

    useEffect(() => {
        if (activeSet < 0) {
            return;
        }
        if (localDataLoading[tabId]) {
            return;
        }

        setChartSnapshotsBySet(prev => ({
            ...prev,
            [activeSet]: {
                rows: columnFilteredResults as Array<{ rowData: Record<string, unknown> }>,
                columnsRaw: sessionMetas.columns,
            },
        }));
    }, [activeSet, columnFilteredResults, localDataLoading, sessionMetas.columns, tabId]);

    useEffect(() => {
        if (!sessionId || activeSet < 0) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            const nextViewState = {
                searchText: query || undefined,
                sorts: sortState ? [sortState] : undefined,
                filters: activeFilters.length > 0 ? serializeViewFilters(activeFilters) : undefined,
                hiddenColumns: [],
                pinnedColumns: [],
                selectedRowIndexes: selectedRowIndexes.length > 0 ? selectedRowIndexes : undefined,
            };
            const serialized = JSON.stringify(nextViewState);
            if (persistedViewStateRef.current === serialized) {
                return;
            }
            persistedViewStateRef.current = serialized;
            void updateResultSetViewState(sessionId, activeSet, nextViewState);
        }, 250);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [activeFilters, activeSet, query, selectedRowIndexes, sessionId, sortState, updateResultSetViewState]);

    const stats = useMemo(
        () => ({
            filteredCount: columnFilteredResults.length,
            totalCount: results.length,
        }),
        [columnFilteredResults.length, results.length],
    );

    useEffect(() => {
        if (storageKey === 'unknown') return;
        setSelectedRowIndexesByKey(prev => ({
            ...prev,
            [storageKey]: selectedRowIndexes,
        }));
    }, [selectedRowIndexes, setSelectedRowIndexesByKey, storageKey]);

    const onStatsChange = useCallback(() => {}, []);
    const handleSelectedRowIndexesChange = useCallback((next: number[]) => {
        setSelectedRowIndexes(prev => {
            if (areNumberArraysEqual(prev, next)) {
                return prev;
            }
            return next;
        });
        if (storageKey !== 'unknown') {
            setSelectedRowIndexesByKey(prev => ({
                ...prev,
                [storageKey]: next,
            }));
        }
    }, [setSelectedRowIndexesByKey, storageKey]);

    /* ---------- Reset on Tab switch ---------- */
    useEffect(() => {
        if (!tabId) return;
        if (lastTabIdRef.current !== tabId) {
            lastTabIdRef.current = tabId;

            resultsRef.current = [];
            setResults([]);
            setIndices([]);
            firstChunkArrivedRef.current = false;
            setSessionStatus(null);
            setLocalDataLoading(prev => ({ ...prev, [tabId]: false }));
            fetchControllerRef.current?.abort();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabId]);

    /* ---------- Refresh result-set indices (0..n-1) ---------- */
    useEffect(() => {
        let canceled = false;
        (async () => {
            if (!dbReady || !sessionId) return;
            try {
                const arr = await listResultSetIndices(sessionId);
                if (canceled) return;
                const next = Array.isArray(arr) ? Array.from(new Set(arr.filter(n => Number.isFinite(n) && n >= 0))).sort((a, b) => a - b) : [];
                setIndices(next);

                if (activeSet >= 0 && !next.includes(activeSet)) {
                    setActiveSet(OVERVIEW_SET);
                }
            } catch {}
        })();
        return () => {
            canceled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dbReady, sessionId, dataVersion]);

    /* ---------- Pull session status ---------- */
    useEffect(() => {
        let canceled = false;
        (async () => {
            if (!dbReady || !sessionId) return;
            const sess = await getSession(sessionId);
            if (!canceled) {
                setSessionStatus((sess?.status as any) ?? null);
            }
        })();
        return () => {
            canceled = true;
        };
    }, [dbReady, sessionId, dataVersion, getSession]);

    /* ---------- Reset on session change ---------- */
    useEffect(() => {
        if (!sessionId) return;
        if (lastSessionRef.current !== sessionId) {
            lastSessionRef.current = sessionId;

            resultsRef.current = [];
            setResults([]);
            firstChunkArrivedRef.current = false;
            setLocalDataLoading(prev => ({ ...prev, [tabId]: true }));
            setIndices([]);

            fetchControllerRef.current?.abort();
        }
    }, [sessionId, tabId, setLocalDataLoading]);

    /* ---------- Enforce budget immediately when lowered ---------- */
    useEffect(() => {
        if (!tabId || !sessionId) return;
        if (activeSet < 0) return;
        const key = makeCacheKey(tabId, sessionId, activeSet);
        if (resultsRef.current.length > uiRowBudget) {
            resultsRef.current = resultsRef.current.slice(0, uiRowBudget);
            setResults(resultsRef.current.slice());
            setMeta(prev => ({ ...prev, truncated: true }));
            fetchControllerRef.current?.abort();
            if (key) {
                touchCache(key, {
                    results: resultsRef.current,
                    meta: { ...(RESULTS_CACHE.get(key)?.meta ?? {}), truncated: true },
                    dataVersion,
                    fullyLoaded: true,
                });
            }
            setLocalDataLoading(prev => ({ ...prev, [tabId]: false }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uiRowBudget]);

    useEffect(() => {
        if (!dbReady || !tabId || !sessionId) {
            setLocalDataLoading(prev => ({ ...prev, [tabId]: true }));
            return;
        }

        if (activeSet < 0) {
            fetchControllerRef.current?.abort?.();
            resultsRef.current = [];
            setResults([]);
            setLocalDataLoading(prev => ({ ...prev, [tabId]: false }));
            return;
        }

        const key = makeCacheKey(tabId, sessionId, activeSet);

        // Cache short-circuit. Metadata updates can bump surrounding state without changing rows.
        if (key) {
            const cached = RESULTS_CACHE.get(key);
            if (cached?.fullyLoaded) {
                hydrateFromCache(key, {
                    setResults,
                    resultsRef,
                    setMeta,
                    setSessionStatus: s => setSessionStatus(s ?? null),
                    setLoading: s => setLocalDataLoading(prev => ({ ...prev, [tabId]: s })),
                });
                return;
            }
        }

        // Start a new reader
        fetchControllerRef.current?.abort();
        const ac = new AbortController();
        fetchControllerRef.current = ac;

        resultsRef.current = [];
        setResults([]);
        setLocalDataLoading(prev => ({ ...prev, [tabId]: true }));
        firstChunkArrivedRef.current = false;

        let disposed = false;

        (async () => {
            try {
                await getResultRows(sessionId, activeSet, {
                    signal: ac.signal,
                    rowBudget: uiRowBudget,
                    emitChunkRows: 1000,
                    yieldUi: true,
                    onChunk: chunk => {
                        if (disposed || ac.signal.aborted) return;

                        const remaining = uiRowBudget - resultsRef.current.length;
                        if (remaining <= 0) {
                            setMeta(prev => ({ ...prev, truncated: true }));
                            if (key) {
                                touchCache(key, {
                                    results: resultsRef.current,
                                    meta: { ...(RESULTS_CACHE.get(key)?.meta ?? {}), truncated: true },
                                    sessionStatus,
                                    dataVersion,
                                    fullyLoaded: true,
                                });
                            }
                            setLocalDataLoading(prev => ({ ...prev, [tabId]: false }));
                            ac.abort();
                            return;
                        }

                        const slice = chunk.length > remaining ? (chunk.slice(0, remaining) as ResultRow[]) : (chunk as ResultRow[]);
                        resultsRef.current.push(...slice);

                        if (rafRef.current == null) {
                            rafRef.current = requestAnimationFrame(() => {
                                rafRef.current = null;
                                setResults(resultsRef.current.slice());
                            });
                        }

                        if (key) {
                            touchCache(key, {
                                results: resultsRef.current,
                                meta: RESULTS_CACHE.get(key)?.meta,
                                sessionStatus,
                                dataVersion,
                                fullyLoaded: false,
                            });
                        }

                        if (slice.length < chunk.length) {
                            setMeta(prev => ({ ...prev, truncated: true }));
                            if (key) {
                                touchCache(key, {
                                    results: resultsRef.current,
                                    meta: { ...(RESULTS_CACHE.get(key)?.meta ?? {}), truncated: true },
                                    sessionStatus,
                                    dataVersion,
                                    fullyLoaded: true,
                                });
                            }
                            setLocalDataLoading(prev => ({ ...prev, [tabId]: false }));
                            ac.abort();
                        }
                    },
                });
            } finally {
                if (!disposed && !ac.signal.aborted) {
                    setLocalDataLoading(prev => ({ ...prev, [tabId]: false }));
                    if (key) {
                        touchCache(key, {
                            results: resultsRef.current,
                            meta: RESULTS_CACHE.get(key)?.meta,
                            sessionStatus,
                            dataVersion,
                            fullyLoaded: true,
                        });
                    }
                }
            }
        })();

        return () => {
            disposed = true;
            ac.abort();
        };
    }, [dbReady, tabId, sessionId, activeSet, getResultRows, dataVersion, uiRowBudget]);

    /* ---------- Hydrate session-level meta & keep cache in sync ---------- */
    useEffect(() => {
        let canceled = false;
        (async () => {
            if (!dbReady || !sessionId) {
                if (!canceled) setMeta({});
                return;
            }
            try {
                const sess: any = await getSession(sessionId);
                if (canceled) return;

                const startedRaw = sess?.startedAt ?? sess?.started_at;
                const finishedRaw = sess?.finishedAt ?? sess?.finished_at;
                const startedAt = startedRaw ? new Date(startedRaw) : undefined;
                const finishedAt = finishedRaw ? new Date(finishedRaw) : undefined;

                const durationMs = sess?.durationMs ?? sess?.elapsed_ms ?? (startedAt && finishedAt ? finishedAt.getTime() - startedAt.getTime() : undefined);

                setMeta(prev => {
                    const next = {
                        ...prev,
                        startedAt,
                        finishedAt,
                        durationMs,
                        fromCache: sess?.fromCache ?? sess?.cache ?? sess?.cache_hit,
                        source: sess?.source ?? sess?.engine ?? sess?.backend,
                        scannedRows: sess?.scannedRows ?? sess?.scanned_rows,
                        scannedBytes: sess?.scannedBytes ?? sess?.scanned_bytes,
                        syncing: sess?.syncing ?? sess?.verifying ?? false,
                    };
                    if (activeSet >= 0) {
                        const key = makeCacheKey(tabId, sessionId, activeSet);
                        if (key) {
                            touchCache(key, {
                                meta: { ...(RESULTS_CACHE.get(key)?.meta ?? {}), ...next },
                                sessionStatus,
                                dataVersion,
                            });
                        }
                    }
                    return next;
                });
            } catch {}
        })();
        return () => {
            canceled = true;
        };
    }, [dbReady, sessionId, dataVersion, getSession, tabId, activeSet, sessionStatus]);

    /* ---------- cleanup ---------- */
    useEffect(
        () => () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
            fetchControllerRef.current?.abort();
        },
        [],
    );

    useEffect(() => {
        let canceled = false;
        (async () => {
            if (!dbReady || !sessionId) return;
            try {
                const metas = await listResultSetsMeta(sessionId);
                if (canceled) return;
                if (!metas) return;
                setSetsMeta(
                    metas.map(m => ({
                        sessionId: m.sessionId,
                        setIndex: m.setIndex,
                        sqlText: m.sqlText ?? '',
                        status: (m.status as any) ?? 'success',
                        startedAt: m.startedAt ?? null,
                        finishedAt: m.finishedAt ?? null,
                        durationMs: m.durationMs ?? null,
                        rowCount: m.rowCount ?? null,
                        affectedRows: m.affectedRows ?? null,
                        errorMessage: m.errorMessage ?? null,
                        limited: m.limited ?? false,
                        limit: m.limit ?? null,
                    })),
                );

                const next = metas.map(m => m.setIndex).sort((a, b) => a - b);
                setIndices(next);

                if (activeSet >= 0 && !next.includes(activeSet)) {
                    setActiveSet(OVERVIEW_SET);
                }
            } catch {}
        })();
        return () => {
            canceled = true;
        };
    }, [dbReady, sessionId, dataVersion, listResultSetsMeta]);

    const overviewItems: OverviewItem[] = useMemo(() => {
        if (!sessionId) return [];

        const scopedMeta = (setsMeta ?? []).filter(m => m.sessionId === sessionId);

        const items: OverviewItem[] = scopedMeta.map(m => {
            const status = (m.status as 'success' | 'error' | 'canceled') ?? 'success';
            return {
                id: `${m.sessionId}:${m.setIndex}`,
                setIndex: m.setIndex,
                sql: m.sqlText || `/* Result ${m.setIndex + 1} */`,
                status,
                startedAt: m.startedAt ?? undefined,
                finishedAt: m.finishedAt ?? undefined,
                errorMessage: m.errorMessage ?? undefined,
                rowsReturned: typeof m.rowCount === 'number' ? m.rowCount : undefined,
                rowsAffected: typeof m.affectedRows === 'number' ? m.affectedRows : undefined,
            };
        });

        const known = new Set(items.map(i => i.setIndex));

        const safeIndices = sessionId ? (indices ?? []) : [];

        const extras: OverviewItem[] = safeIndices
            .filter((i: number) => !known.has(i))
            .map((i: number) => ({
                id: `${sessionId}:${i}`,
                setIndex: i,
                sql: `/* Result ${i + 1} */`,
                status: sessionStatus === 'running' ? 'running' : sessionStatus === 'error' ? 'error' : sessionStatus === 'canceled' ? 'canceled' : 'success',
            }));

        return [...items, ...extras].sort((a, b) => a.setIndex - b.setIndex);
    }, [sessionId, setsMeta, indices, sessionStatus]);

    const execMetaBySet: Record<number, ExecMeta> = useMemo(() => {
        const map: Record<number, ExecMeta> = {};
        for (const i of indices) {
            const isActive = i === activeSet;
            const m = setsMeta.find(x => x.setIndex === i);

            const runningRemote = (m?.status as any) === 'running' || runningTabs[tabId] === 'running';
            const runningLocal = !!localDataLoading[tabId];

            const shownRows = isActive
                ? results.length
                : (() => {
                      const key = makeCacheKey(tabId, sessionId!, i);
                      const cached = key ? RESULTS_CACHE.get(key) : undefined;
                      return cached?.results?.length ?? 0;
                  })();

            map[i] = {
                runningRemote,
                runningLocal,
                executionMs: m?.durationMs ?? undefined,
                rowsReturned: typeof m?.rowCount === 'number' ? m!.rowCount! : undefined,
                rowsAffected: typeof m?.affectedRows === 'number' ? m!.affectedRows! : undefined,
                shownRows,
                sqlText: m?.sqlText ?? undefined,
                limitApplied: m?.limited ?? false,
                limitValue: typeof m?.limit === 'number' ? m.limit : undefined,
                truncated: isActive ? !!meta.truncated : false,
                startedAt: m?.startedAt ?? undefined,
                finishedAt: m?.finishedAt ?? undefined,
                errorMessage: m?.errorMessage ?? undefined,
            };
        }
        return map;
    }, [indices, activeSet, setsMeta, runningTabs, tabId, localDataLoading, results.length, sessionId, meta.truncated]);

    /* ---------- actions ---------- */

    const handleDownloadCsv = useCsvDownload({
        results,
        tabId,
        queryId: sessionId,
        setIndex: activeSet,
    });

    /* ---------- render ---------- */

    if (!tabId) {
        return <div className="h-full flex items-center justify-center text-sm text-muted-foreground bg-card">{t('Results.SelectTab')}</div>;
    }

    function renderResult() {
        if (noSessionId) {
            return <div className="h-full flex items-center justify-center text-sm bg-card text-muted-foreground">{t('Results.RunQueryFirst')}</div>;
        }
        if (runningTabs[tabId] === 'running') {
            return (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    <Badge variant="outline" className="gap-1">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin bg-card" />
                        {t('Results.WaitingForResults')}
                    </Badge>
                </div>
            );
        }
        // if (showLocalLoading) {
        //     return (
        //         <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        //             <Badge variant="outline" className="gap-1">
        //                 <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        //                 Prepare to display...
        //             </Badge>
        //         </div>
        //     );
        // }

        if (activeSet === OVERVIEW_SET) {
            return (
                <OverviewTable
                    items={overviewItems}
                    onOpenResultBySetIndex={i => {
                        setActiveSet(i);
                    }}
                />
            );
        }
        if (showEmpty) {
            return <div className="h-full bg-card flex items-center justify-center text-sm text-muted-foreground">{t('Results.NoResults')}</div>;
        }
        if (execMetaBySet?.[activeSet]?.errorMessage) {
            return <SQLErrorAlert message={execMetaBySet?.[activeSet]?.errorMessage} sql={execMetaBySet?.[activeSet]?.sqlText} />;
        }
        const showSharedFilterBar = currentViewMode === 'table' || currentViewMode === 'charts';

        return (
            <div className="flex h-full min-h-0 flex-col bg-card mb-2" data-testid="result-table-content">
                <div className="border-b bg-muted/30">
                    <div className="flex min-h-12 items-center justify-between gap-3 w-full px-2 py-1">
                        <Tabs
                            value={currentViewMode}
                            onValueChange={value => {
                                if (value === 'table' || value === 'charts') {
                                    setCurrentViewMode(value);
                                    setViewModesByKey(prev => {
                                        if (prev[viewModeKey] === value) return prev;
                                        return {
                                            ...prev,
                                            [viewModeKey]: value,
                                        };
                                    });
                                }
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <TabsList className="h-7 p-[2px]" aria-label="Result view">
                                    <TabsTrigger value="table" className="h-6 px-3 text-xs cursor-pointer">
                                        {t('Results.Table')}
                                    </TabsTrigger>
                                    <TabsTrigger value="charts" className="h-6 px-3 text-xs cursor-pointer">
                                        {t('Results.Charts')}
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                        </Tabs>
                        {showSharedFilterBar ? (
                            <div className="flex min-w-0 flex-1 flex-row">
                                <VTableSearchBar
                                    query={query}
                                    className="w-96 max-w-full"
                                    onQueryChange={setQuery}
                                    onClearQuery={() => setQuery('')}
                                    filteredCount={stats.filteredCount}
                                    totalCount={stats.totalCount}
                                />
                                <VTableFilters
                                    activeFilters={activeFilters}
                                    columnsRaw={sessionMetas.columns ?? []}
                                    onUpsertFilter={setColumnFilter}
                                    onRemoveFilter={removeFilter}
                                    onClearAllFilters={clearAllFilters}
                                    className="border-0 bg-transparent px-0 py-0"
                                />
                            </div>
                        ) : (
                            <div className="h-10 flex-1" />
                        )}
                        <div className="flex items-center gap-1.5 mr-2">
                            {isResult && currentViewMode === 'table' && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 mr-1 cursor-pointer"
                                            title={t('Results.DownloadCsvTitle')}
                                            aria-label={t('Results.DownloadCsvTitle')}
                                        >
                                            <MoreHorizontal className="h-3.5 w-3.5" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={handleDownloadCsv} disabled={rowCount <= 0} className="cursor-pointer">
                                            <Download />
                                            CSV
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>
                </div>
                {currentViewMode === 'table' ? (
                    <>
                        <div className="flex-1 min-h-0">
                            <VTable
                                results={columnFilteredResults}
                                storageKey={storageKey}
                                onStatsChange={onStatsChange}
                                setInspectorOpen={setInspectorOpen}
                                setInspectorMode={setInspectorMode}
                                setInspectorPayload={setInspectorPayload}
                                activeFilters={activeFilters}
                                onUpsertFilter={setColumnFilter}
                                onRemoveFilter={removeFilter}
                                onClearAllFilters={clearAllFilters}
                                showFiltersBar={false}
                                initialSort={sortState}
                                selectedRowIndexes={selectedRowIndexes}
                                onSortChange={setSortState}
                                onSelectedRowIndexesChange={handleSelectedRowIndexesChange}
                            />
                        </div>
                        <InspectorPanel
                            open={inspectorOpen}
                            setOpen={setInspectorOpen}
                            mode={inspectorMode}
                            payload={inspectorPayload}
                            rowViewMode={rowViewMode}
                            setRowViewMode={setRowViewMode}
                            inspectorWidth={inspectorWidth}
                            setInspectorWidth={setInspectorWidth}
                            inspectorTopOffset={44}
                        />
                    </>
                ) : (
                    <div className="flex min-h-0 flex-1">
                        {chartSetIndices.map(setIndex => {
                            const setChartStateKey = tabId ? `tab:${tabId}:set:${setIndex}` : 'unknown';
                            const snapshot =
                                chartSnapshotsBySet[setIndex] ?? (setIndex === activeSet ? { rows: columnFilteredResults, columnsRaw: sessionMetas.columns } : undefined);
                            if (!snapshot) {
                                return null;
                            }

                            const setVersion = chartStateVersionByTab[setChartStateKey] ?? 0;
                            const setInitialState = setChartStateKey !== 'unknown' ? chartStatesByKey[setChartStateKey] : undefined;
                            const visible = setIndex === activeSet;

                            return (
                                <Activity key={setChartStateKey} mode={visible ? 'visible' : 'hidden'}>
                                    <div className={`flex min-h-0 flex-1 flex-col ${visible ? '' : 'hidden'}`}>
                                        <Charts
                                            key={`${setChartStateKey}:${setVersion}`}
                                            rows={snapshot.rows}
                                            columnsRaw={snapshot.columnsRaw}
                                            resultStats={setIndex === activeSet ? sessionMetas.stats : undefined}
                                            stateKey={setChartStateKey}
                                            initialState={setInitialState}
                                            stateSyncEnabled={visible ? !localDataLoading[tabId] : false}
                                            onResetState={() => {
                                                setChartStatesByKey(prev => {
                                                    if (!prev[setChartStateKey]) {
                                                        return prev;
                                                    }

                                                    const next = { ...prev };
                                                    delete next[setChartStateKey];
                                                    return next;
                                                });
                                                setChartStateVersionByTab(prev => ({
                                                    ...prev,
                                                    [setChartStateKey]: (prev[setChartStateKey] ?? 0) + 1,
                                                }));
                                            }}
                                            onStateChange={nextState => {
                                                setChartStatesByKey(prev => {
                                                    const current = prev[setChartStateKey];
                                                    if (
                                                        current?.chartType === nextState.chartType &&
                                                        current?.xKey === nextState.xKey &&
                                                        current?.yKey === nextState.yKey &&
                                                        current?.groupKey === nextState.groupKey &&
                                                        current?.chartColorPreset === nextState.chartColorPreset
                                                    ) {
                                                        return prev;
                                                    }

                                                    return {
                                                        ...prev,
                                                        [setChartStateKey]: nextState,
                                                    };
                                                });
                                            }}
                                            onApplyFilters={(filters, options) => {
                                                if (!visible) {
                                                    return;
                                                }
                                                if (!options?.append) {
                                                    clearAllFilters();
                                                }

                                                filters.forEach(filter => {
                                                    setColumnFilter(filter);
                                                });
                                            }}
                                        />
                                    </div>
                                </Activity>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col" data-testid="result-table">
            {/* Top toolbar */}
            {runningTabs[tabId] !== 'running' && (
                <Toolbar
                    indices={indices}
                    activeSet={activeSet} // -1 = Overview，>=0 = Result i
                    onSetActiveSet={n => {
                        setActiveSet(n);
                    }}
                />
            )}

            {/* Table area */}
            <div className="flex-1 min-h-0">{renderResult()}</div>

            {isResult && <ResultStatusBar meta={execMetaBySet?.[activeSet]} shouldShowLimitNotice={shouldShowLimitNotice} />}
        </div>
    );
}
