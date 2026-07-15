'use client';
import { cn } from '@dory/web-utils';
import { useMemo, useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { GridCellProps, AutoSizer, MultiGrid, MultiGridProps } from 'react-virtualized';
import { ColumnFilterPopover } from './ColumnFIlter';
import { VTableProps, ColWidths, CellKey, ck, parseCK } from './type';
import { formatTooltip, formatValue } from './utils';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/registry/new-york-v4/ui/context-menu';
import { useAtomValue } from 'jotai';
import { currentSessionMetaAtom } from '../stores/result-table.atoms';
import { buildEqualsFilterFromCell, mapDbTypeToTwoKinds } from './filter';
import { useTranslations } from 'next-intl';
import { useVTableFilterUi, useVTableFilters, VTableFilters } from './VTableFilters';

const HEADER_PAD = 24;
const VISIBLE_AUTO_FIT_SAMPLE_LIMIT = 48;
const VISIBLE_AUTO_FIT_ROW_BUFFER = 20;
const VISIBLE_AUTO_FIT_COLUMN_BUFFER = 2;
const INITIAL_VISIBLE_COLUMN_COUNT = 12;
const INITIAL_VISIBLE_ROW_COUNT = 24;
const REMOTE_DEFAULT_PAGE_SIZE = 5000;
const REMOTE_MAX_CACHED_PAGES = 24;
const REMOTE_MAX_CACHED_SOURCES = 32;
const REMOTE_PREFETCH_PAGES_BEFORE = 1;
const REMOTE_PREFETCH_PAGES_AFTER = 2;
const HEADER_TEXT_PAD = 44;
const CELL_TEXT_PAD = 18;
const FALLBACK_CHAR_WIDTH = 8;
const PRIMARY_SELECTION_CLASS = 'bg-primary/10 text-foreground';
const PRIMARY_SELECTION_SUBTLE_CLASS = 'bg-primary/6 text-foreground';
const PRIMARY_SELECTION_SOFT_CLASS = 'bg-primary/8 text-foreground';
const PRIMARY_SELECTION_RING_CLASS = 'ring-1 ring-inset ring-primary/40';
const SELECTION_CLASS_NAMES = [...new Set(`${PRIMARY_SELECTION_CLASS} ${PRIMARY_SELECTION_SUBTLE_CLASS} ${PRIMARY_SELECTION_RING_CLASS}`.split(' '))];
const TOP_RIGHT_GRID_STYLE = { overflowX: 'hidden', overflowY: 'hidden' } as const;
const BOTTOM_LEFT_GRID_STYLE = { overflowY: 'hidden', overflowX: 'hidden' } as const;
const TOP_LEFT_GRID_STYLE = { overflow: 'hidden' } as const;
const BOTTOM_RIGHT_GRID_STYLE = { overflowY: 'auto', overflowX: 'auto' } as const;
const GRID_STYLE = { outline: 'none' } as const;

type ColumnMeta = {
    name: string;
    type?: string | null;
};

type RawColumnMeta = {
    name?: unknown;
    type?: unknown;
};

type GridScrollPane = {
    _scrollingContainer?: HTMLElement;
    handleScrollEvent?: (position: { scrollLeft: number; scrollTop: number }) => void;
};

type MeasurableMultiGrid = MultiGrid & {
    _topRightGrid?: GridScrollPane;
    _bottomRightGrid?: GridScrollPane;
    recomputeGridSize?: () => void;
    forceUpdateGrids?: () => void;
};

type VersionedMultiGridProps = MultiGridProps & {
    dataVersion?: string;
};

const VersionedMultiGrid = MultiGrid as React.ComponentType<VersionedMultiGridProps>;

type RemoteRowCacheEntry = {
    rows: Map<number, { rowData: Record<string, unknown> }>;
    pages: Map<number, number>;
    touchedAt: number;
};

const remoteRowCacheByKey = new Map<string, RemoteRowCacheEntry>();

function getRemoteRowCache(cacheKey: string) {
    const entry = remoteRowCacheByKey.get(cacheKey);
    if (entry) {
        entry.touchedAt = Date.now();
    }
    return entry;
}

function setRemoteRowCache(cacheKey: string, rows: Map<number, { rowData: Record<string, unknown> }>, pages: Map<number, number>) {
    remoteRowCacheByKey.set(cacheKey, {
        rows: new Map(rows),
        pages: new Map(pages),
        touchedAt: Date.now(),
    });

    if (remoteRowCacheByKey.size <= REMOTE_MAX_CACHED_SOURCES) {
        return;
    }

    const staleEntries = [...remoteRowCacheByKey.entries()].sort((left, right) => left[1].touchedAt - right[1].touchedAt);
    const removeCount = remoteRowCacheByKey.size - REMOTE_MAX_CACHED_SOURCES;
    for (let index = 0; index < removeCount; index += 1) {
        const staleKey = staleEntries[index]?.[0];
        if (staleKey) {
            remoteRowCacheByKey.delete(staleKey);
        }
    }
}

function areNumberArraysEqual(left: number[] | undefined, right: number[] | undefined) {
    if (left === right) return true;
    if (!left || !right) return !left && !right;
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function areSortStatesEqual(left: { column: string; direction: 'asc' | 'desc' } | null | undefined, right: { column: string; direction: 'asc' | 'desc' } | null | undefined) {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return left.column === right.column && left.direction === right.direction;
}

function getSampleRowIndices(start: number, stop: number, limit: number) {
    if (stop < start) return [];

    const total = stop - start + 1;
    if (total <= limit) return Array.from({ length: total }, (_, index) => start + index);

    const lastIndex = total - 1;
    const sampled = new Set<number>();
    for (let step = 0; step < limit; step++) {
        sampled.add(start + Math.floor((step * lastIndex) / Math.max(limit - 1, 1)));
    }

    return [...sampled].sort((left, right) => left - right);
}

export default function VTable({
    results,
    remoteSource,
    rowHeight = 32,
    defaultColMinWidth = 140,
    indexColWidth = 56,
    storageKey,
    colMinWidthMap,
    colMaxWidthMap,
    onStatsChange,
    setInspectorOpen,
    setInspectorMode,
    setInspectorPayload,
    activeFilters: externalActiveFilters,
    onUpsertFilter: onUpsertExternalFilter,
    onRemoveFilter: onRemoveExternalFilter,
    onClearAllFilters: onClearAllExternalFilters,
    serverSideOperations = false,
    showFiltersBar = true,
    initialSort = null,
    selectedRowIndexes,
    isActive = true,
    onSortChange,
    onSelectedRowIndexesChange,
}: VTableProps) {
    const t = useTranslations('SqlConsole');
    const metas = useAtomValue(currentSessionMetaAtom);
    const columnsRaw = useMemo<ColumnMeta[]>(() => {
        const rawColumns = (metas?.columns ?? []) as RawColumnMeta[];
        return rawColumns
            .filter((column): column is RawColumnMeta & { name: string } => typeof column.name === 'string' && column.name.length > 0)
            .map(column => ({
                name: column.name,
                type: typeof column.type === 'string' || column.type === null ? column.type : undefined,
            }));
    }, [metas?.columns]);
    const columns = useMemo(() => columnsRaw.map(column => column.name), [columnsRaw]);
    const isRemote = Boolean(remoteSource);
    const operationsDisabled = false;
    const usesServerSideOperations = serverSideOperations || isRemote;
    const remotePageSize = Math.max(1, Math.min(remoteSource?.pageSize ?? REMOTE_DEFAULT_PAGE_SIZE, 5000));
    const [remoteRowsVersion, setRemoteRowsVersion] = useState(0);
    const remoteRowsRef = useRef<Map<number, { rowData: Record<string, unknown> }>>(new Map());
    const remotePagesRef = useRef<Map<number, number>>(new Map());
    const remoteLoadingPagesRef = useRef<Set<number>>(new Set());
    const remotePageAbortControllersRef = useRef<Map<number, AbortController>>(new Map());
    const activeRemoteCacheKeyRef = useRef<string | null>(remoteSource?.cacheKey ?? null);
    const activeRemoteSourceIdRef = useRef<string | null>(remoteSource?.sourceId ?? null);
    const hydratedRemoteSourceRef = useRef<{ cacheKey: string | null; sourceId: string | null } | null>(null);
    const remoteRowsStaleRef = useRef(false);

    const clampColumnWidth = useCallback(
        (col: string, width: number) => {
            const minW = Math.max(colMinWidthMap?.[col] ?? defaultColMinWidth, 60);
            const maxW = Math.max(colMaxWidthMap?.[col] ?? 1200, minW);
            return Math.min(Math.max(width, minW), maxW);
        },
        [colMaxWidthMap, colMinWidthMap, defaultColMinWidth],
    );

    const [manualColWidths, setManualColWidths] = useState<ColWidths>(() => {
        if (typeof window !== 'undefined' && storageKey) {
            try {
                const raw = localStorage.getItem(`${storageKey}:colWidths`);
                if (raw) return JSON.parse(raw) as ColWidths;
            } catch {}
        }

        return {};
    });

    const [autoColWidths, setAutoColWidths] = useState<ColWidths>(() => {
        const init: ColWidths = {};
        for (const c of columns) init[c] = clampColumnWidth(c, defaultColMinWidth);
        return init;
    });
    const measureCanvasRef = useRef<CanvasRenderingContext2D | null>(null);
    const visibleRowRangeRef = useRef<{ start: number; stop: number }>({
        start: 0,
        stop: Math.max(0, INITIAL_VISIBLE_ROW_COUNT - 1),
    });
    const visibleColumnRangeRef = useRef<{ start: number; stop: number }>({
        start: 0,
        stop: Math.max(0, INITIAL_VISIBLE_COLUMN_COUNT - 1),
    });
    const [visibleMeasurementVersion, setVisibleMeasurementVersion] = useState(0);
    const visibleMeasurementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleInitialMeasurement = useCallback((delayMs = 0) => {
        if (visibleMeasurementTimeoutRef.current) {
            clearTimeout(visibleMeasurementTimeoutRef.current);
        }
        visibleMeasurementTimeoutRef.current = setTimeout(() => {
            visibleMeasurementTimeoutRef.current = null;
            setVisibleMeasurementVersion(version => version + 1);
        }, delayMs);
    }, []);

    useEffect(() => {
        setManualColWidths(prev => {
            const next: ColWidths = {};
            for (const c of columns) {
                if (prev[c] != null) next[c] = prev[c];
            }

            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);
            if (prevKeys.length === nextKeys.length && nextKeys.every(key => prev[key] === next[key])) {
                return prev;
            }

            return next;
        });
        setAutoColWidths(prev => {
            const next: ColWidths = {};
            for (const c of columns) {
                next[c] = clampColumnWidth(c, prev[c] ?? defaultColMinWidth);
            }

            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);
            if (prevKeys.length === nextKeys.length && nextKeys.every(key => prev[key] === next[key])) {
                return prev;
            }

            return next;
        });
    }, [clampColumnWidth, columns, defaultColMinWidth]);

    useEffect(() => {
        if (!storageKey) return;
        try {
            localStorage.setItem(`${storageKey}:colWidths`, JSON.stringify(manualColWidths));
        } catch {}
    }, [manualColWidths, storageKey]);

    const measureTextWidth = useCallback((text: string, font: string) => {
        if (typeof document === 'undefined') {
            return text.length * FALLBACK_CHAR_WIDTH;
        }

        if (!measureCanvasRef.current) {
            const canvas = document.createElement('canvas');
            measureCanvasRef.current = canvas.getContext('2d');
        }

        const context = measureCanvasRef.current;
        if (!context) {
            return text.length * FALLBACK_CHAR_WIDTH;
        }

        context.font = font;
        return Math.ceil(context.measureText(text).width);
    }, []);

    const measureColumnWidth = useCallback(
        (col: string, rowIndices: number[]) => {
            const fontFamily = typeof document === 'undefined' ? 'system-ui, sans-serif' : getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
            const headerWidth = measureTextWidth(col, `700 14px ${fontFamily}`) + HEADER_TEXT_PAD;

            let maxCellWidth = 0;
            for (const rowIndex of rowIndices) {
                const cellValue = isRemote ? remoteRowsRef.current.get(rowIndex)?.rowData?.[col] : results[rowIndex]?.rowData?.[col];
                const text = formatTooltip(cellValue);
                maxCellWidth = Math.max(maxCellWidth, measureTextWidth(text, `400 14px ${fontFamily}`) + CELL_TEXT_PAD);
            }

            return clampColumnWidth(col, Math.max(headerWidth, maxCellWidth, defaultColMinWidth));
        },
        [clampColumnWidth, defaultColMinWidth, isRemote, measureTextWidth, results],
    );

    const internalFilters = useVTableFilters({ results, storageKey });
    const usesExternalFilters = !!(externalActiveFilters && onUpsertExternalFilter && onRemoveExternalFilter && onClearAllExternalFilters);
    const activeFilters = usesExternalFilters ? externalActiveFilters : internalFilters.activeFilters;
    const filteredResults = usesExternalFilters ? results : internalFilters.filteredResults;
    const setColumnFilter = usesExternalFilters ? onUpsertExternalFilter : internalFilters.setColumnFilter;
    const removeFilter = usesExternalFilters ? onRemoveExternalFilter : internalFilters.removeFilter;
    const clearAllFilters = usesExternalFilters ? onClearAllExternalFilters : internalFilters.clearAllFilters;
    const { getColumnFilter, getColumnFilterPopoverProps } = useVTableFilterUi({
        activeFilters,
        columnsRaw: columnsRaw ?? [],
        onUpsertFilter: setColumnFilter,
        onRemoveFilter: removeFilter,
    });

    const numericColumns = useMemo(() => {
        const set = new Set<string>();
        for (const c of columnsRaw ?? []) {
            if (c?.name && mapDbTypeToTwoKinds(c.type) === 'number') set.add(c.name);
        }
        return set;
    }, [columnsRaw]);

    const [sortState, setSortState] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(initialSort ?? null);
    const sortBy = sortState?.column ?? null;
    const sortDirection = sortState?.direction ?? 'asc';
    const lastEmittedSortRef = useRef<{ column: string; direction: 'asc' | 'desc' } | null>(initialSort ?? null);
    const sortedResults = useMemo(() => {
        if (usesServerSideOperations) return filteredResults;
        if (!sortBy) return filteredResults;
        const isNumericCol = numericColumns.has(sortBy);
        const sorted = [...filteredResults].sort((a, b) => {
            const aVal = a.rowData[sortBy];
            const bVal = b.rowData[sortBy];
            if (aVal === bVal) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }
            if (isNumericCol) {
                const aNum = Number(aVal);
                const bNum = Number(bVal);
                if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
                    return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
                }
            }
            return sortDirection === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
        });
        return sorted;
    }, [filteredResults, numericColumns, usesServerSideOperations, sortBy, sortDirection]);
    const tableRowCount = isRemote ? Math.max(0, remoteSource?.rowCount ?? 0) : sortedResults.length;
    const effectiveIndexColWidth = useMemo(() => {
        const fontFamily = typeof document === 'undefined' ? 'system-ui, sans-serif' : getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
        const maxRowLabel = String(Math.max(1, tableRowCount));
        return Math.max(indexColWidth, measureTextWidth(maxRowLabel, `400 14px ${fontFamily}`) + CELL_TEXT_PAD);
    }, [indexColWidth, measureTextWidth, tableRowCount]);
    const getDisplayRow = useCallback(
        (rowIndex: number) => {
            if (isRemote) return remoteRowsRef.current.get(rowIndex);
            return sortedResults[rowIndex];
        },
        [isRemote, sortedResults],
    );

    useEffect(() => {
        const resetRemoteRequests = () => {
            for (const controller of remotePageAbortControllersRef.current.values()) {
                controller.abort();
            }
            remoteLoadingPagesRef.current = new Set();
            remotePageAbortControllersRef.current = new Map();
        };

        resetRemoteRequests();
        const nextCacheKey = remoteSource?.cacheKey ?? null;
        const nextSourceId = remoteSource?.sourceId ?? nextCacheKey;
        const hydratedSource = hydratedRemoteSourceRef.current;
        const isSameHydratedSource = hydratedSource?.cacheKey === nextCacheKey && hydratedSource.sourceId === nextSourceId;

        // React Activity reconnects effects when a hidden SQL tab becomes visible.
        // Preserve the current result pages on reconnect; only a real source change
        // should replace the remote row cache.
        if (isSameHydratedSource) {
            return resetRemoteRequests;
        }

        hydratedRemoteSourceRef.current = { cacheKey: nextCacheKey, sourceId: nextSourceId };
        const cached = nextCacheKey ? getRemoteRowCache(nextCacheKey) : null;
        const canKeepStaleRows = Boolean(nextCacheKey && activeRemoteSourceIdRef.current === nextSourceId && remoteRowsRef.current.size > 0);
        activeRemoteCacheKeyRef.current = nextCacheKey;
        activeRemoteSourceIdRef.current = nextSourceId;

        if (cached) {
            remoteRowsRef.current = new Map(cached.rows);
            remotePagesRef.current = new Map(cached.pages);
            remoteRowsStaleRef.current = false;
        } else {
            if (!canKeepStaleRows) {
                remoteRowsRef.current = new Map();
            }
            remotePagesRef.current = new Map();
            remoteRowsStaleRef.current = canKeepStaleRows;
        }

        setRemoteRowsVersion(version => version + 1);

        return resetRemoteRequests;
    }, [remoteSource?.cacheKey, remoteSource?.sourceId]);

    const requestRemoteRange = useCallback(
        (start: number, stop: number) => {
            if (!remoteSource || stop < start) return;
            const visiblePageStart = Math.floor(Math.max(0, start) / remotePageSize);
            const visiblePageStop = Math.floor(Math.max(0, stop) / remotePageSize);
            const maxPage = Math.max(0, Math.ceil(tableRowCount / remotePageSize) - 1);
            const pageStart = Math.max(0, visiblePageStart - REMOTE_PREFETCH_PAGES_BEFORE);
            const pageStop = Math.min(maxPage, visiblePageStop + REMOTE_PREFETCH_PAGES_AFTER);
            const now = Date.now();
            const protectedPages = new Set<number>();
            const visiblePages: number[] = [];
            const prefetchPages: number[] = [];

            for (let page = pageStart; page <= pageStop; page += 1) {
                protectedPages.add(page);
                if (page >= visiblePageStart && page <= visiblePageStop) {
                    visiblePages.push(page);
                } else {
                    prefetchPages.push(page);
                }
            }

            for (const page of [...remoteLoadingPagesRef.current]) {
                if (protectedPages.has(page)) continue;
                remotePageAbortControllersRef.current.get(page)?.abort();
                remotePageAbortControllersRef.current.delete(page);
                remoteLoadingPagesRef.current.delete(page);
            }

            for (let page = visiblePageStart; page <= visiblePageStop; page += 1) {
                if (remotePagesRef.current.has(page)) {
                    remotePagesRef.current.set(page, now);
                }
            }

            for (const page of [...visiblePages, ...prefetchPages]) {
                if (remotePagesRef.current.has(page) || remoteLoadingPagesRef.current.has(page)) continue;
                remoteLoadingPagesRef.current.add(page);
                const controller = new AbortController();
                remotePageAbortControllersRef.current.set(page, controller);
                const offset = page * remotePageSize;

                remoteSource
                    .getRows(offset, remotePageSize, controller.signal)
                    .then(rows => {
                        if (controller.signal.aborted) return;
                        if (activeRemoteCacheKeyRef.current !== remoteSource.cacheKey) return;
                        if (remoteRowsStaleRef.current) {
                            remoteRowsRef.current = new Map();
                            remoteRowsStaleRef.current = false;
                        }
                        rows.forEach((row, index) => {
                            remoteRowsRef.current.set(offset + index, row);
                        });
                        remotePagesRef.current.set(page, Date.now());

                        if (remotePagesRef.current.size > REMOTE_MAX_CACHED_PAGES) {
                            const stalePages = [...remotePagesRef.current.entries()].sort((left, right) => left[1] - right[1]);
                            let removeCount = remotePagesRef.current.size - REMOTE_MAX_CACHED_PAGES;
                            for (const [stalePage] of stalePages) {
                                if (removeCount <= 0) break;
                                if (typeof stalePage !== 'number') continue;
                                if (protectedPages.has(stalePage)) continue;
                                remotePagesRef.current.delete(stalePage);
                                const staleOffset = stalePage * remotePageSize;
                                for (let rowIndex = staleOffset; rowIndex < staleOffset + remotePageSize; rowIndex += 1) {
                                    remoteRowsRef.current.delete(rowIndex);
                                }
                                removeCount -= 1;
                            }
                        }
                        setRemoteRowCache(remoteSource.cacheKey, remoteRowsRef.current, remotePagesRef.current);
                    })
                    .catch(error => {
                        if (!controller.signal.aborted) {
                            console.warn('[VTable] remote result page load failed', {
                                cacheKey: remoteSource.cacheKey,
                                page,
                                error,
                            });
                        }
                    })
                    .finally(() => {
                        remotePageAbortControllersRef.current.delete(page);
                        remoteLoadingPagesRef.current.delete(page);
                        if (!controller.signal.aborted) {
                            setRemoteRowsVersion(version => version + 1);
                        }
                    });
            }
        },
        [remotePageSize, remoteSource, tableRowCount],
    );

    useEffect(() => {
        if (!remoteSource || tableRowCount <= 0) return;
        requestRemoteRange(0, Math.min(tableRowCount - 1, remotePageSize - 1));
    }, [remotePageSize, remoteSource, requestRemoteRange, tableRowCount]);

    const getVisibleSampleRowIndices = useCallback(
        (range?: { start: number; stop: number }) => {
            if (tableRowCount === 0) return [];

            const sourceRange = range ?? {
                start: 0,
                stop: Math.max(0, Math.min(tableRowCount - 1, INITIAL_VISIBLE_ROW_COUNT - 1)),
            };

            const start = Math.max(0, sourceRange.start - VISIBLE_AUTO_FIT_ROW_BUFFER);
            const stop = Math.min(tableRowCount - 1, sourceRange.stop + VISIBLE_AUTO_FIT_ROW_BUFFER);
            return getSampleRowIndices(start, stop, VISIBLE_AUTO_FIT_SAMPLE_LIMIT);
        },
        [tableRowCount],
    );

    const initialVisibleSampleRowIndices = useMemo(() => getVisibleSampleRowIndices(), [getVisibleSampleRowIndices]);

    const getVisibleAutoFitColumns = useCallback(() => {
        if (columns.length === 0) return [];

        const range = visibleColumnRangeRef.current;
        const start = Math.max(0, range.start - VISIBLE_AUTO_FIT_COLUMN_BUFFER);
        const stop = Math.min(columns.length - 1, range.stop + VISIBLE_AUTO_FIT_COLUMN_BUFFER);
        return columns.slice(start, stop + 1);
    }, [columns]);

    const visibleAutoColWidths = useMemo(() => {
        void visibleMeasurementVersion;
        const targetColumns = getVisibleAutoFitColumns();
        if (targetColumns.length === 0) return {};

        const rowIndices = getVisibleSampleRowIndices(visibleRowRangeRef.current);
        const next: ColWidths = {};
        for (const col of targetColumns) {
            next[col] = measureColumnWidth(col, rowIndices.length ? rowIndices : initialVisibleSampleRowIndices);
        }
        return next;
    }, [getVisibleAutoFitColumns, getVisibleSampleRowIndices, initialVisibleSampleRowIndices, measureColumnWidth, visibleMeasurementVersion]);

    useEffect(() => {
        const targetColumns = Object.keys(visibleAutoColWidths);
        if (targetColumns.length === 0) return;

        setAutoColWidths(prev => {
            const next: ColWidths = { ...prev };
            for (const col of targetColumns) {
                next[col] = visibleAutoColWidths[col];
            }

            if (targetColumns.every(col => prev[col] === next[col])) {
                return prev;
            }

            return next;
        });
    }, [visibleAutoColWidths]);

    useEffect(() => {
        if (typeof document === 'undefined' || !('fonts' in document)) return;

        let disposed = false;
        document.fonts.ready.then(() => {
            if (!disposed) {
                scheduleInitialMeasurement();
            }
        });

        return () => {
            disposed = true;
        };
    }, [columns, scheduleInitialMeasurement]);

    useEffect(() => {
        return () => {
            if (visibleMeasurementTimeoutRef.current) {
                clearTimeout(visibleMeasurementTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        visibleRowRangeRef.current = {
            start: 0,
            stop: Math.min(Math.max(0, tableRowCount - 1), Math.max(0, INITIAL_VISIBLE_ROW_COUNT - 1)),
        };
    }, [tableRowCount]);

    const colWidths = useMemo(() => {
        const next: ColWidths = {};
        for (const col of columns) {
            next[col] = clampColumnWidth(col, manualColWidths[col] ?? visibleAutoColWidths[col] ?? autoColWidths[col] ?? defaultColMinWidth);
        }
        return next;
    }, [autoColWidths, clampColumnWidth, columns, defaultColMinWidth, manualColWidths, visibleAutoColWidths]);

    useEffect(() => {
        onStatsChange?.({
            filteredCount: tableRowCount,
        });
    }, [onStatsChange, results, tableRowCount]);

    useEffect(() => {
        if (areSortStatesEqual(lastEmittedSortRef.current, initialSort)) {
            return;
        }

        if (!initialSort) {
            setSortState(null);
            lastEmittedSortRef.current = null;
            return;
        }

        setSortState(initialSort);
        lastEmittedSortRef.current = initialSort;
    }, [initialSort]);

    const handleSort = useCallback(
        (col: string) => {
            if (operationsDisabled) return;
            setSortState(current => {
                if (current?.column !== col) {
                    return { column: col, direction: 'asc' };
                }

                if (current.direction === 'asc') {
                    return { column: col, direction: 'desc' };
                }

                return null;
            });
        },
        [operationsDisabled],
    );

    const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(() => new Set(selectedRowIndexes ?? []));
    const [, setSelectionAnchor] = useState<number | null>(null);
    const [selectedCells, setSelectedCells] = useState<Set<CellKey>>(new Set());
    const [, setCellAnchor] = useState<{ row: number; col: string } | null>(null);
    const [focusedCell, setFocusedCell] = useState<{ row: number; col: string } | null>(null);
    const hasAnySelection = selectedCells.size > 0 || selectedRowIds.size > 0;

    const selectionAnchorRef = useRef<number | null>(null);
    const cellAnchorRef = useRef<{ row: number; col: string } | null>(null);
    const draggingRef = useRef(false);
    const lastMouseDownWasOnCell = useRef(false);

    const gridContainerRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<MultiGrid | null>(null);
    const lastEmittedSelectedRowsRef = useRef<number[]>(selectedRowIndexes ?? []);

    useEffect(() => {
        if (!selectedRowIndexes) {
            return;
        }
        const normalized = [...selectedRowIndexes].sort((left, right) => left - right);
        setSelectedRowIds(prev => {
            const current = [...prev].sort((left, right) => left - right);
            if (areNumberArraysEqual(normalized, current)) {
                return prev;
            }
            return new Set(normalized);
        });
    }, [selectedRowIndexes]);

    useEffect(() => {
        if (areSortStatesEqual(lastEmittedSortRef.current, sortState)) {
            return;
        }
        lastEmittedSortRef.current = sortState;
        onSortChange?.(sortState);
    }, [onSortChange, sortState]);

    useEffect(() => {
        const nextRows = [...selectedRowIds].sort((left, right) => left - right);
        if (areNumberArraysEqual(lastEmittedSelectedRowsRef.current, nextRows)) {
            return;
        }
        lastEmittedSelectedRowsRef.current = nextRows;
        onSelectedRowIndexesChange?.(nextRows);
    }, [onSelectedRowIndexesChange, selectedRowIds]);

    const syncHeaderHorizontalScroll = useCallback((deltaX: number) => {
        const grid = gridRef.current as MeasurableMultiGrid | null;

        const topRightGrid = grid?._topRightGrid;
        const bottomRightGrid = grid?._bottomRightGrid;
        const topRightContainer = topRightGrid?._scrollingContainer;
        const bottomRightContainer = bottomRightGrid?._scrollingContainer;
        const currentScrollLeft = bottomRightContainer?.scrollLeft ?? topRightContainer?.scrollLeft ?? 0;
        const maxScrollLeft = Math.max(
            0,
            (bottomRightContainer?.scrollWidth ?? topRightContainer?.scrollWidth ?? 0) - (bottomRightContainer?.clientWidth ?? topRightContainer?.clientWidth ?? 0),
        );
        const nextScrollLeft = Math.min(Math.max(0, currentScrollLeft + deltaX), maxScrollLeft);

        if (bottomRightContainer) {
            bottomRightContainer.scrollLeft = nextScrollLeft;
            bottomRightGrid?.handleScrollEvent?.({
                scrollLeft: nextScrollLeft,
                scrollTop: bottomRightContainer.scrollTop,
            });
        }

        if (topRightContainer) {
            topRightContainer.scrollLeft = nextScrollLeft;
            topRightGrid?.handleScrollEvent?.({
                scrollLeft: nextScrollLeft,
                scrollTop: topRightContainer.scrollTop,
            });
        }
    }, []);
    const totalWidth = useMemo(() => {
        let sum = effectiveIndexColWidth;
        for (const c of columns) sum += Math.max((colWidths[c] ?? defaultColMinWidth) + HEADER_PAD, 60);
        return sum;
    }, [columns, colWidths, defaultColMinWidth, effectiveIndexColWidth]);

    const dragState = useRef<{ col: string; startX: number; startW: number } | null>(null);
    const recomputeAll = () => {
        const g = gridRef.current as MeasurableMultiGrid | null;
        if (!g) return;
        g.recomputeGridSize?.();
        g.forceUpdateGrids?.();
    };
    const onDragStart = (e: React.MouseEvent, col: string) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = colWidths[col] ?? defaultColMinWidth;
        dragState.current = { col, startX, startW };
        document.body.style.userSelect = 'none';
        const onMove = (ev: MouseEvent) => {
            const ds = dragState.current;
            if (!ds) return;
            const delta = ev.clientX - ds.startX;
            const nextW = clampColumnWidth(col, ds.startW + delta);
            setManualColWidths(prev => ({ ...prev, [col]: nextW }));
            recomputeAll();
        };
        const onUp = () => {
            dragState.current = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
            recomputeAll();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    const autoFitVisible = (col: string) => {
        const rowIndices = getVisibleSampleRowIndices(visibleRowRangeRef.current);
        const finalW = measureColumnWidth(col, rowIndices);
        setManualColWidths(prev => ({ ...prev, [col]: finalW }));
        recomputeAll();
    };

    const clearAllSelections = (opts?: { preserveCellAnchor?: boolean; preserveRowAnchor?: boolean }) => {
        setSelectedRowIds(new Set());
        setSelectedCells(new Set());
        setFocusedCell(null);
        if (!opts?.preserveRowAnchor) {
            selectionAnchorRef.current = null;
            setSelectionAnchor(null);
        }
        if (!opts?.preserveCellAnchor) {
            cellAnchorRef.current = null;
            setCellAnchor(null);
        }
    };
    const isCellAlreadySelected = (row: number, col: string) => selectedCells.has(ck(row, col)) || selectedRowIds.has(row);
    const rowHasSelection = (row: number) => {
        if (selectedRowIds.has(row)) return true;
        if (selectedCells.size === 0) return false;
        for (const c of columns) if (selectedCells.has(ck(row, c))) return true;
        return false;
    };

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
            } finally {
                document.body.removeChild(ta);
            }
        }
    };

    const getSelectedRectBounds = useCallback(
        (sel: Set<CellKey>) => {
            if (sel.size === 0) return null;
            const rows = new Set<number>();
            const colsSet = new Set<string>();
            for (const k of sel) {
                const { row, col } = parseCK(k);
                rows.add(row);
                colsSet.add(col);
            }
            const rowList = [...rows].sort((a, b) => a - b);
            const colList = [...colsSet].sort((a, b) => columns.indexOf(a) - columns.indexOf(b));
            for (const r of rowList) for (const c of colList) if (!sel.has(ck(r, c))) return null;
            return { rows: rowList, cols: colList };
        },
        [columns],
    );
    const getSelectionAsRowsCols = () => {
        const rect = getSelectedRectBounds(selectedCells);
        if (rect) {
            const { rows, cols } = rect;
            const rows2D = rows.map(r =>
                cols.map(c => {
                    const v = getDisplayRow(r)?.rowData?.[c];
                    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                }),
            );
            return { rows, cols, rows2D };
        }
        if (selectedCells.size > 0) {
            const list = [...selectedCells].map(parseCK);
            const rowSet = new Set(list.map(c => c.row));
            const colSet = new Set(list.map(c => c.col));
            const rows = [...rowSet].sort((a, b) => a - b);
            const cols = [...colSet].sort((a, b) => columns.indexOf(a) - columns.indexOf(b));
            const rows2D = rows.map(r =>
                cols.map(c => {
                    const has = selectedCells.has(ck(r, c));
                    const v = has ? getDisplayRow(r)?.rowData?.[c] : '';
                    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                }),
            );
            return { rows, cols, rows2D };
        }
        if (selectedRowIds.size > 0) {
            const rows = [...selectedRowIds].sort((a, b) => a - b);
            const cols = [...columns];
            const rows2D = rows.map(r =>
                cols.map(c => {
                    const v = getDisplayRow(r)?.rowData?.[c];
                    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                }),
            );
            return { rows, cols, rows2D };
        }
        return null;
    };
    const selectedRectBounds = useMemo(() => getSelectedRectBounds(selectedCells), [getSelectedRectBounds, selectedCells]);
    const copyTSV = async (withHeader = false) => {
        const sel = getSelectionAsRowsCols();
        if (!sel) return;
        const { rows2D, cols } = sel;
        const lines = rows2D.map(r => r.join('\t'));
        if (withHeader) lines.unshift(cols.join('\t'));
        await copyText(lines.join('\n'));
    };
    const copySelectedCellsTSV = () => copyTSV(false);
    const copySelectedCellsTSVWithHeader = () => copyTSV(true);
    function csvEscape(s: string) {
        if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
            return `"${s.replace(/\"/g, '""')}"`;
        }
        return s;
    }
    function downloadSelectionAsCSV(includeHeader = true) {
        const sel = getSelectionAsRowsCols();
        if (!sel) return;
        const { rows2D, cols } = sel;
        const csvLines: string[] = [];
        if (includeHeader) csvLines.push(cols.map(csvEscape).join(','));
        rows2D.forEach(r => csvLines.push(r.map(csvEscape).join(',')));
        const csv = csvLines.join('\n');
        const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `selection-${ts}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    const collectRectCells = (a: { row: number; col: string }, b: { row: number; col: string }) => {
        const colIndex = new Map<string, number>();
        columns.forEach((c, i) => colIndex.set(c, i));
        const r1 = Math.min(a.row, b.row),
            r2 = Math.max(a.row, b.row);
        const c1 = Math.min(colIndex.get(a.col)!, colIndex.get(b.col)!);
        const c2 = Math.max(colIndex.get(a.col)!, colIndex.get(b.col)!);
        const out: CellKey[] = [];
        for (let r = r1; r <= r2; r++) for (let ci = c1; ci <= c2; ci++) out.push(ck(r, columns[ci]));
        return out;
    };
    const onRowIndexClick = (e: React.MouseEvent, rowIndex: number) => {
        if (e.button !== 0) return;
        if (lastMouseDownWasOnCell.current) return;
        if (e.shiftKey) {
            const anchor = selectionAnchorRef.current ?? rowIndex;
            selectionAnchorRef.current = anchor;
            setSelectionAnchor(anchor);
            const [start, end] = anchor <= rowIndex ? [anchor, rowIndex] : [rowIndex, anchor];
            const range = new Set<number>();
            for (let i = start; i <= end; i++) range.add(i);
            setSelectedRowIds(prev => {
                const next = new Set(prev);
                range.forEach(i => next.add(i));
                return next;
            });
        } else {
            clearAllSelections({ preserveRowAnchor: true, preserveCellAnchor: true });
            selectionAnchorRef.current = rowIndex;
            setSelectionAnchor(rowIndex);
            setSelectedRowIds(new Set([rowIndex]));
        }
    };
    const onRowIndexKeyDown = async (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (selectedCells.size > 0) await copySelectedCellsTSV();
            else {
                const indices = Array.from(selectedRowIds).sort((a, b) => a - b);
                const lines = indices
                    .map(i => {
                        const row = getDisplayRow(i)?.rowData ?? {};
                        return Object.values(row)
                            .map(v => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)))
                            .join('\t');
                    })
                    .join('\n');
                await copyText(lines);
            }
        }
    };
    const beginDragRect = (row: number, col: string) => {
        draggingRef.current = true;
        document.body.style.userSelect = 'none';
        window.addEventListener('mouseup', endDrag);
        cellAnchorRef.current = { row, col };
        setCellAnchor(cellAnchorRef.current);
        setSelectedCells(new Set([ck(row, col)]));
    };
    const endDrag = () => {
        draggingRef.current = false;
        document.body.style.userSelect = '';
        window.removeEventListener('mouseup', endDrag);
    };
    const updateRectSelection = (row: number, col: string) => {
        const a = cellAnchorRef.current;
        if (!a) return;
        const rect = collectRectCells(a, { row, col });
        setSelectedCells(prev => {
            const next = new Set(prev);
            rect.forEach(k => next.add(k));
            return next;
        });
    };
    const onCellMouseDown = (e: React.MouseEvent, row: number, col: string) => {
        if (e.button !== 0) return;
        e.preventDefault();
        gridContainerRef.current?.focus({ preventScroll: true });
        lastMouseDownWasOnCell.current = true;
        setTimeout(() => (lastMouseDownWasOnCell.current = false), 0);
        setFocusedCell({ row, col });
        if (e.shiftKey) {
            const anchor = cellAnchorRef.current ?? { row, col };
            cellAnchorRef.current = anchor;
            setCellAnchor(anchor);
            const rect = collectRectCells(anchor, { row, col });
            setSelectedCells(prev => {
                const next = new Set(prev);
                rect.forEach(k => next.add(k));
                return next;
            });
            return;
        }
        clearAllSelections({ preserveCellAnchor: true, preserveRowAnchor: true });
        cellAnchorRef.current = { row, col };
        setCellAnchor(cellAnchorRef.current);
        setSelectedCells(new Set([ck(row, col)]));
        beginDragRect(row, col);
        setSelectedRowIds(new Set([row]));
    };
    const onCellMouseEnter = (_e: React.MouseEvent, row: number, col: string) => {
        if (!draggingRef.current) return;
        updateRectSelection(row, col);
    };
    const onCellKeyDown = async (e: React.KeyboardEvent, rowIndex: number, col: string) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (selectedCells.size > 1) await copySelectedCellsTSV();
            else {
                const v = getDisplayRow(rowIndex)?.rowData?.[col];
                await copyText(typeof v === 'object' ? JSON.stringify(v) : v == null ? '' : String(v));
            }
        }
    };
    const onGridKeyDown = async (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (selectedCells.size > 1) {
                await copySelectedCellsTSV();
                return;
            }

            const cell = focusedCell ?? (selectedCells.size > 0 ? parseCK([...selectedCells][0]) : null);
            if (cell) {
                const v = getDisplayRow(cell.row)?.rowData?.[cell.col];
                await copyText(typeof v === 'object' ? JSON.stringify(v) : v == null ? '' : String(v));
                return;
            }

            if (selectedRowIds.size > 0) {
                const indices = Array.from(selectedRowIds).sort((a, b) => a - b);
                const lines = indices
                    .map(i => {
                        const row = getDisplayRow(i)?.rowData ?? {};
                        return Object.values(row)
                            .map(v => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)))
                            .join('\t');
                    })
                    .join('\n');
                await copyText(lines);
            }
        }
    };
    useEffect(() => {
        const onUp = () => {
            if (draggingRef.current) endDrag();
        };
        window.addEventListener('mouseup', onUp);
        return () => window.removeEventListener('mouseup', onUp);
    }, []);

    /* ===== Inspector ===== */
    function getSelectionInfo() {
        if (selectedCells.size > 0) {
            const cells = [...selectedCells].map(parseCK);
            const uniqueRows = new Set(cells.map(c => c.row));
            if (cells.length === 1) return { mode: 'singleCell', cell: cells[0] } as const;
            if (uniqueRows.size === 1) return { mode: 'singleRow', row: cells[0].row } as const;
            return { mode: 'multiRow' } as const;
        }
        if (selectedRowIds.size === 1) return { mode: 'rowOnly', row: [...selectedRowIds][0] } as const;
        return { mode: 'none' } as const;
    }
    const sel = getSelectionInfo();
    const openCellInspector = (row: number, col: string) => {
        const v = getDisplayRow(row)?.rowData?.[col];
        setInspectorMode?.('cell');
        setInspectorPayload?.({ row, col, value: v });
        setInspectorOpen?.(true);
    };
    const openRowInspector = (rowIndex: number) => {
        const rowData = getDisplayRow(rowIndex)?.rowData ?? {};
        setInspectorMode?.('row');
        setInspectorPayload?.({ row: rowIndex, rowData });
        setInspectorOpen?.(true);
    };
    const applyQuickEqualsFilterForCell = useCallback(
        (rowIndex: number, colName: string) => {
            const colMeta = (columnsRaw ?? []).find(c => c.name === colName);
            const cellVal = getDisplayRow(rowIndex)?.rowData?.[colName];
            setColumnFilter(buildEqualsFilterFromCell({ colName, colType: colMeta?.type, raw: cellVal }));
        },
        [columnsRaw, getDisplayRow, setColumnFilter],
    );

    const cellRenderer = ({ columnIndex, rowIndex, key, style }: GridCellProps) => {
        if (rowIndex === 0) {
            if (columnIndex === 0) {
                return (
                    <div
                        key={key}
                        style={{ ...style, display: 'flex', alignItems: 'center' }}
                        className="px-2 py-1 border-b border-r bg-muted text-sm font-bold select-none"
                        title={t('VTable.Header.RowNumberTitle')}
                    >
                        <span className="block truncate min-w-0 w-full text-center">#</span>
                    </div>
                );
            }
            const col = columns[columnIndex - 1];
            const isSorted = sortBy === col;
            const existing = getColumnFilter(col);
            return (
                <div
                    key={key}
                    style={{ ...style, display: 'flex', alignItems: 'center' }}
                    className={cn('relative px-2 py-1 border-b border-r bg-muted text-sm font-bold select-none whitespace-nowrap', existing && PRIMARY_SELECTION_SOFT_CLASS)}
                >
                    <button
                        type="button"
                        className={cn('flex flex-1 text-left min-w-0 overflow-hidden whitespace-nowrap', operationsDisabled ? 'cursor-default' : 'cursor-pointer')}
                        disabled={operationsDisabled}
                        onClick={() => handleSort(col)}
                    >
                        <span className="truncate block min-w-0">{col}</span>
                        {!operationsDisabled && isSorted && <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </button>

                    {!operationsDisabled && <ColumnFilterPopover {...getColumnFilterPopoverProps(col)} />}

                    <div
                        onMouseDown={e => onDragStart(e, col)}
                        onDoubleClick={() => autoFitVisible(col)}
                        className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none"
                        style={{ transform: 'translateX(50%)' }}
                    />
                </div>
            );
        }

        const r = rowIndex - 1;
        if (columnIndex === 0) {
            const isRowSelected = selectedRowIds.has(r);
            return (
                <div
                    key={key}
                    style={{ ...style, display: 'flex', alignItems: 'center' }}
                    className={cn(
                        'px-2 text-sm border-b border-r bg-card select-none cursor-pointer font-medium text-muted-foreground outline-none',
                        isRowSelected && PRIMARY_SELECTION_CLASS,
                        'focus:ring-2 focus:ring-primary/40',
                    )}
                    role="button"
                    tabIndex={0}
                    data-row-index={r}
                    onClick={e => onRowIndexClick(e, r)}
                    onKeyDown={onRowIndexKeyDown}
                    onContextMenu={e => {
                        const rowIdx = r;
                        if (rowHasSelection(rowIdx)) return;
                        if (e.shiftKey) {
                            const anchor = selectionAnchorRef.current ?? rowIdx;
                            selectionAnchorRef.current = anchor;
                            setSelectionAnchor(anchor);
                            const [start, end] = anchor <= rowIdx ? [anchor, rowIdx] : [rowIdx, anchor];
                            setSelectedRowIds(prev => {
                                const next = new Set(prev);
                                for (let i = start; i <= end; i++) next.add(i);
                                return next;
                            });
                        } else {
                            clearAllSelections({ preserveRowAnchor: true, preserveCellAnchor: true });
                            selectionAnchorRef.current = rowIdx;
                            setSelectionAnchor(rowIdx);
                            setSelectedRowIds(new Set([rowIdx]));
                        }
                    }}
                    title={t('VTable.RowIndexHint')}
                >
                    {r + 1}
                </div>
            );
        }

        const colKeyName = columns[columnIndex - 1];
        const keyCell = ck(r, colKeyName);
        const displayRow = getDisplayRow(r);
        const isRemoteRowLoading = isRemote && !displayRow;
        const isRowSelected = selectedRowIds.has(r);
        const isCellSelected = selectedCells.has(keyCell);
        const isFocused = focusedCell?.row === r && focusedCell?.col === colKeyName;
        const cellValue = displayRow?.rowData?.[colKeyName];
        const isRectSelectedCell = Boolean(selectedRectBounds && isCellSelected);
        const rectTopRow = selectedRectBounds?.rows[0];
        const rectBottomRow = selectedRectBounds?.rows[selectedRectBounds.rows.length - 1];
        const rectLeftCol = selectedRectBounds?.cols[0];
        const rectRightCol = selectedRectBounds?.cols[selectedRectBounds.cols.length - 1];
        const selectionEdgeShadow = isRectSelectedCell
            ? [
                  r === rectTopRow ? 'inset 0 1px 0 var(--primary)' : '',
                  r === rectBottomRow ? 'inset 0 -1px 0 var(--primary)' : '',
                  colKeyName === rectLeftCol ? 'inset 1px 0 0 var(--primary)' : '',
                  colKeyName === rectRightCol ? 'inset -1px 0 0 var(--primary)' : '',
              ]
                  .filter(Boolean)
                  .join(', ')
            : undefined;

        return (
            <div
                key={key}
                role="button"
                tabIndex={0}
                data-cell={keyCell}
                style={{ ...style, display: 'flex', alignItems: 'center', boxShadow: selectionEdgeShadow }}
                className={cn(
                    'px-2 text-sm border-b border-r bg-card cursor-pointer outline-none select-none',
                    'min-w-0 overflow-hidden',
                    isRowSelected && PRIMARY_SELECTION_SUBTLE_CLASS,
                    isCellSelected && PRIMARY_SELECTION_CLASS,
                    isFocused && !isRectSelectedCell && PRIMARY_SELECTION_RING_CLASS,
                    !isCellSelected && 'focus:ring-1 focus:ring-inset focus:ring-primary/40',
                )}
                onMouseDown={e => onCellMouseDown(e, r, colKeyName)}
                onMouseEnter={e => onCellMouseEnter(e, r, colKeyName)}
                onDoubleClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    openCellInspector(r, colKeyName);
                }}
                onKeyDown={e => onCellKeyDown(e, r, colKeyName)}
                onContextMenu={() => {
                    if (!isCellAlreadySelected(r, colKeyName)) {
                        clearAllSelections({ preserveCellAnchor: true, preserveRowAnchor: true });
                        setFocusedCell({ row: r, col: colKeyName });
                        cellAnchorRef.current = { row: r, col: colKeyName };
                        setCellAnchor(cellAnchorRef.current);
                        setSelectedCells(new Set([ck(r, colKeyName)]));
                        setSelectedRowIds(new Set([r]));
                    }
                }}
                title={formatTooltip(cellValue)}
            >
                {isRemoteRowLoading ? (
                    <span className="block h-3 w-20 max-w-[70%] rounded-sm bg-muted" />
                ) : (
                    <span className="block truncate min-w-0 w-full">{formatValue(cellValue)}</span>
                )}
            </div>
        );
    };

    const latestCellRendererRef = useRef(cellRenderer);
    latestCellRendererRef.current = cellRenderer;
    const stableCellRenderer = useCallback((props: GridCellProps) => latestCellRendererRef.current(props), []);
    const handleSectionRendered = useCallback<NonNullable<MultiGridProps['onSectionRendered']>>(
        ({ columnStartIndex, columnStopIndex, rowStartIndex, rowStopIndex }) => {
            const nextStart = Math.max(0, rowStartIndex - 1);
            const nextStop = Math.max(nextStart, rowStopIndex - 1);
            visibleRowRangeRef.current = { start: nextStart, stop: nextStop };

            const nextColumnStart = Math.max(0, columnStartIndex - 1);
            const nextColumnStop = Math.max(nextColumnStart, columnStopIndex - 1);
            const prevColumnRange = visibleColumnRangeRef.current;
            if (prevColumnRange.start !== nextColumnStart || prevColumnRange.stop !== nextColumnStop) {
                visibleColumnRangeRef.current = { start: nextColumnStart, stop: nextColumnStop };
            }
            if (isRemote) {
                requestRemoteRange(Math.max(0, nextStart - 30), Math.min(tableRowCount - 1, nextStop + 60));
            }
        },
        [isRemote, requestRemoteRange, tableRowCount],
    );
    const refreshGridAfterReveal = useCallback(() => {
        if (isRemote) {
            const renderedRows = [...(gridContainerRef.current?.querySelectorAll<HTMLElement>('[data-cell]') ?? [])]
                .map(element => element.dataset.cell)
                .filter((cell): cell is CellKey => Boolean(cell))
                .map(cell => parseCK(cell).row)
                .filter(Number.isFinite);
            const start = renderedRows.length > 0 ? Math.min(...renderedRows) : visibleRowRangeRef.current.start;
            const stop = renderedRows.length > 0 ? Math.max(...renderedRows) : visibleRowRangeRef.current.stop;
            visibleRowRangeRef.current = { start, stop };
            requestRemoteRange(Math.max(0, start - 30), Math.min(tableRowCount - 1, stop + 60));
        }
    }, [isRemote, requestRemoteRange, tableRowCount]);

    const hydrateVisibleRemoteCells = useCallback(() => {
        if (!isRemote) return;
        const container = gridContainerRef.current;
        if (!container) return;

        container.querySelectorAll<HTMLElement>('[data-cell]').forEach(element => {
            const rawCell = element.dataset.cell;
            if (!rawCell) return;
            const { row, col } = parseCK(rawCell as CellKey);
            const displayRow = remoteRowsRef.current.get(row);
            if (!displayRow) return;

            const content = element.firstElementChild as HTMLElement | null;
            if (!content) return;
            const value = displayRow.rowData[col];
            content.className = 'block truncate min-w-0 w-full';
            content.textContent = formatValue(value);
            element.title = formatTooltip(value);
        });
    }, [isRemote]);

    useLayoutEffect(() => {
        hydrateVisibleRemoteCells();
    }, [hydrateVisibleRemoteCells, remoteRowsVersion]);

    useEffect(() => {
        const refreshActiveGrid = () => {
            const container = gridContainerRef.current;
            if (!container) return;
            const { width, height } = container.getBoundingClientRect();
            if (width > 0 && height > 0) {
                refreshGridAfterReveal();
                hydrateVisibleRemoteCells();
            }
        };

        window.addEventListener('dory:sql-tab-activated', refreshActiveGrid);
        return () => window.removeEventListener('dory:sql-tab-activated', refreshActiveGrid);
    }, [hydrateVisibleRemoteCells, refreshGridAfterReveal]);

    useLayoutEffect(() => {
        if (!isActive) return;
        const frameId = requestAnimationFrame(refreshGridAfterReveal);
        return () => cancelAnimationFrame(frameId);
    }, [isActive, refreshGridAfterReveal]);

    useLayoutEffect(() => {
        const container = gridContainerRef.current;
        if (!container) return;

        let wasVisible = false;
        const refreshWhenVisible = () => {
            const { width, height } = container.getBoundingClientRect();
            const isVisible = width > 0 && height > 0;
            if (!isVisible) {
                wasVisible = false;
                return;
            }
            if (wasVisible) return;

            wasVisible = true;
            refreshGridAfterReveal();
            hydrateVisibleRemoteCells();
        };

        refreshWhenVisible();
        const resizeObserver = new ResizeObserver(refreshWhenVisible);
        resizeObserver.observe(container);

        const visibilityObserver = new MutationObserver(refreshWhenVisible);
        let ancestor = container.parentElement;
        while (ancestor && ancestor !== document.body) {
            visibilityObserver.observe(ancestor, {
                attributes: true,
                attributeFilter: ['class', 'hidden', 'style'],
            });
            ancestor = ancestor.parentElement;
        }

        return () => {
            resizeObserver.disconnect();
            visibilityObserver.disconnect();
        };
    }, [hydrateVisibleRemoteCells, refreshGridAfterReveal]);
    const getGridColumnWidth = useCallback(
        ({ index }: { index: number }) => {
            if (index === 0) return effectiveIndexColWidth;
            const col = columns[index - 1];
            const base = Math.max(colWidths[col] ?? defaultColMinWidth, 60);
            return base + HEADER_PAD;
        },
        [colWidths, columns, defaultColMinWidth, effectiveIndexColWidth],
    );
    const getGridRowHeight = useCallback(({ index }: { index: number }) => (index === 0 ? Math.max(rowHeight, 32) : rowHeight), [rowHeight]);
    const latestSectionRenderedRef = useRef(handleSectionRendered);
    latestSectionRenderedRef.current = handleSectionRendered;
    const stableSectionRendered = useCallback<NonNullable<MultiGridProps['onSectionRendered']>>(props => latestSectionRenderedRef.current(props), []);
    const latestGridColumnWidthRef = useRef(getGridColumnWidth);
    latestGridColumnWidthRef.current = getGridColumnWidth;
    const stableGridColumnWidth = useCallback((props: { index: number }) => latestGridColumnWidthRef.current(props), []);
    const latestGridRowHeightRef = useRef(getGridRowHeight);
    latestGridRowHeightRef.current = getGridRowHeight;
    const stableGridRowHeight = useCallback((props: { index: number }) => latestGridRowHeightRef.current(props), []);

    useLayoutEffect(() => {
        const container = gridContainerRef.current;
        if (!container) return;

        const rectBounds = getSelectedRectBounds(selectedCells);
        const rectTopRow = rectBounds?.rows[0];
        const rectBottomRow = rectBounds?.rows[rectBounds.rows.length - 1];
        const rectLeftCol = rectBounds?.cols[0];
        const rectRightCol = rectBounds?.cols[rectBounds.cols.length - 1];

        container.querySelectorAll<HTMLElement>('[data-cell]').forEach(element => {
            const rawCell = element.dataset.cell;
            if (!rawCell) return;
            const { row, col } = parseCK(rawCell as CellKey);
            const isRowSelected = selectedRowIds.has(row);
            const isCellSelected = selectedCells.has(rawCell as CellKey);
            const isFocused = focusedCell?.row === row && focusedCell.col === col;

            element.classList.remove(...SELECTION_CLASS_NAMES);
            if (isRowSelected) element.classList.add(...PRIMARY_SELECTION_SUBTLE_CLASS.split(' '));
            if (isCellSelected) element.classList.add(...PRIMARY_SELECTION_CLASS.split(' '));
            if (isFocused && !rectBounds) element.classList.add(...PRIMARY_SELECTION_RING_CLASS.split(' '));

            element.style.boxShadow =
                rectBounds && isCellSelected
                    ? [
                          row === rectTopRow ? 'inset 0 1px 0 var(--primary)' : '',
                          row === rectBottomRow ? 'inset 0 -1px 0 var(--primary)' : '',
                          col === rectLeftCol ? 'inset 1px 0 0 var(--primary)' : '',
                          col === rectRightCol ? 'inset -1px 0 0 var(--primary)' : '',
                      ]
                          .filter(Boolean)
                          .join(', ')
                    : '';
        });

        container.querySelectorAll<HTMLElement>('[data-row-index]').forEach(element => {
            const rowIndex = Number(element.dataset.rowIndex);
            element.classList.remove(...PRIMARY_SELECTION_CLASS.split(' '));
            if (selectedRowIds.has(rowIndex)) element.classList.add(...PRIMARY_SELECTION_CLASS.split(' '));
        });
    }, [focusedCell, getSelectedRectBounds, selectedCells, selectedRowIds]);

    useEffect(() => {
        const g = gridRef.current as MeasurableMultiGrid | null;
        g?.recomputeGridSize?.();
        g?.forceUpdateGrids?.();
    }, [colWidths, rowHeight, totalWidth]);

    useEffect(() => {
        const container = gridContainerRef.current;
        if (!container) {
            return;
        }

        const handleWheel = (event: WheelEvent) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            if (!target.closest('.TopRightGrid_ScrollWrapper')) {
                return;
            }

            const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
            if (horizontalDelta === 0) {
                return;
            }

            event.preventDefault();
            syncHeaderHorizontalScroll(horizontalDelta);
        };

        container.addEventListener('wheel', handleWheel, { passive: false, capture: true });

        return () => {
            container.removeEventListener('wheel', handleWheel, true);
        };
    }, [syncHeaderHorizontalScroll, columns.length, tableRowCount]);

    const renderGrid = useCallback(
        ({ width, height }: { width: number; height: number }) => {
            return (
                <VersionedMultiGrid
                    ref={gridRef}
                    dataVersion={String(remoteRowsVersion)}
                    onSectionRendered={stableSectionRendered}
                    width={width}
                    height={height}
                    columnCount={columns.length + 1}
                    rowCount={tableRowCount + 1}
                    fixedRowCount={1}
                    fixedColumnCount={1}
                    overscanRowCount={80}
                    overscanColumnCount={2}
                    enableFixedColumnScroll
                    enableFixedRowScroll
                    scrollToAlignment="start"
                    columnWidth={stableGridColumnWidth}
                    rowHeight={stableGridRowHeight}
                    cellRenderer={stableCellRenderer}
                    classNameTopLeftGrid="bg-muted"
                    classNameTopRightGrid="bg-muted"
                    classNameBottomLeftGrid="bg-card"
                    classNameBottomRightGrid="bg-card"
                    hideTopRightGridScrollbar
                    hideBottomLeftGridScrollbar
                    styleTopRightGrid={TOP_RIGHT_GRID_STYLE}
                    styleBottomLeftGrid={BOTTOM_LEFT_GRID_STYLE}
                    styleTopLeftGrid={TOP_LEFT_GRID_STYLE}
                    styleBottomRightGrid={BOTTOM_RIGHT_GRID_STYLE}
                    style={GRID_STYLE}
                />
            );
        },
        [columns.length, remoteRowsVersion, stableCellRenderer, stableGridColumnWidth, stableGridRowHeight, stableSectionRendered, tableRowCount],
    );
    const gridElement = useMemo(() => <AutoSizer>{renderGrid}</AutoSizer>, [renderGrid]);

    // const clearQuery = () => setGlobalQuery('');

    if (!isRemote && (!results || results.length === 0)) return null;
    if (isRemote && tableRowCount === 0) return null;

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div className="w-full h-full border overflow-hidden flex flex-col bg-card">
                    {showFiltersBar && (
                        <VTableFilters
                            activeFilters={activeFilters}
                            columnsRaw={columnsRaw ?? []}
                            onUpsertFilter={setColumnFilter}
                            onRemoveFilter={removeFilter}
                            onClearAllFilters={clearAllFilters}
                        />
                    )}

                    {/* Grid */}
                    <div
                        ref={gridContainerRef}
                        className="flex-1 min-h-0 outline-none"
                        tabIndex={0}
                        onKeyDown={onGridKeyDown}
                    >
                        {gridElement}
                    </div>
                </div>
            </ContextMenuTrigger>

            <ContextMenuContent className="w-60">
                {sel.mode === 'singleCell' && (
                    <>
                        <ContextMenuItem
                            inset
                            onSelect={() => {
                                const fc = focusedCell ?? (selectedCells.size > 0 ? parseCK([...selectedCells][0]) : null);
                                const row = fc?.row ?? [...selectedRowIds][0] ?? null;
                                const col = fc?.col ?? columns[0] ?? null;
                                if (row != null && col != null) openCellInspector(row, col);
                            }}
                        >
                            {t('VTable.Context.ViewCell')}
                        </ContextMenuItem>
                        <ContextMenuItem
                            inset
                            onSelect={() => {
                                const rowIndex = [...selectedRowIds][0] ?? (focusedCell ? focusedCell.row : null);
                                if (rowIndex != null) openRowInspector(rowIndex);
                            }}
                        >
                            {t('VTable.Context.ViewRowDetails')}
                        </ContextMenuItem>
                    </>
                )}
                {sel.mode === 'singleRow' && (
                    <ContextMenuItem
                        inset
                        onSelect={() => {
                            const rowIndex = [...selectedRowIds][0] ?? (focusedCell ? focusedCell.row : null);
                            if (rowIndex != null) openRowInspector(rowIndex);
                        }}
                    >
                        {t('VTable.Context.ViewRowDetails')}
                    </ContextMenuItem>
                )}
                {sel.mode === 'rowOnly' && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            inset
                            onSelect={() => {
                                const rowIndex = [...selectedRowIds][0] ?? (focusedCell ? focusedCell.row : null);
                                if (rowIndex != null) openRowInspector(rowIndex);
                            }}
                        >
                            {t('VTable.Context.ViewRowDetails')}
                        </ContextMenuItem>
                    </>
                )}
                <ContextMenuItem
                    inset
                    disabled={!hasAnySelection}
                    onSelect={async e => {
                        e.stopPropagation();
                        await copySelectedCellsTSV();
                    }}
                >
                    {t('VTable.Context.Copy')}
                </ContextMenuItem>
                <ContextMenuItem
                    inset
                    disabled={!hasAnySelection}
                    onSelect={async e => {
                        e.stopPropagation();
                        await copySelectedCellsTSVWithHeader();
                    }}
                >
                    {t('VTable.Context.CopyWithHeaders')}
                </ContextMenuItem>
                {!operationsDisabled && (sel.mode === 'singleCell' || sel.mode === 'rowOnly' || sel.mode === 'singleRow') && (
                    <ContextMenuItem
                        inset
                        onSelect={e => {
                            e.stopPropagation();
                            const cell = focusedCell ?? (selectedCells.size > 0 ? parseCK([...selectedCells][0]) : null);
                            if (!cell) return;
                            applyQuickEqualsFilterForCell(cell.row, cell.col);
                        }}
                    >
                        {t('VTable.Context.FilterByValue')}
                    </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                    inset
                    disabled={!hasAnySelection}
                    onSelect={e => {
                        e.stopPropagation();
                        downloadSelectionAsCSV(true);
                    }}
                >
                    {t('VTable.Context.DownloadCsv')}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
