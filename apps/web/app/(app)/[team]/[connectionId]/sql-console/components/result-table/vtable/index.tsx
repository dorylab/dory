'use client';
import { cn } from '@/lib/utils';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { GridCellProps, AutoSizer, MultiGrid, MultiGridProps } from 'react-virtualized';
import { ColumnFilterPopover } from './ColumnFIlter';
// import { VTableSearchBar } from '../components/TableSearchBar';
import { VTableProps, ColWidths, StrOp, NumOp, CellKey, ck, parseCK, ColumnFilter } from './type';
import { formatTooltip, formatValue } from './utils';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/registry/new-york-v4/ui/context-menu';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Filter, X } from 'lucide-react';
import { useAtomValue } from 'jotai';
import { currentSessionMetaAtom } from '../stores/result-table.atoms';
import { buildEqualsFilterFromCell } from './filter';
import { useTranslations } from 'next-intl';

const HEADER_PAD = 24; 

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
}: VTableProps) {
    if (!results || results.length === 0) return null;
    const t = useTranslations('SqlConsole');
    const metas = useAtomValue(currentSessionMetaAtom);
    const columnsRaw: any = metas?.columns;
    const columns = useMemo(() => (columnsRaw ?? []).map((c: any) => c?.name), [columnsRaw]);

    
    const filterBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

    
    const [tagFilterAnchor, setTagFilterAnchor] = useState<HTMLElement | null>(null);
    const [tagFilterCol, setTagFilterCol] = useState<string | null>(null);
    const [tagOpenSig, setTagOpenSig] = useState(0);

    const [colWidths, setColWidths] = useState<ColWidths>(() => {
        if (typeof window !== 'undefined' && storageKey) {
            try {
                const raw = localStorage.getItem(`${storageKey}:colWidths`);
                if (raw) return JSON.parse(raw) as ColWidths;
            } catch {}
        }
        const init: ColWidths = {};
        for (const c of columns) init[c] = Math.max(defaultColMinWidth, 60);
        return init;
    });
    useEffect(() => {
        setColWidths(prev => {
            const next: ColWidths = {};
            for (const c of columns) next[c] = prev[c] ?? Math.max(defaultColMinWidth, 60);
            return next;
        });
    }, [columns, defaultColMinWidth]);
    useEffect(() => {
        if (!storageKey) return;
        try {
            localStorage.setItem(`${storageKey}:colWidths`, JSON.stringify(colWidths));
        } catch {}
    }, [colWidths, storageKey]);

    const [activeFilters, setActiveFilters] = useState<ColumnFilter[]>(() => {
        if (typeof window !== 'undefined' && storageKey) {
            try {
                const raw = localStorage.getItem(`${storageKey}:filters`);
                if (raw) return JSON.parse(raw) as ColumnFilter[];
            } catch {}
        }
        return [];
    });
    useEffect(() => {
        if (!storageKey) return;
        try {
            localStorage.setItem(`${storageKey}:filters`, JSON.stringify(activeFilters));
        } catch {}
    }, [activeFilters, storageKey]);

    const testString = (raw: any, op: StrOp, val?: string, cs?: boolean) => {
        const s = raw == null ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
        const t = val ?? '';
        const a = cs ? s : s.toLowerCase();
        const b = cs ? t : t.toLowerCase();
        switch (op) {
            case 'contains':
                return a.includes(b);
            case 'equals':
                return a === b;
            case 'startsWith':
                return a.startsWith(b);
            case 'endsWith':
                return a.endsWith(b);
            case 'empty':
                return a.length === 0;
            case 'notEmpty':
                return a.length > 0;
            case 'regex':
                try {
                    const re = new RegExp(val ?? '', cs ? '' : 'i');
                    return re.test(s);
                } catch {
                    return false;
                }
        }
    };
    const testNumber = (raw: any, op: NumOp, val?: string) => {
        const n = typeof raw === 'number' ? raw : Number(raw);
        const m = Number(val);
        if (Number.isNaN(n)) return false;
        switch (op) {
            case 'eq':
                return n === m;
            case 'ne':
                return n !== m;
            case 'gt':
                return n > m;
            case 'ge':
                return n >= m;
            case 'lt':
                return n < m;
            case 'le':
                return n <= m;
        }
    };

    const filteredResults = useMemo(() => {
        const filters = activeFilters;
        if (filters.length === 0) return results;

        return results.filter(row => {
            for (const f of filters) {
                const raw = row.rowData?.[f.col];
                if (f.kind === 'string') {
                    if (!testString(raw, f.op as StrOp, f.value, f.caseSensitive)) return false;
                } else {
                    if (!testNumber(raw, f.op as NumOp, f.value)) return false;
                }
            }
            return true;
        });
    }, [results, columns, activeFilters]);

    const [sortBy, setSortBy] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const sortedResults = useMemo(() => {
        if (!sortBy) return filteredResults;
        const sorted = [...filteredResults].sort((a, b) => {
            const aVal = a.rowData[sortBy];
            const bVal = b.rowData[sortBy];
            if (aVal === bVal) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }
            return sortDirection === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
        });
        return sorted;
    }, [filteredResults, sortBy, sortDirection]);

    useEffect(() => {
        onStatsChange?.({
            filteredCount: sortedResults.length,
        });
    }, [
        onStatsChange,
        sortedResults.length,
        results,
    ]);

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

    const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
    const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
    const [selectedCells, setSelectedCells] = useState<Set<CellKey>>(new Set());
    const [cellAnchor, setCellAnchor] = useState<{ row: number; col: string } | null>(null);
    const [focusedCell, setFocusedCell] = useState<{ row: number; col: string } | null>(null);
    const hasAnySelection = selectedCells.size > 0 || selectedRowIds.size > 0;

    const selectionAnchorRef = useRef<number | null>(null);
    const cellAnchorRef = useRef<{ row: number; col: string } | null>(null);
    const draggingRef = useRef(false);
    const lastMouseDownWasOnCell = useRef(false);

    const gridRef = useRef<MultiGrid | null>(null);
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
            const minW = colMinWidthMap?.[col] ?? defaultColMinWidth;
            const maxW = colMaxWidthMap?.[col] ?? 1200;
            const nextW = Math.max(Math.min(ds.startW + delta, maxW), Math.max(minW, 60));
            setColWidths(prev => ({ ...prev, [col]: nextW }));
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
        const header = String(col).length;
        const probeCount = 50;
        let maxChars = header;
        for (let i = 0; i < Math.min(sortedResults.length, probeCount); i++) {
            const v = sortedResults[i]?.rowData?.[col];
            const s = typeof v === 'object' ? JSON.stringify(v) : v == null ? '' : String(v);
            maxChars = Math.max(maxChars, s.length);
        }
        const estimated = Math.round(maxChars * 7.5) + 24;
        const minW = colMinWidthMap?.[col] ?? defaultColMinWidth;
        const maxW = colMaxWidthMap?.[col] ?? 1200;
        const finalW = Math.max(Math.min(estimated, maxW), Math.max(minW, 60));
        setColWidths(prev => ({ ...prev, [col]: finalW }));
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

    const [filterDraft, setFilterDraft] = useState<{ col: string; kind: 'string' | 'number'; op: StrOp | NumOp; value?: string; cs: boolean }>({
        col: '',
        kind: 'string',
        op: 'contains',
        value: '',
        cs: false,
    });
    const applyFilterDraft = () => {
        const { col, kind, op, value, cs } = filterDraft;
        if (!col) return;
        setActiveFilters(prev => {
            const others = prev.filter(f => f.col !== col);
            const next: ColumnFilter = { col, kind, op, value: value ?? '', caseSensitive: cs };
            return [...others, next];
        });
    };
    const applyQuickEqualsFilterForCell = useCallback(
        (rowIndex: number, colName: string) => {
            const colMeta = (columnsRaw ?? []).find((c: any) => c?.name === colName);
            const cellVal = sortedResults[rowIndex]?.rowData?.[colName];
            const f = buildEqualsFilterFromCell({ colName, colType: colMeta?.type, raw: cellVal });
            setActiveFilters(prev => {
                const others = prev.filter(x => x.col !== colName);
                return [...others, f];
            });
        },
        [columnsRaw, sortedResults, setActiveFilters],
    );
    const removeFilter = (col: string) => setActiveFilters(prev => prev.filter(f => f.col !== col));
    const clearAllFilters = () => setActiveFilters([]);

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
            const existing = activeFilters.find(f => f.col === col);
            return (
                <div
                    key={key}
                    style={{ ...style, display: 'flex', alignItems: 'center' }}
                    className={cn('relative px-2 py-1 border-b border-r bg-muted text-sm font-bold select-none whitespace-nowrap', existing && 'bg-[--sidebar-accent]/30')}
                >
                    <button type="button" className="flex flex-1 text-left cursor-pointer min-w-0 overflow-hidden whitespace-nowrap" onClick={() => handleSort(col)}>
                        <span className="truncate block min-w-0">{col}</span>
                        {isSorted && <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </button>

                    <ColumnFilterPopover
                        ref={el => {
                            if (el) filterBtnRefs.current.set(col, el);
                            else filterBtnRefs.current.delete(col);
                        }}
                        column={col}
                        columns={columnsRaw}
                        draft={filterDraft}
                        setDraft={updater => setFilterDraft(p => ({ ...(typeof updater === 'function' ? (updater as any)(p) : updater) }))}
                        existing={existing}
                        onApply={applyFilterDraft}
                        onRemove={removeFilter}
                    />

                    
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
                        isRowSelected && 'bg-muted',
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

        return (
            <div
                key={key}
                role="button"
                tabIndex={0}
                data-cell={`${r}-${colKeyName}`}
                style={{ ...style, display: 'flex', alignItems: 'center' }}
                className={cn(
                    'px-2 text-sm border-b border-r last:border-r-0 cursor-pointer outline-none select-none',
                    'min-w-0 overflow-hidden',
                    isRowSelected && 'bg-muted',
                    isCellSelected && 'bg-accent/40',
                    isFocused && 'ring-2 ring-primary/40',
                    'focus:ring-2 focus:ring-primary/40',
                )}
                onMouseDown={e => onCellMouseDown(e, r, colKeyName)}
                onMouseEnter={e => onCellMouseEnter(e, r, colKeyName)}
                onKeyDown={e => onCellKeyDown(e, r, colKeyName)}
                onContextMenu={e => {
                    
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

    // const clearQuery = () => setGlobalQuery('');

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div className="w-full h-full border overflow-hidden flex flex-col">
                    
                    {activeFilters.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-2 py-1 border-b bg-muted/30 justify-between items-center">
                            <div className="flex flex-wrap gap-2">
                                {activeFilters.map(f => (
                                    <Badge
                                        key={f.col}
                                        variant="secondary"
                                        className="gap-1 cursor-pointer"
                                        onClick={e => {
                                            
                                            setFilterDraft(p => ({
                                                ...p,
                                                col: f.col,
                                                kind: f.kind === 'number' ? 'number' : 'string',
                                                op: f.op as any,
                                                value: f.value ?? '',
                                                cs: !!f.caseSensitive,
                                            }));
                                            
                                            setTagFilterAnchor(e.currentTarget as HTMLElement);
                                            setTagFilterCol(f.col);
                                            setTagOpenSig(s => s + 1);
                                        }}
                                        title={t('VTable.Filter.EditHint')}
                                    >
                                        <Filter className="h-3 w-3" />
                                        <span className="max-w-48 truncate">{f.col}</span>
                                        <span className="opacity-70">
                                            {String(f.op)}
                                            {f.value ? `:${f.value}` : ''}
                                            {f.kind === 'string' && f.caseSensitive ? t('VTable.Filter.CaseSensitiveSuffix') : ''}
                                        </span>
                                        <button
                                            className="ml-1 opacity-70 hover:opacity-100"
                                            onClick={e => {
                                                e.stopPropagation();
                                                removeFilter(f.col);
                                            }}
                                            aria-label={t('VTable.Filter.RemoveAria')}
                                            title={t('VTable.Filter.RemoveTitle')}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                            <button
                                className={cn('text-xs px-2 py-1 rounded border cursor-pointer transition-colors', 'hover:bg-accent')}
                                onClick={activeFilters.length > 0 ? clearAllFilters : undefined}
                            >
                                {t('VTable.Filter.ClearAll')}
                            </button>
                        </div>
                    )}

                    
                    {tagFilterCol && (
                        <ColumnFilterPopover
                            column={tagFilterCol}
                            columns={columnsRaw}
                            draft={filterDraft}
                            setDraft={setFilterDraft}
                            existing={activeFilters.find(f => f.col === tagFilterCol)}
                            onApply={() => {
                                applyFilterDraft();
                                setTagFilterAnchor(null);
                                setTagFilterCol(null);
                            }}
                            onRemove={col => {
                                removeFilter(col);
                                setTagFilterAnchor(null);
                                setTagFilterCol(null);
                            }}
                            externalAnchor={tagFilterAnchor}
                            externalOpenSignal={tagOpenSig}
                        />
                    )}

                    {/* Grid */}
                    <div className="flex-1 min-h-0">
                        <AutoSizer>
                            {({ width, height }) => (
                                <MultiGrid
                                    ref={ref => {
                                        gridRef.current = (ref as any) || null;
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
