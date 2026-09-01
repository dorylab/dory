'use client';
import { cn } from '@dory/web-utils';
import { useMemo, useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { GridCellProps, AutoSizer, MultiGrid, MultiGridProps } from 'react-virtualized';
import { toast } from 'sonner';
import { ColumnFilterPopover } from './ColumnFIlter';
import { VTableProps, ColWidths, CellKey, VTableCellChange, VTableCellTarget, ck, parseCK } from './type';
import { formatTooltip, formatValue } from './utils';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/registry/new-york-v4/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { buildEqualsFilterFromCell, mapDbTypeToTwoKinds } from './filter';
import { useTranslations } from 'next-intl';
import { useVTableFilterUi, useVTableFilters, VTableFilters } from './VTableFilters';
import { getCellEditorKind, parseEditDraft, toDateEditDraft, toEditDraft } from './cell-editing';
import { mapClipboardMatrix, parseClipboardMatrix } from './clipboard-editing';

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
const REMOTE_RESULT_NOT_READY_RETRY_MS = 300;
const HEADER_TEXT_PAD = 44;
const CELL_TEXT_PAD = 18;
const FALLBACK_CHAR_WIDTH = 8;
const PRIMARY_SELECTION_CLASS = 'bg-primary/10 text-foreground';
const PRIMARY_SELECTION_SUBTLE_CLASS = 'bg-primary/6 text-foreground';
const PRIMARY_SELECTION_SOFT_CLASS = 'bg-primary/8 text-foreground';
const PRIMARY_SELECTION_RING_CLASS = 'ring-1 ring-inset ring-primary/25';
const SELECTION_BORDER_COLOR = 'color-mix(in oklab, var(--primary) 60%, transparent)';
const INDEPENDENT_SELECTION_OUTLINE = `1px solid ${SELECTION_BORDER_COLOR}`;
const SELECTION_CLASS_NAMES = [...new Set(`${PRIMARY_SELECTION_CLASS} ${PRIMARY_SELECTION_SUBTLE_CLASS} ${PRIMARY_SELECTION_RING_CLASS}`.split(' '))];
const TOP_RIGHT_GRID_STYLE = { overflowX: 'hidden', overflowY: 'hidden' } as const;
const BOTTOM_LEFT_GRID_STYLE = { overflowY: 'hidden', overflowX: 'hidden' } as const;
const TOP_LEFT_GRID_STYLE = { overflow: 'hidden' } as const;
const BOTTOM_RIGHT_GRID_STYLE = { overflowY: 'auto', overflowX: 'auto' } as const;
const GRID_STYLE = { outline: 'none' } as const;

type ContextMenuItemWithReasonProps = React.ComponentProps<typeof ContextMenuItem> & {
    disabledReason?: string;
};

function ContextMenuItemWithReason({ disabledReason, disabled, className, children, ...props }: ContextMenuItemWithReasonProps) {
    const item = (
        <ContextMenuItem {...props} disabled={disabled} className={cn(className, disabled && disabledReason ? 'data-disabled:pointer-events-auto' : undefined)}>
            {children}
        </ContextMenuItem>
    );

    if (!disabled || !disabledReason) return item;

    return (
        <Tooltip>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
                {disabledReason}
            </TooltipContent>
        </Tooltip>
    );
}

type ColumnMeta = {
    name: string;
    type?: string | null;
    nullable?: boolean;
    isPrimaryKey?: boolean;
};

type RawColumnMeta = {
    name?: unknown;
    type?: unknown;
    nullable?: unknown;
    isPrimaryKey?: unknown;
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
    scrollToCell?: (params: { columnIndex: number; rowIndex: number }) => void;
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
    columnMetas,
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
    editable = false,
    editDisabledReason,
    getCellEditState,
    isRowChanged,
    onCellChange,
    onCellsChange,
    onRevertCell,
    onCellsRevert,
    onUndo,
    onRedo,
    onCommitAll,
    onSelectionChange,
    focusRequest,
    activeRowIndex = null,
    onActiveRowChange,
}: VTableProps) {
    const t = useTranslations('SqlConsole');
    const columnsRaw = useMemo<ColumnMeta[]>(() => {
        const rawColumns = columnMetas as RawColumnMeta[];
        return rawColumns
            .filter((column): column is RawColumnMeta & { name: string } => typeof column.name === 'string' && column.name.length > 0)
            .map(column => ({
                name: column.name,
                type: typeof column.type === 'string' || column.type === null ? column.type : undefined,
                nullable:
                    typeof column.nullable === 'boolean'
                        ? column.nullable
                        : typeof column.nullable === 'number'
                          ? column.nullable !== 0
                          : typeof column.nullable === 'string'
                            ? ['true', 'yes', '1'].includes(column.nullable.toLowerCase())
                            : undefined,
                isPrimaryKey:
                    typeof column.isPrimaryKey === 'boolean'
                        ? column.isPrimaryKey
                        : typeof column.isPrimaryKey === 'number'
                          ? column.isPrimaryKey !== 0
                          : typeof column.isPrimaryKey === 'string'
                            ? ['true', 'yes', '1'].includes(column.isPrimaryKey.toLowerCase())
                            : undefined,
            }));
    }, [columnMetas]);
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
    const remoteRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [remoteRetryVersion, setRemoteRetryVersion] = useState(0);
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
            if (isRemote) return remoteRowsRef.current.get(rowIndex) ?? remoteSource?.initialRows?.[rowIndex];
            return sortedResults[rowIndex];
        },
        [isRemote, remoteSource?.initialRows, sortedResults],
    );

    useEffect(() => {
        const resetRemoteRequests = () => {
            for (const controller of remotePageAbortControllersRef.current.values()) {
                controller.abort();
            }
            if (remoteRetryTimerRef.current !== null) {
                clearTimeout(remoteRetryTimerRef.current);
                remoteRetryTimerRef.current = null;
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
                    .then(result => {
                        if (controller.signal.aborted) return;
                        if (activeRemoteCacheKeyRef.current !== remoteSource.cacheKey) return;
                        if (!result.ready) {
                            if (remoteRetryTimerRef.current === null) {
                                remoteRetryTimerRef.current = setTimeout(() => {
                                    remoteRetryTimerRef.current = null;
                                    setRemoteRetryVersion(version => version + 1);
                                }, REMOTE_RESULT_NOT_READY_RETRY_MS);
                            }
                            return;
                        }
                        if (remoteRowsStaleRef.current) {
                            remoteRowsRef.current = new Map();
                            remoteRowsStaleRef.current = false;
                        }
                        result.rows.forEach((row, index) => {
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
                            remoteSource.onError?.(error);
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
    }, [remotePageSize, remoteRetryVersion, remoteSource, requestRemoteRange, tableRowCount]);

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
    const [editingCell, setEditingCell] = useState<{
        row: number;
        col: string;
        draft: string;
        error: string | null;
        targets: VTableCellTarget[];
    } | null>(null);
    const editingCancelledRef = useRef(false);
    const focusCellEditorAtEnd = useCallback((editor: HTMLInputElement | null) => {
        if (!editor || editor.type !== 'text') return;

        editor.focus({ preventScroll: true });
        const caretPosition = editor.value.length;
        editor.setSelectionRange(caretPosition, caretPosition);
    }, []);
    const hasAnySelection = selectedCells.size > 0 || selectedRowIds.size > 0;

    const selectedRowIdsRef = useRef(selectedRowIds);
    selectedRowIdsRef.current = selectedRowIds;
    const selectedCellsRef = useRef(selectedCells);
    selectedCellsRef.current = selectedCells;
    const selectionAnchorRef = useRef<number | null>(null);
    const cellAnchorRef = useRef<{ row: number; col: string } | null>(null);
    const draggingRef = useRef(false);
    const lastMouseDownWasOnCell = useRef(false);

    const gridContainerRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<MultiGrid | null>(null);
    const lastEmittedSelectedRowsRef = useRef<number[]>(selectedRowIndexes ?? []);

    const getColumnMeta = useCallback((column: string) => columnsRaw.find(item => item.name === column), [columnsRaw]);
    const getEffectiveCellState = useCallback(
        (row: number, column: string) => {
            const meta = getColumnMeta(column);
            const kind = getCellEditorKind(meta?.type);
            const externalState = getCellEditState?.(row, column);
            const canEdit = Boolean(editable && externalState?.editable !== false && !meta?.isPrimaryKey && kind !== 'complex');
            return {
                kind,
                meta,
                editable: canEdit,
                changed: Boolean(externalState?.changed),
                nullable: externalState?.nullable ?? meta?.nullable ?? false,
                readOnlyReason: externalState?.readOnlyReason,
            };
        },
        [editable, getCellEditState, getColumnMeta],
    );

    const focusGridCell = useCallback(
        (row: number, column: string) => {
            const columnIndex = columns.indexOf(column);
            if (row < 0 || row >= tableRowCount || columnIndex < 0) return;
            const cell = { row, col: column };
            setFocusedCell(cell);
            setSelectedCells(new Set([ck(row, column)]));
            setSelectedRowIds(new Set());
            cellAnchorRef.current = cell;
            setCellAnchor(cell);
            (gridRef.current as MeasurableMultiGrid | null)?.scrollToCell?.({
                rowIndex: row + 1,
                columnIndex: columnIndex + 1,
            });
            requestAnimationFrame(() => gridContainerRef.current?.focus({ preventScroll: true }));
        },
        [columns, tableRowCount],
    );

    const moveFocusedCell = useCallback(
        (rowDelta: number, columnDelta: number, from = focusedCell) => {
            if (!from || columns.length === 0 || tableRowCount === 0) return;
            const currentColumnIndex = Math.max(0, columns.indexOf(from.col));
            let nextRow = from.row + rowDelta;
            let nextColumnIndex = currentColumnIndex + columnDelta;
            if (nextColumnIndex >= columns.length) {
                nextColumnIndex = 0;
                nextRow += 1;
            } else if (nextColumnIndex < 0) {
                nextColumnIndex = columns.length - 1;
                nextRow -= 1;
            }
            nextRow = Math.max(0, Math.min(tableRowCount - 1, nextRow));
            focusGridCell(nextRow, columns[nextColumnIndex]);
        },
        [columns, focusGridCell, focusedCell, tableRowCount],
    );

    const beginCellEdit = useCallback(
        (row: number, column: string, initialDraft?: string, targets: VTableCellTarget[] = [{ rowIndex: row, column }]) => {
            const state = getEffectiveCellState(row, column);
            if (!state.editable) return;
            const value = getDisplayRow(row)?.rowData?.[column];
            editingCancelledRef.current = false;
            setEditingCell({
                row,
                col: column,
                draft: initialDraft ?? (state.kind === 'date' ? toDateEditDraft(value, state.meta?.type) : toEditDraft(value)),
                error: null,
                targets,
            });
            if (targets.length === 1) {
                focusGridCell(row, column);
            } else {
                setFocusedCell({ row, col: column });
                requestAnimationFrame(() => gridContainerRef.current?.focus({ preventScroll: true }));
            }
        },
        [focusGridCell, getDisplayRow, getEffectiveCellState],
    );

    const commitCellEdit = useCallback(
        (move?: 'next' | 'previous') => {
            if (!editingCell) return true;
            const state = getEffectiveCellState(editingCell.row, editingCell.col);
            try {
                const nextValue = parseEditDraft(state.kind, editingCell.draft, {
                    chooseBoolean: t('VTable.Edit.ChooseBoolean'),
                    invalidNumber: t('VTable.Edit.InvalidNumber'),
                });
                const changes = editingCell.targets.map(target => ({
                    ...target,
                    originalValue: getDisplayRow(target.rowIndex)?.rowData?.[target.column],
                    nextValue,
                }));
                if (changes.length > 1) {
                    const result = onCellsChange?.(changes);
                    if (!result?.ok) {
                        const message = result?.error ?? t('VTable.Bulk.Unavailable');
                        setEditingCell(current => (current ? { ...current, error: message } : current));
                        toast.error(message);
                        return false;
                    }
                    if (result.changedCellCount > 0) {
                        toast.success(t('VTable.Bulk.Applied', { cells: result.changedCellCount, rows: result.affectedRowCount }));
                    }
                } else {
                    const [change] = changes;
                    if (change) onCellChange?.(change);
                }
                const committedCell = { row: editingCell.row, col: editingCell.col };
                setEditingCell(null);
                if (move && changes.length === 1) {
                    requestAnimationFrame(() => moveFocusedCell(0, move === 'next' ? 1 : -1, committedCell));
                } else {
                    requestAnimationFrame(() => gridContainerRef.current?.focus({ preventScroll: true }));
                }
                return true;
            } catch (error) {
                setEditingCell(current => (current ? { ...current, error: error instanceof Error ? error.message : String(error) } : current));
                return false;
            }
        },
        [editingCell, getDisplayRow, getEffectiveCellState, moveFocusedCell, onCellChange, onCellsChange, t],
    );

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

    useEffect(() => {
        const selectedCellRows = new Set([...selectedCells].map(cell => parseCK(cell).row));
        const selectedRows = new Set([...selectedRowIds, ...selectedCellRows]);
        onSelectionChange?.({
            cellCount: selectedCells.size,
            rowCount: selectedRows.size,
        });
    }, [onSelectionChange, selectedCells, selectedRowIds]);

    useEffect(() => {
        if (!focusRequest) return;
        focusGridCell(focusRequest.rowIndex, focusRequest.column);
    }, [focusGridCell, focusRequest]);

    useEffect(() => {
        const grid = gridRef.current as MeasurableMultiGrid | null;
        grid?.forceUpdateGrids?.();
    }, [editingCell]);

    useLayoutEffect(() => {
        const grid = gridRef.current as MeasurableMultiGrid | null;
        grid?.forceUpdateGrids?.();
    }, [activeRowIndex, getCellEditState, isRowChanged, results]);

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
    const isCellAlreadySelected = (row: number, col: string) => selectedCellsRef.current.has(ck(row, col)) || selectedRowIdsRef.current.has(row);
    const rowHasSelection = (row: number) => {
        if (selectedRowIdsRef.current.has(row)) return true;
        if (selectedCellsRef.current.size === 0) return false;
        for (const c of columns) if (selectedCellsRef.current.has(ck(row, c))) return true;
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
            for (let index = 1; index < rowList.length; index += 1) {
                if (rowList[index] !== rowList[index - 1] + 1) return null;
            }
            for (let index = 1; index < colList.length; index += 1) {
                if (columns.indexOf(colList[index]) !== columns.indexOf(colList[index - 1]) + 1) return null;
            }
            for (const r of rowList) for (const c of colList) if (!sel.has(ck(r, c))) return null;
            return { rows: rowList, cols: colList };
        },
        [columns],
    );
    const getSelectionAsRowsCols = () => {
        const currentSelectedCells = selectedCellsRef.current;
        const currentSelectedRowIds = selectedRowIdsRef.current;
        const rect = getSelectedRectBounds(currentSelectedCells);
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
        if (currentSelectedCells.size > 0) {
            const list = [...currentSelectedCells].map(parseCK);
            const rowSet = new Set(list.map(c => c.row));
            const colSet = new Set(list.map(c => c.col));
            const rows = [...rowSet].sort((a, b) => a - b);
            const cols = [...colSet].sort((a, b) => columns.indexOf(a) - columns.indexOf(b));
            const rows2D = rows.map(r =>
                cols.map(c => {
                    const has = currentSelectedCells.has(ck(r, c));
                    const v = has ? getDisplayRow(r)?.rowData?.[c] : '';
                    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                }),
            );
            return { rows, cols, rows2D };
        }
        if (currentSelectedRowIds.size > 0) {
            const rows = [...currentSelectedRowIds].sort((a, b) => a - b);
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
    const getSelectedCellTargets = useCallback((): VTableCellTarget[] => {
        return [...selectedCellsRef.current]
            .map(parseCK)
            .map(cell => ({ rowIndex: cell.row, column: cell.col }))
            .sort((left, right) => left.rowIndex - right.rowIndex || columns.indexOf(left.column) - columns.indexOf(right.column));
    }, [columns]);
    const getSameColumnTargets = useCallback(() => {
        const targets = getSelectedCellTargets();
        if (targets.length < 2) return null;
        const column = targets[0]?.column;
        return column && targets.every(target => target.column === column) ? targets : null;
    }, [getSelectedCellTargets]);
    const applyBatchChanges = useCallback(
        (changes: VTableCellChange[], options?: { announceSuccess?: boolean }) => {
            if (!onCellsChange) {
                const error = t('VTable.Bulk.Unavailable');
                toast.error(error);
                return false;
            }
            const result = onCellsChange(changes);
            if (!result.ok) {
                toast.error(result.error);
                return false;
            }
            if (result.changedCellCount > 0 && options?.announceSuccess !== false) {
                toast.success(t('VTable.Bulk.Applied', { cells: result.changedCellCount, rows: result.affectedRowCount }));
            }
            return true;
        },
        [onCellsChange, t],
    );
    const applyClipboardText = useCallback(
        (text: string) => {
            let matrix: string[][];
            try {
                matrix = parseClipboardMatrix(text);
            } catch {
                toast.error(t('VTable.Bulk.InvalidClipboard'));
                return false;
            }

            const selectedCellsForPaste = getSelectedCellTargets().map(target => ({
                rowIndex: target.rowIndex,
                columnIndex: columns.indexOf(target.column),
            }));
            const focusedCellForPaste = focusedCell
                ? {
                      rowIndex: focusedCell.row,
                      columnIndex: columns.indexOf(focusedCell.col),
                  }
                : null;
            const mapping = mapClipboardMatrix({
                matrix,
                selectedCells: selectedCellsForPaste,
                focusedCell: focusedCellForPaste,
                rowCount: tableRowCount,
                columnCount: columns.length,
            });
            if (!mapping.ok) {
                toast.error(t(`VTable.Bulk.MappingError.${mapping.reason}`));
                return false;
            }

            const changes: VTableCellChange[] = [];
            const errors: string[] = [];
            for (const assignment of mapping.assignments) {
                const column = columns[assignment.columnIndex];
                if (!column) {
                    errors.push(t('VTable.Bulk.OutOfBounds'));
                    continue;
                }
                const state = getEffectiveCellState(assignment.rowIndex, column);
                if (!state.editable) {
                    errors.push(state.readOnlyReason ?? t('VTable.Bulk.ReadOnly'));
                    continue;
                }
                try {
                    const nextValue = parseEditDraft(state.kind, assignment.value, {
                        chooseBoolean: t('VTable.Edit.ChooseBoolean'),
                        invalidNumber: t('VTable.Edit.InvalidNumber'),
                    });
                    changes.push({
                        rowIndex: assignment.rowIndex,
                        column,
                        originalValue: getDisplayRow(assignment.rowIndex)?.rowData?.[column],
                        nextValue,
                    });
                } catch (error) {
                    errors.push(error instanceof Error ? error.message : String(error));
                }
            }

            if (errors.length > 0) {
                toast.error(t('VTable.Bulk.Rejected', { reason: errors[0], count: errors.length }));
                return false;
            }
            return applyBatchChanges(changes, { announceSuccess: false });
        },
        [applyBatchChanges, columns, focusedCell, getDisplayRow, getEffectiveCellState, getSelectedCellTargets, t, tableRowCount],
    );
    const handleGridPaste = useCallback(
        (event: React.ClipboardEvent<HTMLDivElement>) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (!editable) return;
            event.preventDefault();
            applyClipboardText(event.clipboardData.getData('text/plain'));
        },
        [applyClipboardText, editable],
    );
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
            if (selectedCellsRef.current.size > 0) await copySelectedCellsTSV();
            else {
                const indices = Array.from(selectedRowIdsRef.current).sort((a, b) => a - b);
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
    const endDrag = useCallback(() => {
        draggingRef.current = false;
        document.body.style.userSelect = '';
    }, []);
    const beginDragRect = (row: number, col: string) => {
        draggingRef.current = true;
        document.body.style.userSelect = 'none';
        cellAnchorRef.current = { row, col };
        setCellAnchor(cellAnchorRef.current);
        setSelectedCells(new Set([ck(row, col)]));
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
        if (editingCell && (editingCell.row !== row || editingCell.col !== col) && !commitCellEdit()) {
            e.preventDefault();
            return;
        }
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
        if (e.metaKey || e.ctrlKey) {
            const cellKey = ck(row, col);
            const next = new Set(selectedCellsRef.current);
            const wasSelected = next.delete(cellKey);
            if (!wasSelected) next.add(cellKey);

            setSelectedCells(next);
            setSelectedRowIds(new Set());

            const nextFocusedCell = !wasSelected ? { row, col } : next.size > 0 ? parseCK([...next][next.size - 1]) : null;
            setFocusedCell(nextFocusedCell);
            cellAnchorRef.current = nextFocusedCell;
            setCellAnchor(nextFocusedCell);
            return;
        }
        clearAllSelections({ preserveCellAnchor: true, preserveRowAnchor: true });
        cellAnchorRef.current = { row, col };
        setCellAnchor(cellAnchorRef.current);
        setSelectedCells(new Set([ck(row, col)]));
        beginDragRect(row, col);
        setSelectedRowIds(editable ? new Set() : new Set([row]));
    };
    const onCellMouseEnter = (_e: React.MouseEvent, row: number, col: string) => {
        if (!draggingRef.current) return;
        updateRectSelection(row, col);
    };
    const onCellKeyDown = async (e: React.KeyboardEvent, rowIndex: number, col: string) => {
        if (editingCell?.row === rowIndex && editingCell.col === col) {
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            if (selectedCellsRef.current.size > 1) await copySelectedCellsTSV();
            else {
                const v = getDisplayRow(rowIndex)?.rowData?.[col];
                await copyText(typeof v === 'object' ? JSON.stringify(v) : v == null ? '' : String(v));
            }
        }
    };
    const onGridKeyDown = async (e: React.KeyboardEvent) => {
        if (editingCell) {
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) onRedo?.();
            else onUndo?.();
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && editable) {
            e.preventDefault();
            onCommitAll?.();
            return;
        }
        if (focusedCell && !e.metaKey && !e.ctrlKey && !e.altKey) {
            if (e.key === 'Enter') {
                e.preventDefault();
                beginCellEdit(focusedCell.row, focusedCell.col);
                return;
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                moveFocusedCell(e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0, e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0);
                return;
            }
            if (editable && e.key.length === 1) {
                e.preventDefault();
                const state = getEffectiveCellState(focusedCell.row, focusedCell.col);
                const bulkTargets = getSameColumnTargets();
                if (bulkTargets && onCellsChange) {
                    if (state.kind === 'boolean' || state.kind === 'date') {
                        toast.info(t('VTable.Bulk.UseSetSelected'));
                        return;
                    }
                    beginCellEdit(focusedCell.row, focusedCell.col, e.key, bulkTargets);
                    return;
                }
                beginCellEdit(focusedCell.row, focusedCell.col, state.kind === 'boolean' || state.kind === 'date' ? undefined : e.key);
                return;
            }
        }
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
    }, [endDrag]);

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
    const contextCell = focusedCell ?? (selectedCells.size > 0 ? parseCK([...selectedCells][0]) : null);
    const showInspectActions = sel.mode === 'singleCell' || sel.mode === 'singleRow' || sel.mode === 'rowOnly';
    const selectedCellTargets = getSelectedCellTargets();
    const actionTargets: VTableCellTarget[] = selectedCellTargets.length > 0 ? selectedCellTargets : contextCell ? [{ rowIndex: contextCell.row, column: contextCell.col }] : [];
    const actionColumn = actionTargets[0]?.column;
    const sameColumnActionTargets = actionColumn && actionTargets.every(target => target.column === actionColumn) ? actionTargets : null;
    const actionTargetStates = actionTargets.map(target => getEffectiveCellState(target.rowIndex, target.column));
    const allActionTargetsEditable = actionTargets.length > 0 && actionTargetStates.every(state => state.editable);
    const canSetSelectedCells = Boolean(editable && onCellsChange && sameColumnActionTargets && sameColumnActionTargets.length > 1 && allActionTargetsEditable);
    const canPasteSelection = Boolean(editable && onCellsChange && actionTargets.length > 0);
    const canSetSelectionToNull = Boolean(editable && allActionTargetsEditable && actionTargetStates.every(state => state.nullable));
    const fillSource = sameColumnActionTargets?.[0];
    const fillSourceValue = fillSource ? getDisplayRow(fillSource.rowIndex)?.rowData?.[fillSource.column] : undefined;
    const canFillDown = Boolean(
        editable &&
        onCellsChange &&
        sameColumnActionTargets &&
        sameColumnActionTargets.length > 1 &&
        allActionTargetsEditable &&
        (fillSourceValue !== null || actionTargetStates.every(state => state.nullable)),
    );
    const changedActionTargets = actionTargets.filter(target => getEffectiveCellState(target.rowIndex, target.column).changed);
    const canRevertSelection = Boolean(changedActionTargets.length > 0 && (changedActionTargets.length === 1 ? onRevertCell : onCellsRevert));
    const showEditActions = Boolean(
        actionTargets.length > 0 && (editDisabledReason || canSetSelectedCells || canPasteSelection || canSetSelectionToNull || canFillDown || canRevertSelection),
    );
    const showFilterAction = !operationsDisabled && showInspectActions;
    const openCellInspector = (row: number, col: string) => {
        const v = getDisplayRow(row)?.rowData?.[col];
        setInspectorMode?.('cell');
        setInspectorPayload?.({ row, col, value: v });
        setInspectorOpen?.(true);
    };
    const openRowInspector = (rowIndex: number) => {
        const rowData = getDisplayRow(rowIndex)?.rowData ?? {};
        onActiveRowChange?.(rowIndex);
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
            const hasPendingChanges = Boolean(isRowChanged?.(r));
            return (
                <div
                    key={key}
                    style={{ ...style, display: 'flex', alignItems: 'center' }}
                    className={cn(
                        'px-2 text-sm border-b border-r bg-card select-none cursor-pointer font-medium text-muted-foreground outline-none',
                        (isRowSelected || activeRowIndex === r) && PRIMARY_SELECTION_CLASS,
                        'focus:ring-2 focus:ring-primary/40',
                    )}
                    role="button"
                    tabIndex={0}
                    data-row-index={r}
                    onClick={e => {
                        onRowIndexClick(e, r);
                    }}
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
                    <span className="relative inline-flex items-center justify-center">
                        {r + 1}
                        {hasPendingChanges ? (
                            <span data-testid="pending-row-indicator" className="absolute -right-3 h-1.5 w-1.5 rounded-full bg-orange-500" aria-label={t('VTable.ChangedRow')} />
                        ) : null}
                    </span>
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
        const cellEditState = getEffectiveCellState(r, colKeyName);
        const isEditing = editingCell?.row === r && editingCell.col === colKeyName;
        const isRectSelectedCell = Boolean(selectedRectBounds && isCellSelected);
        const isIndependentSelectedCell = isCellSelected && !selectedRectBounds;
        const rectTopRow = selectedRectBounds?.rows[0];
        const rectBottomRow = selectedRectBounds?.rows[selectedRectBounds.rows.length - 1];
        const rectLeftCol = selectedRectBounds?.cols[0];
        const rectRightCol = selectedRectBounds?.cols[selectedRectBounds.cols.length - 1];
        const selectionEdgeShadow = isRectSelectedCell
            ? [
                  r === rectTopRow ? `inset 0 1px 0 ${SELECTION_BORDER_COLOR}` : '',
                  r === rectBottomRow ? `inset 0 -1px 0 ${SELECTION_BORDER_COLOR}` : '',
                  colKeyName === rectLeftCol ? `inset 1px 0 0 ${SELECTION_BORDER_COLOR}` : '',
                  colKeyName === rectRightCol ? `inset -1px 0 0 ${SELECTION_BORDER_COLOR}` : '',
              ]
                  .filter(Boolean)
                  .join(', ')
            : undefined;
        const cellStateShadow = isIndependentSelectedCell
            ? undefined
            : (selectionEdgeShadow ??
              (isFocused || isCellSelected
                  ? 'inset 0 0 0 1px var(--primary)'
                  : cellEditState.changed
                    ? 'inset 0 0 0 1px color-mix(in oklab, var(--color-orange-500) 50%, transparent)'
                    : undefined));

        return (
            <div
                key={key}
                role="button"
                tabIndex={0}
                data-cell={keyCell}
                data-selected={isCellSelected ? 'true' : undefined}
                data-active-row={activeRowIndex === r ? 'true' : undefined}
                data-changed={cellEditState.changed ? 'true' : undefined}
                style={{
                    ...style,
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: cellEditState.changed ? 'color-mix(in oklab, var(--color-orange-500) 15%, var(--card))' : undefined,
                    boxShadow: cellStateShadow,
                    outline: isIndependentSelectedCell ? INDEPENDENT_SELECTION_OUTLINE : undefined,
                    outlineOffset: isIndependentSelectedCell ? '-1px' : undefined,
                    zIndex: isIndependentSelectedCell ? 1 : undefined,
                }}
                className={cn(
                    'relative px-2 text-sm border-b border-r bg-card cursor-pointer outline-none select-none',
                    'min-w-0 overflow-hidden',
                    (isRowSelected || activeRowIndex === r) && PRIMARY_SELECTION_SUBTLE_CLASS,
                    isCellSelected && PRIMARY_SELECTION_CLASS,
                    cellEditState.changed && '!text-orange-700 dark:!text-orange-300',
                    isFocused && !isRectSelectedCell && !isIndependentSelectedCell && PRIMARY_SELECTION_RING_CLASS,
                    !isCellSelected && 'focus:ring-1 focus:ring-inset focus:ring-primary/40',
                )}
                onMouseDown={e => onCellMouseDown(e, r, colKeyName)}
                onMouseEnter={e => onCellMouseEnter(e, r, colKeyName)}
                onDoubleClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (cellEditState.editable) {
                        beginCellEdit(r, colKeyName);
                    } else {
                        openCellInspector(r, colKeyName);
                    }
                }}
                onKeyDown={e => onCellKeyDown(e, r, colKeyName)}
                onContextMenu={() => {
                    if (!isCellAlreadySelected(r, colKeyName)) {
                        clearAllSelections({ preserveCellAnchor: true, preserveRowAnchor: true });
                        setFocusedCell({ row: r, col: colKeyName });
                        cellAnchorRef.current = { row: r, col: colKeyName };
                        setCellAnchor(cellAnchorRef.current);
                        setSelectedCells(new Set([ck(r, colKeyName)]));
                        setSelectedRowIds(editable ? new Set() : new Set([r]));
                    }
                }}
                title={cellEditState.readOnlyReason ?? formatTooltip(cellValue)}
            >
                {isRemoteRowLoading ? (
                    <span className="block h-3 w-20 max-w-[70%] rounded-sm bg-muted" />
                ) : isEditing ? (
                    cellEditState.kind === 'boolean' ? (
                        <select
                            autoFocus
                            value={editingCell.draft}
                            className="absolute inset-0 h-full w-full min-w-0 box-border border-0 bg-transparent px-2 text-sm outline-none"
                            onMouseDown={event => event.stopPropagation()}
                            onChange={event => setEditingCell(current => (current ? { ...current, draft: event.target.value, error: null } : current))}
                            onBlur={() => {
                                if (editingCancelledRef.current) {
                                    editingCancelledRef.current = false;
                                    return;
                                }
                                commitCellEdit();
                            }}
                            onKeyDown={event => {
                                event.stopPropagation();
                                if (event.key === 'Escape') {
                                    event.preventDefault();
                                    editingCancelledRef.current = true;
                                    setEditingCell(null);
                                    gridContainerRef.current?.focus({ preventScroll: true });
                                } else if (event.key === 'Enter') {
                                    event.preventDefault();
                                    commitCellEdit();
                                } else if (event.key === 'Tab') {
                                    event.preventDefault();
                                    commitCellEdit(event.shiftKey ? 'previous' : 'next');
                                }
                            }}
                        >
                            {editingCell.draft === '' ? (
                                <option value="" disabled>
                                    NULL
                                </option>
                            ) : null}
                            <option value="true">true</option>
                            <option value="false">false</option>
                        </select>
                    ) : (
                        <input
                            ref={focusCellEditorAtEnd}
                            autoFocus
                            value={editingCell.draft}
                            type={
                                cellEditState.kind === 'date'
                                    ? /timestamp|datetime/i.test(cellEditState.meta?.type ?? '')
                                        ? 'datetime-local'
                                        : /time/i.test(cellEditState.meta?.type ?? '')
                                          ? 'time'
                                          : 'date'
                                    : 'text'
                            }
                            inputMode={cellEditState.kind === 'number' || cellEditState.kind === 'precise-number' ? 'decimal' : undefined}
                            aria-invalid={Boolean(editingCell.error)}
                            title={editingCell.error ?? undefined}
                            className={cn(
                                'absolute inset-0 h-full w-full min-w-0 box-border border-0 bg-transparent px-2 text-sm outline-none',
                                (cellEditState.kind === 'number' || cellEditState.kind === 'precise-number') && 'font-mono tabular-nums',
                                editingCell.error && 'text-destructive',
                            )}
                            onMouseDown={event => event.stopPropagation()}
                            onChange={event => setEditingCell(current => (current ? { ...current, draft: event.target.value, error: null } : current))}
                            onBlur={() => {
                                if (editingCancelledRef.current) {
                                    editingCancelledRef.current = false;
                                    return;
                                }
                                commitCellEdit();
                            }}
                            onKeyDown={event => {
                                event.stopPropagation();
                                if (event.key === 'Escape') {
                                    event.preventDefault();
                                    editingCancelledRef.current = true;
                                    setEditingCell(null);
                                    gridContainerRef.current?.focus({ preventScroll: true });
                                } else if (event.key === 'Enter') {
                                    event.preventDefault();
                                    commitCellEdit();
                                } else if (event.key === 'Tab') {
                                    event.preventDefault();
                                    commitCellEdit(event.shiftKey ? 'previous' : 'next');
                                }
                            }}
                        />
                    )
                ) : (
                    <span className={cn('block min-w-0 w-full truncate', editable && cellValue == null && 'font-mono text-xs italic text-muted-foreground')}>
                        {editable && cellValue == null ? 'NULL' : formatValue(cellValue)}
                    </span>
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
            const isRowSelected = selectedRowIds.has(row) || activeRowIndex === row;
            const isCellSelected = selectedCells.has(rawCell as CellKey);
            const isFocused = focusedCell?.row === row && focusedCell.col === col;
            const isIndependentSelectedCell = isCellSelected && !rectBounds;

            element.classList.remove(...SELECTION_CLASS_NAMES);
            if (isCellSelected) element.dataset.selected = 'true';
            else delete element.dataset.selected;
            if (isRowSelected) element.classList.add(...PRIMARY_SELECTION_SUBTLE_CLASS.split(' '));
            if (isCellSelected) element.classList.add(...PRIMARY_SELECTION_CLASS.split(' '));
            if (isFocused && !rectBounds && !isIndependentSelectedCell) element.classList.add(...PRIMARY_SELECTION_RING_CLASS.split(' '));

            // A non-rectangular selection is rendered as individual cells. Give each
            // one its own elevated outline so neighbouring virtualized cells cannot
            // paint their grid border over part of the selection.
            element.style.outline = isIndependentSelectedCell ? INDEPENDENT_SELECTION_OUTLINE : '';
            element.style.outlineOffset = isIndependentSelectedCell ? '-1px' : '';
            element.style.zIndex = isIndependentSelectedCell ? '1' : '';

            element.style.boxShadow =
                rectBounds && isCellSelected
                    ? [
                          row === rectTopRow ? `inset 0 1px 0 ${SELECTION_BORDER_COLOR}` : '',
                          row === rectBottomRow ? `inset 0 -1px 0 ${SELECTION_BORDER_COLOR}` : '',
                          col === rectLeftCol ? `inset 1px 0 0 ${SELECTION_BORDER_COLOR}` : '',
                          col === rectRightCol ? `inset -1px 0 0 ${SELECTION_BORDER_COLOR}` : '',
                      ]
                          .filter(Boolean)
                          .join(', ')
                    : isIndependentSelectedCell
                      ? ''
                      : isFocused || isCellSelected
                        ? 'inset 0 0 0 1px var(--primary)'
                        : element.dataset.changed === 'true'
                          ? 'inset 0 0 0 1px color-mix(in oklab, var(--color-orange-500) 50%, transparent)'
                          : '';
        });

        container.querySelectorAll<HTMLElement>('[data-row-index]').forEach(element => {
            const rowIndex = Number(element.dataset.rowIndex);
            element.classList.remove(...PRIMARY_SELECTION_CLASS.split(' '));
            if (selectedRowIds.has(rowIndex) || activeRowIndex === rowIndex) element.classList.add(...PRIMARY_SELECTION_CLASS.split(' '));
        });
    }, [activeRowIndex, focusedCell, getSelectedRectBounds, selectedCells, selectedRowIds]);

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
                <div className="w-full h-full border overflow-hidden flex flex-col bg-card" data-testid="vtable-surface">
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
                    <div ref={gridContainerRef} className="flex-1 min-h-0 outline-none" tabIndex={0} onKeyDown={onGridKeyDown} onPaste={handleGridPaste}>
                        {gridElement}
                    </div>
                </div>
            </ContextMenuTrigger>

            <ContextMenuContent className="w-60">
                {showInspectActions ? (
                    <ContextMenuGroup>
                        {sel.mode === 'singleCell' ? (
                            <ContextMenuItem
                                onSelect={() => {
                                    openCellInspector(sel.cell.row, sel.cell.col);
                                }}
                            >
                                {editable ? t('VTable.Context.OpenCellInspector') : t('VTable.Context.ViewCell')}
                            </ContextMenuItem>
                        ) : null}
                        <ContextMenuItem
                            onSelect={() => {
                                openRowInspector(sel.mode === 'singleCell' ? sel.cell.row : sel.row);
                            }}
                        >
                            {editable ? t('VTable.Context.EditRow') : t('VTable.Context.ViewRowDetails')}
                        </ContextMenuItem>
                    </ContextMenuGroup>
                ) : null}

                {showEditActions ? (
                    <>
                        {showInspectActions ? <ContextMenuSeparator /> : null}
                        <ContextMenuGroup>
                            {actionTargets.length > 1 || editDisabledReason ? (
                                <ContextMenuItemWithReason
                                    disabled={!canSetSelectedCells}
                                    disabledReason={!canSetSelectedCells ? editDisabledReason : undefined}
                                    onSelect={() => {
                                        const anchor =
                                            sameColumnActionTargets?.find(target => target.rowIndex === contextCell?.row && target.column === contextCell.col) ??
                                            sameColumnActionTargets?.[0];
                                        if (!anchor || !sameColumnActionTargets) return;
                                        beginCellEdit(anchor.rowIndex, anchor.column, '', sameColumnActionTargets);
                                    }}
                                >
                                    {t('VTable.Context.SetSelectedCells', { count: actionTargets.length })}
                                </ContextMenuItemWithReason>
                            ) : null}
                            <ContextMenuItemWithReason
                                disabled={!canPasteSelection}
                                disabledReason={!canPasteSelection ? editDisabledReason : undefined}
                                onSelect={async event => {
                                    event.stopPropagation();
                                    try {
                                        if (!navigator.clipboard?.readText) throw new Error('clipboard unavailable');
                                        applyClipboardText(await navigator.clipboard.readText());
                                    } catch {
                                        toast.error(t('VTable.Bulk.ClipboardPermission'));
                                    }
                                }}
                            >
                                {t('VTable.Context.Paste')}
                            </ContextMenuItemWithReason>
                            {actionTargets.length > 1 || editDisabledReason ? (
                                <ContextMenuItemWithReason
                                    disabled={!canFillDown}
                                    disabledReason={!canFillDown ? editDisabledReason : undefined}
                                    onSelect={() => {
                                        if (!sameColumnActionTargets || !fillSource) return;
                                        applyBatchChanges(
                                            sameColumnActionTargets.map(target => ({
                                                ...target,
                                                originalValue: getDisplayRow(target.rowIndex)?.rowData?.[target.column],
                                                nextValue: fillSourceValue,
                                            })),
                                        );
                                    }}
                                >
                                    {t('VTable.Context.FillDown')}
                                </ContextMenuItemWithReason>
                            ) : null}
                            <ContextMenuItemWithReason
                                disabled={!canSetSelectionToNull}
                                disabledReason={!canSetSelectionToNull ? editDisabledReason : undefined}
                                onSelect={() => {
                                    applyBatchChanges(
                                        actionTargets.map(target => ({
                                            ...target,
                                            originalValue: getDisplayRow(target.rowIndex)?.rowData?.[target.column],
                                            nextValue: null,
                                        })),
                                    );
                                }}
                            >
                                {actionTargets.length > 1 ? t('VTable.Context.SetSelectionToNull') : t('VTable.Context.SetToNull')}
                            </ContextMenuItemWithReason>
                            <ContextMenuItemWithReason
                                disabled={!canRevertSelection}
                                disabledReason={!canRevertSelection ? editDisabledReason : undefined}
                                onSelect={() => {
                                    if (changedActionTargets.length === 1) {
                                        const [target] = changedActionTargets;
                                        if (target) onRevertCell?.(target.rowIndex, target.column);
                                        return;
                                    }
                                    const result = onCellsRevert?.(changedActionTargets);
                                    if (!result) return;
                                    if (!result.ok) {
                                        toast.error(result.error);
                                    } else {
                                        if (result.changedCellCount > 0) {
                                            toast.success(t('VTable.Bulk.Reverted', { cells: result.changedCellCount, rows: result.affectedRowCount }));
                                        }
                                    }
                                }}
                            >
                                {actionTargets.length > 1 ? t('VTable.Context.RevertSelection') : t('VTable.Context.RevertCell')}
                            </ContextMenuItemWithReason>
                        </ContextMenuGroup>
                    </>
                ) : null}

                {showInspectActions || showEditActions ? <ContextMenuSeparator /> : null}
                <ContextMenuGroup>
                    <ContextMenuItem
                        disabled={!hasAnySelection}
                        onSelect={async e => {
                            e.stopPropagation();
                            await copySelectedCellsTSV();
                        }}
                    >
                        {sel.mode === 'singleCell' ? t('VTable.Context.CopyValue') : t('VTable.Context.Copy')}
                    </ContextMenuItem>
                    {contextCell ? (
                        <ContextMenuItem
                            onSelect={async e => {
                                e.stopPropagation();
                                const row = getDisplayRow(contextCell.row)?.rowData ?? {};
                                await copyText(JSON.stringify(row, null, 2));
                            }}
                        >
                            {t('VTable.Context.CopyRowAsJson')}
                        </ContextMenuItem>
                    ) : null}
                    <ContextMenuItem
                        onSelect={async e => {
                            e.stopPropagation();
                            await copySelectedCellsTSVWithHeader();
                        }}
                        disabled={!hasAnySelection}
                    >
                        {t('VTable.Context.CopyWithHeaders')}
                    </ContextMenuItem>
                </ContextMenuGroup>

                <ContextMenuSeparator />
                <ContextMenuGroup>
                    {showFilterAction ? (
                        <ContextMenuItem
                            onSelect={e => {
                                e.stopPropagation();
                                const cell = focusedCell ?? (selectedCells.size > 0 ? parseCK([...selectedCells][0]) : null);
                                if (!cell) return;
                                applyQuickEqualsFilterForCell(cell.row, cell.col);
                            }}
                        >
                            {t('VTable.Context.FilterByValue')}
                        </ContextMenuItem>
                    ) : null}
                    <ContextMenuItem
                        disabled={!hasAnySelection}
                        onSelect={e => {
                            e.stopPropagation();
                            downloadSelectionAsCSV(true);
                        }}
                    >
                        {t('VTable.Context.DownloadCsv')}
                    </ContextMenuItem>
                </ContextMenuGroup>
            </ContextMenuContent>
        </ContextMenu>
    );
}
