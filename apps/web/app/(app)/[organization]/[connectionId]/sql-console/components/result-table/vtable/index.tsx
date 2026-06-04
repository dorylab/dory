'use client';
import { cn } from '@dory/web-utils';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
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
const INITIAL_VISIBLE_ROW_COUNT = 24;
const HEADER_TEXT_PAD = 44;
const CELL_TEXT_PAD = 18;
const FALLBACK_CHAR_WIDTH = 8;
const PRIMARY_SELECTION_CLASS = 'bg-primary/10 text-foreground';
const PRIMARY_SELECTION_SUBTLE_CLASS = 'bg-primary/6 text-foreground';
const PRIMARY_SELECTION_SOFT_CLASS = 'bg-primary/8 text-foreground';
const PRIMARY_SELECTION_RING_CLASS = 'ring-1 ring-inset ring-primary/40';

function areNumberArraysEqual(left: number[] | undefined, right: number[] | undefined) {
    if (left === right) return true;
    if (!left || !right) return !left && !right;
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function areSortStatesEqual(
    left: { column: string; direction: 'asc' | 'desc' } | null | undefined,
    right: { column: string; direction: 'asc' | 'desc' } | null | undefined,
) {
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
    showFiltersBar = true,
    initialSort = null,
    selectedRowIndexes,
    onSortChange,
    onSelectedRowIndexesChange,
}: VTableProps) {
    if (!results || results.length === 0) return null;
    const t = useTranslations('SqlConsole');
    const metas = useAtomValue(currentSessionMetaAtom);
    const columnsRaw: any = metas?.columns;
    const columns = useMemo(() => (columnsRaw ?? []).map((c: any) => c?.name), [columnsRaw]);

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
        (col: string, rows: VTableProps['results'], rowIndices: number[]) => {
            const fontFamily = typeof document === 'undefined' ? 'system-ui, sans-serif' : getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
            const headerWidth = measureTextWidth(col, `700 14px ${fontFamily}`) + HEADER_TEXT_PAD;

            let maxCellWidth = 0;
            for (const rowIndex of rowIndices) {
                const cellValue = rows[rowIndex]?.rowData?.[col];
                const text = formatTooltip(cellValue);
                maxCellWidth = Math.max(maxCellWidth, measureTextWidth(text, `400 14px ${fontFamily}`) + CELL_TEXT_PAD);
            }

            return clampColumnWidth(col, Math.max(headerWidth, maxCellWidth, defaultColMinWidth));
        },
        [clampColumnWidth, defaultColMinWidth, measureTextWidth],
    );

    const internalFilters = useVTableFilters({ results, storageKey });
    const usesExternalFilters = !!(externalActiveFilters && onUpsertExternalFilter && onRemoveExternalFilter && onClearAllExternalFilters);
    const activeFilters = usesExternalFilters ? externalActiveFilters : internalFilters.activeFilters;
    const filteredResults = usesExternalFilters ? results : internalFilters.filteredResults;
    const setColumnFilter = usesExternalFilters ? onUpsertExternalFilter : internalFilters.setColumnFilter;
    const removeFilter = usesExternalFilters ? onRemoveExternalFilter : internalFilters.removeFilter;
    const clearAllFilters = usesExternalFilters ? onClearAllExternalFilters : internalFilters.clearAllFilters;
    const {
        getColumnFilter,
        getColumnFilterPopoverProps,
    } = useVTableFilterUi({
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

    const [sortBy, setSortBy] = useState<string | null>(initialSort?.column ?? null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialSort?.direction ?? 'asc');
    const lastEmittedSortRef = useRef<{ column: string; direction: 'asc' | 'desc' } | null>(initialSort ?? null);
    const sortedResults = useMemo(() => {
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
    }, [filteredResults, sortBy, sortDirection, numericColumns]);

    const getVisibleSampleRowIndices = useCallback(
        (range?: { start: number; stop: number }) => {
            if (sortedResults.length === 0) return [];

            const sourceRange = range ?? {
                start: 0,
                stop: Math.max(0, Math.min(sortedResults.length - 1, INITIAL_VISIBLE_ROW_COUNT - 1)),
            };

            const start = Math.max(0, sourceRange.start - VISIBLE_AUTO_FIT_ROW_BUFFER);
            const stop = Math.min(sortedResults.length - 1, sourceRange.stop + VISIBLE_AUTO_FIT_ROW_BUFFER);
            return getSampleRowIndices(start, stop, VISIBLE_AUTO_FIT_SAMPLE_LIMIT);
        },
        [sortedResults.length],
    );

    const initialVisibleSampleRowIndices = useMemo(() => getVisibleSampleRowIndices(), [getVisibleSampleRowIndices]);

    useEffect(() => {
        let disposed = false;

        const updateAutoWidths = () => {
            if (disposed) return;

            setAutoColWidths(prev => {
                const next: ColWidths = {};
                for (const col of columns) {
                    next[col] = measureColumnWidth(col, sortedResults, initialVisibleSampleRowIndices);
                }

                const prevKeys = Object.keys(prev);
                const nextKeys = Object.keys(next);
                if (prevKeys.length === nextKeys.length && nextKeys.every(key => prev[key] === next[key])) {
                    return prev;
                }

                return next;
            });
        };

        updateAutoWidths();

        if (typeof document !== 'undefined' && 'fonts' in document) {
            document.fonts.ready.then(() => {
                updateAutoWidths();
            });
        }

        return () => {
            disposed = true;
        };
    }, [columns, initialVisibleSampleRowIndices, measureColumnWidth, sortedResults]);

    useEffect(() => {
        visibleRowRangeRef.current = {
            start: 0,
            stop: Math.min(Math.max(0, sortedResults.length - 1), Math.max(0, INITIAL_VISIBLE_ROW_COUNT - 1)),
        };
    }, [sortedResults]);

    const colWidths = useMemo(() => {
        const next: ColWidths = {};
        for (const col of columns) {
            next[col] = clampColumnWidth(col, manualColWidths[col] ?? autoColWidths[col] ?? defaultColMinWidth);
        }
        return next;
    }, [autoColWidths, clampColumnWidth, columns, defaultColMinWidth, manualColWidths]);

    useEffect(() => {
        onStatsChange?.({
            filteredCount: sortedResults.length,
        });
    }, [onStatsChange, sortedResults.length, results]);

    useEffect(() => {
        if (areSortStatesEqual(lastEmittedSortRef.current, initialSort)) {
            return;
        }

        if (!initialSort) {
            if (sortBy !== null) {
                setSortBy(null);
                setSortDirection('asc');
            }
            lastEmittedSortRef.current = null;
            return;
        }

        if (sortBy !== initialSort.column) {
            setSortBy(initialSort.column);
        }
        if (sortDirection !== initialSort.direction) {
            setSortDirection(initialSort.direction);
        }
        lastEmittedSortRef.current = initialSort;
    }, [initialSort, sortBy, sortDirection]);

    const handleSort = useCallback(
        (col: string) => {
            if (sortBy === col) setSortDirection(p => (p === 'asc' ? 'desc' : 'asc'));
            else {
                setSortBy(col);
                setSortDirection('asc');
            }
        },
        [sortBy],
    );

    const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(() => new Set(selectedRowIndexes ?? []));
    const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
    const [selectedCells, setSelectedCells] = useState<Set<CellKey>>(new Set());
    const [cellAnchor, setCellAnchor] = useState<{ row: number; col: string } | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRowIndexes]);

    useEffect(() => {
        const nextSort = sortBy ? { column: sortBy, direction: sortDirection } : null;
        if (areSortStatesEqual(lastEmittedSortRef.current, nextSort)) {
            return;
        }
        lastEmittedSortRef.current = nextSort;
        onSortChange?.(nextSort);
    }, [onSortChange, sortBy, sortDirection]);

    useEffect(() => {
        const nextRows = [...selectedRowIds].sort((left, right) => left - right);
        if (areNumberArraysEqual(lastEmittedSelectedRowsRef.current, nextRows)) {
            return;
        }
        lastEmittedSelectedRowsRef.current = nextRows;
        onSelectedRowIndexesChange?.(nextRows);
    }, [onSelectedRowIndexesChange, selectedRowIds]);

    const syncHeaderHorizontalScroll = useCallback((deltaX: number) => {
        const grid = gridRef.current as
            | (MultiGrid & {
                  _topRightGrid?: {
                      _scrollingContainer?: HTMLElement;
                      handleScrollEvent?: (position: { scrollLeft: number; scrollTop: number }) => void;
                  };
                  _bottomRightGrid?: {
                      _scrollingContainer?: HTMLElement;
                      handleScrollEvent?: (position: { scrollLeft: number; scrollTop: number }) => void;
                  };
              })
            | null;

        const topRightGrid = grid?._topRightGrid;
        const bottomRightGrid = grid?._bottomRightGrid;
        const topRightContainer = topRightGrid?._scrollingContainer;
        const bottomRightContainer = bottomRightGrid?._scrollingContainer;
        const currentScrollLeft = bottomRightContainer?.scrollLeft ?? topRightContainer?.scrollLeft ?? 0;
        const maxScrollLeft = Math.max(0, (bottomRightContainer?.scrollWidth ?? topRightContainer?.scrollWidth ?? 0) - (bottomRightContainer?.clientWidth ?? topRightContainer?.clientWidth ?? 0));
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
        let sum = indexColWidth;
        for (const c of columns) sum += Math.max((colWidths[c] ?? defaultColMinWidth) + HEADER_PAD, 60);
        return sum;
    }, [columns, colWidths, indexColWidth, defaultColMinWidth]);

    const dragState = useRef<{ col: string; startX: number; startW: number } | null>(null);
    const recomputeAll = () => {
        const g: any = gridRef.current;
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
        const finalW = measureColumnWidth(col, sortedResults, rowIndices);
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

    const getSelectedRectBounds = (sel: Set<CellKey>) => {
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
    };
    const getSelectionAsRowsCols = () => {
        const rect = getSelectedRectBounds(selectedCells);
        if (rect) {
            const { rows, cols } = rect;
            const rows2D = rows.map(r =>
                cols.map(c => {
                    const v = sortedResults[r]?.rowData?.[c];
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
                    const v = has ? sortedResults[r]?.rowData?.[c] : '';
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
                    const v = sortedResults[r]?.rowData?.[c];
                    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                }),
            );
            return { rows, cols, rows2D };
        }
        return null;
    };
    const selectedRectBounds = useMemo(() => getSelectedRectBounds(selectedCells), [columns, selectedCells]);
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
        columns.forEach((c: any, i: number) => colIndex.set(c, i));
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
                        const row = sortedResults[i]?.rowData ?? {};
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
                const v = sortedResults[rowIndex]?.rowData?.[col];
                await copyText(typeof v === 'object' ? JSON.stringify(v) : v == null ? '' : String(v));
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
        const v = sortedResults[row]?.rowData?.[col];
        setInspectorMode?.('cell');
        setInspectorPayload?.({ row, col, value: v });
        setInspectorOpen?.(true);
    };
    const openRowInspector = (rowIndex: number) => {
        const rowData = sortedResults[rowIndex]?.rowData ?? {};
        setInspectorMode?.('row');
        setInspectorPayload?.({ row: rowIndex, rowData });
        setInspectorOpen?.(true);
    };
    const applyQuickEqualsFilterForCell = useCallback(
        (rowIndex: number, colName: string) => {
            const colMeta = (columnsRaw ?? []).find((c: any) => c?.name === colName);
            const cellVal = sortedResults[rowIndex]?.rowData?.[colName];
            setColumnFilter(buildEqualsFilterFromCell({ colName, colType: colMeta?.type, raw: cellVal }));
        },
        [columnsRaw, setColumnFilter, sortedResults],
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
                    className={cn(
                        'relative px-2 py-1 border-b border-r bg-muted text-sm font-bold select-none whitespace-nowrap',
                        existing && PRIMARY_SELECTION_SOFT_CLASS,
                    )}
                >
                    <button type="button" className="flex flex-1 text-left cursor-pointer min-w-0 overflow-hidden whitespace-nowrap" onClick={() => handleSort(col)}>
                        <span className="truncate block min-w-0">{col}</span>
                        {isSorted && <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </button>

                    <ColumnFilterPopover {...getColumnFilterPopoverProps(col)} />

                    
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
                        'px-2 text-sm border-b border-r select-none cursor-pointer font-medium text-muted-foreground outline-none',
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
        const isRowSelected = selectedRowIds.has(r);
        const isCellSelected = selectedCells.has(keyCell);
        const isFocused = focusedCell?.row === r && focusedCell?.col === colKeyName;
        const cellValue = sortedResults[r]?.rowData?.[colKeyName];
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
                data-cell={`${r}-${colKeyName}`}
                style={{ ...style, display: 'flex', alignItems: 'center', boxShadow: selectionEdgeShadow }}
                className={cn(
                    'px-2 text-sm border-b border-r cursor-pointer outline-none select-none',
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
                <span className="block truncate min-w-0 w-full">{formatValue(cellValue)}</span>
            </div>
        );
    };

    useEffect(() => {
        const g: any = gridRef.current;
        g?.recomputeGridSize?.();
        g?.forceUpdateGrids?.();
    }, [colWidths, totalWidth]);

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
    }, [syncHeaderHorizontalScroll, columns.length, sortedResults.length]);

    // const clearQuery = () => setGlobalQuery('');

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div className="w-full h-full border overflow-hidden flex flex-col">
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
                    <div ref={gridContainerRef} className="flex-1 min-h-0">
                        <AutoSizer>
                            {({ width, height }) => (
                                <MultiGrid
                                    ref={ref => {
                                        gridRef.current = (ref as any) || null;
                                    }}
                                    onSectionRendered={({ rowStartIndex, rowStopIndex }) => {
                                        const nextStart = Math.max(0, rowStartIndex - 1);
                                        const nextStop = Math.max(nextStart, rowStopIndex - 1);
                                        visibleRowRangeRef.current = { start: nextStart, stop: nextStop };
                                    }}
                                    width={width}
                                    height={height}
                                    columnCount={columns.length + 1}
                                    rowCount={sortedResults.length + 1}
                                    fixedRowCount={1}
                                    fixedColumnCount={1}
                                    overscanRowCount={10}
                                    overscanColumnCount={2}
                                    enableFixedColumnScroll
                                    enableFixedRowScroll
                                    scrollToAlignment="start"
                                    columnWidth={({ index }) => {
                                        if (index === 0) return indexColWidth;
                                        const col = columns[index - 1];
                                        const base = Math.max(colWidths[col] ?? defaultColMinWidth, 60);
                                        return base + HEADER_PAD; 
                                    }}
                                    rowHeight={({ index }) => (index === 0 ? Math.max(rowHeight, 32) : rowHeight)}
                                    cellRenderer={cellRenderer as MultiGridProps['cellRenderer']}
                                    classNameTopLeftGrid="bg-muted"
                                    classNameTopRightGrid="bg-muted"
                                    classNameBottomLeftGrid=""
                                    classNameBottomRightGrid=""
                                    hideTopRightGridScrollbar
                                    hideBottomLeftGridScrollbar
                                    styleTopRightGrid={{ overflowX: 'hidden', overflowY: 'hidden' }}
                                    styleBottomLeftGrid={{ overflowY: 'hidden', overflowX: 'hidden' }}
                                    styleTopLeftGrid={{ overflow: 'hidden' }}
                                    styleBottomRightGrid={{ overflowY: 'auto', overflowX: 'auto' }}
                                    style={{ outline: 'none' }}
                                />
                            )}
                        </AutoSizer>
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
                {(sel.mode === 'singleCell' || sel.mode === 'rowOnly' || sel.mode === 'singleRow') && (
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
