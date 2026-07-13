'use client';

import React, { Activity, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, MoreHorizontal, RefreshCw } from 'lucide-react';

import VTable from './vtable';
import { InspectorPanel } from './vtable/InspectorPanel';
import { activeTabIdAtom } from '@/shared/stores/app.store';
import { activeSessionIdAtom, runningTabsAtom } from '../../sql-console.store';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useSqlConsoleResultStore } from '@/lib/client/sql-console-result-store';
import { MetaState } from '@dory/shared/types/sql-console';
import { Toolbar } from './Toolbar';
import type { ExecMeta } from './Toolbar';
import { OverviewItem, ResultRow } from './types';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { OverviewTable } from './OverviewTable';
import { currentSessionMetaAtom } from './stores/result-table.atoms';
import { chartStatesByKeyAtom, viewModesByTabAtom } from './components/charts/stores/chart-state.atoms';
import { ResultStatusBar } from './ResultStatusBar';
import { makeSetUserPickedAtom, makeActiveSetAtom, makeAutoSetActiveSetAtom, makeSetActiveSetAtom, makeUserPickedAtom } from './stores/active-set.atoms';
import { useAutoJumpToLastResult } from './hooks/useAutoJumpToLastResult';
import { SQLErrorAlert } from './components/SQLErrorAlert';
import { VTableSearchBar } from './components/TableSearchBar';
import { Charts } from './components/charts';
import { useTranslations } from 'next-intl';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useVTableFilters, VTableFilters } from './vtable/VTableFilters';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import type { ColumnFilter } from './vtable/type';
import { getSessionStorageKey, sqlWorkspaceScopeAtom } from '../../workspace-scope';
import type { ResultSetViewState } from '@/lib/client/type';
import { isQueryHistoryRestoredSession } from '../../query-history-result-restore';
/* =================================== constants =================================== */

const OVERVIEW_SET = -1;
type ResultViewMode = 'table' | 'charts';
type ResultSessionStatus = 'running' | 'success' | 'error' | 'canceled';
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
            op: filter.op as ColumnFilter['op'],
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
    const [viewModesByKey, setViewModesByKey] = useAtom(viewModesByTabAtom);
    const [currentViewMode, setCurrentViewMode] = useState<ResultViewMode>('table');
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectorMode, setInspectorMode] = useState<'cell' | 'row' | null>(null);
    const [inspectorPayload, setInspectorPayload] = useState<InspectorPayload>(null);
    const [rowViewMode, setRowViewMode] = useState<'table' | 'json'>('table');
    const [inspectorWidth, setInspectorWidth] = useState(360);
    const [meta, setMeta] = useState<MetaState>({});
    const [sessionMetas, setSessionMetas] = useAtom(currentSessionMetaAtom);

    const runningTabs = useAtomValue(runningTabsAtom);

    // Atoms
    const tabId = useAtomValue(activeTabIdAtom);
    const sessionIdFromAtom = useAtomValue(activeSessionIdAtom);
    const workspaceScope = useAtomValue(sqlWorkspaceScopeAtom);
    const sessionId = sessionIdFromAtom || (typeof window !== 'undefined' ? (localStorage.getItem(getSessionStorageKey(tabId, workspaceScope)) ?? undefined) : undefined);

    const { dbReady, listResultSetIndices, listResultSetsMeta, readResultSetRows, exportResultSet, readResultSetChart, dataVersion, getSession, updateResultSetViewState } =
        useSqlConsoleResultStore();

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

    const lastTabIdRef = useRef<string | null>(null);

    const [results, setResults] = useState<ResultRow[]>([]);

    const storageKey = useMemo(() => (tabId && sessionId ? `${tabId}:${sessionId}#${activeSet}` : 'unknown'), [tabId, sessionId, activeSet]);
    const viewModeKey = useMemo(() => (tabId && activeSet >= 0 ? `tab:${tabId}:set:${activeSet}` : 'unknown'), [activeSet, tabId]);

    const noSessionId = !sessionId;
    const isResult = activeSet >= 0;

    const limited = !!sessionMetas?.limited;
    const shouldShowLimitNotice = isResult && limited;
    const expectedRowCount = typeof sessionMetas?.rowCount === 'number' ? sessionMetas.rowCount : null;
    const remoteResultSetId = typeof sessionMetas?.resultSetId === 'string' && sessionMetas.resultSetId ? sessionMetas.resultSetId : null;
    const isRemoteFullResult = Boolean(remoteResultSetId);
    const remoteRowCount = expectedRowCount ?? 0;

    const [query, setQuery] = useState('');
    const [sortState, setSortState] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
    const [selectedRowIndexes, setSelectedRowIndexes] = useState<number[]>([]);
    const hydratedViewStateKeyRef = useRef<string | null>(null);
    const persistedViewStateRef = useRef<string | null>(null);
    const [chartStatesByKey, setChartStatesByKey] = useAtom(chartStatesByKeyAtom);
    const [chartStateVersionByTab, setChartStateVersionByTab] = useState<Record<string, number>>({});
    const [chartSnapshotsBySet, setChartSnapshotsBySet] = useState<Record<number, { rows: Array<{ rowData: Record<string, unknown> }>; columnsRaw?: unknown }>>({});
    const [remoteEffectiveRowCount, setRemoteEffectiveRowCount] = useState<number | null>(null);
    const rowCount = isRemoteFullResult ? (remoteEffectiveRowCount ?? remoteRowCount) : results.length;
    const showEmpty = isRemoteFullResult ? rowCount === 0 : results.length === 0;

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

    const [setsMeta, setSetsMeta] = useState<
        Array<{
            sessionId: string;
            setIndex: number;
            sqlText: string;
            status: ResultSessionStatus;
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
        if (isRemoteFullResult) return [];
        const hasGlobal = query.trim().length > 0;
        const gq = query.trim().toLowerCase();
        if (!hasGlobal) return results;

        return results.filter(row => {
            if (hasGlobal) {
                let hit = false;
                for (const c of sessionMetas.columns.map((x: { name?: string }) => x.name)) {
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
    }, [isRemoteFullResult, results, sessionMetas, query]);

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

    const remoteOperations = useMemo(
        () => ({
            sorts: sortState ? [sortState] : undefined,
            filters: activeFilters.length > 0 ? activeFilters : undefined,
            search: query.trim() ? { text: query.trim() } : undefined,
        }),
        [activeFilters, query, sortState],
    );
    const remoteOperationKey = useMemo(() => JSON.stringify(remoteOperations), [remoteOperations]);

    useEffect(() => {
        setRemoteEffectiveRowCount(null);
    }, [remoteOperationKey, remoteResultSetId, remoteRowCount]);

    const remoteSource = useMemo(() => {
        if (!remoteResultSetId || !isRemoteFullResult || remoteRowCount <= 0) return null;
        return {
            cacheKey: `${remoteResultSetId}:${remoteOperationKey}`,
            rowCount: remoteEffectiveRowCount ?? remoteRowCount,
            pageSize: 5000,
            getRows: async (offset: number, limit: number, signal?: AbortSignal) => {
                const response = await readResultSetRows({
                    resultSetId: remoteResultSetId,
                    offset,
                    limit,
                    sorts: remoteOperations.sorts,
                    filters: remoteOperations.filters,
                    search: remoteOperations.search,
                    signal,
                });
                if (typeof response.rowCount === 'number') {
                    setRemoteEffectiveRowCount(response.rowCount);
                }
                return response.rows.map((row, index) => ({
                    tabId,
                    rid: offset + index,
                    rowData: row,
                }));
            },
        };
    }, [isRemoteFullResult, readResultSetRows, remoteEffectiveRowCount, remoteOperationKey, remoteOperations, remoteResultSetId, remoteRowCount, tabId]);

    useEffect(() => {
        if (!sessionId || activeSet < 0) {
            hydratedViewStateKeyRef.current = null;
            setQuery('');
            setSortState(null);
            setSelectedRowIndexes([]);
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
    }, [activeSet, replaceFilters, sessionId, sessionMetas.viewState]);

    useEffect(() => {
        if (activeSet < 0) {
            return;
        }
        if (isRemoteFullResult) {
            return;
        }

        setChartSnapshotsBySet(prev => ({
            ...prev,
            [activeSet]: {
                rows: columnFilteredResults as Array<{ rowData: Record<string, unknown> }>,
                columnsRaw: sessionMetas.columns,
            },
        }));
    }, [activeSet, columnFilteredResults, isRemoteFullResult, sessionMetas.columns]);

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
            filteredCount: isRemoteFullResult ? rowCount : columnFilteredResults.length,
            totalCount: isRemoteFullResult ? remoteRowCount : results.length,
        }),
        [columnFilteredResults.length, isRemoteFullResult, remoteRowCount, results.length, rowCount],
    );

    const onStatsChange = useCallback(() => {}, []);
    const handleSelectedRowIndexesChange = useCallback((next: number[]) => {
        setSelectedRowIndexes(prev => {
            if (areNumberArraysEqual(prev, next)) {
                return prev;
            }
            return next;
        });
    }, []);

    /* ---------- Reset on Tab switch ---------- */
    useEffect(() => {
        if (!tabId) return;
        if (lastTabIdRef.current !== tabId) {
            lastTabIdRef.current = tabId;

            setResults([]);
            setIndices([]);
            setSessionStatus(null);
        }
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
            if (!dbReady || !sessionId) {
                if (!canceled) setSessionStatus(null);
                return;
            }
            const sess = await getSession(sessionId);
            if (!canceled) {
                const nextStatus = sess?.status === 'running' || sess?.status === 'success' || sess?.status === 'error' || sess?.status === 'canceled' ? sess.status : null;
                setSessionStatus(nextStatus);
            }
        })();
        return () => {
            canceled = true;
        };
    }, [dbReady, sessionId, dataVersion, getSession]);

    /* ---------- Reset on session change ---------- */
    useEffect(() => {
        if (!sessionId) {
            lastSessionRef.current = null;
            setResults([]);
            setIndices([]);
            setSetsMeta([]);
            setMeta({});
            setSessionStatus(null);
            return;
        }
        if (lastSessionRef.current !== sessionId) {
            lastSessionRef.current = sessionId;

            setResults([]);
            setIndices([]);
        }
    }, [sessionId]);

    useEffect(() => {
        if (!sessionId || !tabId) {
            setResults([]);
            return;
        }

        if (activeSet < 0) {
            setResults([]);
            return;
        }

        if (isRemoteFullResult) {
            setResults([]);
            return;
        }

        // Browser storage is no longer a result data source. Without a server resultSetId,
        // the SQL text can remain selected but the result area must stay empty.
        setResults([]);
    }, [tabId, sessionId, activeSet, dataVersion, isRemoteFullResult]);

    /* ---------- Hydrate session-level meta & keep cache in sync ---------- */
    useEffect(() => {
        let canceled = false;
        (async () => {
            if (!dbReady || !sessionId) {
                if (!canceled) setMeta({});
                return;
            }
            try {
                const sess = await getSession(sessionId);
                if (canceled) return;

                const startedRaw = sess?.startedAt;
                const finishedRaw = sess?.finishedAt;
                const startedAt = startedRaw ? new Date(startedRaw) : undefined;
                const finishedAt = finishedRaw ? new Date(finishedRaw) : undefined;

                const durationMs = sess?.durationMs ?? (startedAt && finishedAt ? finishedAt.getTime() - startedAt.getTime() : undefined);

                setMeta(prev => {
                    const next = {
                        ...prev,
                        startedAt,
                        finishedAt,
                        durationMs,
                        source: isQueryHistoryRestoredSession(tabId, sessionId) ? 'query-history' : (sess?.source ?? undefined),
                        syncing: false,
                    };
                    return next;
                });
            } catch {}
        })();
        return () => {
            canceled = true;
        };
    }, [dbReady, sessionId, dataVersion, getSession, tabId, activeSet, sessionStatus]);

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
                        status: m.status === 'running' ? 'running' : m.status === 'error' ? 'error' : 'success',
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

            const runningRemote = m?.status === 'running' || runningTabs[tabId] === 'running';
            const runningLocal = false;

            const shownRows = isActive
                ? isRemoteFullResult
                    ? (expectedRowCount ?? 0)
                    : results.length
                : typeof m?.rowCount === 'number'
                  ? m.rowCount
                  : 0;

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
                source: typeof meta.source === 'string' ? meta.source : undefined,
            };
        }
        return map;
    }, [indices, activeSet, setsMeta, runningTabs, tabId, isRemoteFullResult, expectedRowCount, results.length, meta.truncated, meta.source]);

    /* ---------- actions ---------- */

    const handleDownloadCsv = useCallback(async () => {
        if (remoteResultSetId) {
            const created = await exportResultSet({
                resultSetId: remoteResultSetId,
                format: 'csv',
                sorts: remoteOperations.sorts,
                filters: remoteOperations.filters,
                search: remoteOperations.search,
            });
            window.location.href = created.downloadUrl;
            return;
        }
    }, [exportResultSet, remoteOperations.filters, remoteOperations.search, remoteOperations.sorts, remoteResultSetId]);

    /* ---------- render ---------- */

    if (!tabId) {
        return <div className="h-full flex items-center justify-center text-sm text-muted-foreground bg-card">{t('Results.SelectTab')}</div>;
    }

    function renderResult() {
        if (noSessionId) {
            const emptyResultMessage = workspaceScope.workspaceMode === 'agent' ? t('Results.AgentRunQueryFirst') : t('Results.RunQueryFirst');
            return <div className="h-full flex items-center justify-center px-4 text-center text-sm bg-card text-muted-foreground">{emptyResultMessage}</div>;
        }
        const hasRenderableRows = activeSet >= 0 && (isRemoteFullResult ? rowCount > 0 : results.length > 0);
        const hasRenderableResult = activeSet >= 0 && (hasRenderableRows || execMetaBySet?.[activeSet]?.errorMessage);
        if (runningTabs[tabId] === 'running' && !hasRenderableResult) {
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
                                        <DropdownMenuItem onSelect={() => void handleDownloadCsv()} disabled={rowCount <= 0} className="cursor-pointer">
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
                                results={isRemoteFullResult ? [] : columnFilteredResults}
                                remoteSource={remoteSource}
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
                                serverSideOperations={isRemoteFullResult}
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
                                chartSnapshotsBySet[setIndex] ??
                                (setIndex === activeSet ? { rows: isRemoteFullResult ? [] : columnFilteredResults, columnsRaw: sessionMetas.columns } : undefined);
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
                                            remoteSource={
                                                visible && isRemoteFullResult && remoteResultSetId
                                                    ? {
                                                          cacheKey: `${remoteResultSetId}:${remoteOperationKey}:chart`,
                                                          readChart: state =>
                                                              readResultSetChart({
                                                                  resultSetId: remoteResultSetId,
                                                                  xKey: state.xKey,
                                                                  yKey: state.yKey,
                                                                  groupKey: state.groupKey,
                                                                  chartType: state.chartType,
                                                                  filters: remoteOperations.filters,
                                                                  search: remoteOperations.search,
                                                              }),
                                                      }
                                                    : null
                                            }
                                            stateKey={setChartStateKey}
                                            initialState={setInitialState}
                                            stateSyncEnabled={visible}
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
