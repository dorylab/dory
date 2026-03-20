'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { ColumnFilterPopover } from './ColumnFIlter';
import { ColumnFilter, NumOp, StrOp } from './type';

type ResultRow = { rowData: Record<string, any> };

type FilterDraft = {
    col: string;
    kind: 'string' | 'number';
    op: StrOp | NumOp;
    value?: string;
    cs: boolean;
};

type ColumnMeta = { name: string; type?: string | null };
type PopoverColumnMeta = { name: string; type: string };
const MAX_VISIBLE_FILTERS = 3;

function formatFilterSummary(filter: ColumnFilter, t: (key: string) => string) {
    if (filter.label) {
        return `${filter.col} = ${filter.label}`;
    }
    const value = filter.value ? ` = ${filter.value}` : '';
    const caseSensitive = filter.kind === 'string' && filter.caseSensitive ? t('VTable.Filter.CaseSensitiveSuffix') : '';
    return `${filter.col}${value}${caseSensitive}`;
}

function normalizeColumns(columnsRaw: ColumnMeta[]): PopoverColumnMeta[] {
    return columnsRaw.map(column => ({
        name: column.name,
        type: column.type ?? '',
    }));
}

function testString(raw: any, op: StrOp, val?: string, cs?: boolean) {
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
}

function testNumber(raw: any, op: NumOp, val?: string) {
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
}

function testRange(raw: any, filter: ColumnFilter) {
    if (!filter.value || !filter.valueTo || !filter.rangeValueType) {
        return false;
    }

    if (filter.rangeValueType === 'date') {
        const current = raw instanceof Date ? raw.getTime() : Date.parse(String(raw ?? ''));
        const from = Date.parse(filter.value);
        const to = Date.parse(filter.valueTo);
        if (!Number.isFinite(current) || !Number.isFinite(from) || !Number.isFinite(to)) {
            return false;
        }
        return current >= from && current < to;
    }

    const current = typeof raw === 'number' ? raw : Number(raw);
    const from = Number(filter.value);
    const to = Number(filter.valueTo);
    if (!Number.isFinite(current) || !Number.isFinite(from) || !Number.isFinite(to)) {
        return false;
    }
    return current >= from && current < to;
}

export function useVTableFilters({
    results,
    storageKey,
}: {
    results: ResultRow[];
    storageKey?: string;
}) {
    const hydratedStorageKeyRef = useRef<string | undefined>(undefined);

    const readStoredFilters = useCallback((key?: string) => {
        if (typeof window !== 'undefined' && key) {
            try {
                const raw = localStorage.getItem(`${key}:filters`);
                if (raw) return JSON.parse(raw) as ColumnFilter[];
            } catch {}
        }
        return [];
    }, []);

    const [activeFilters, setActiveFilters] = useState<ColumnFilter[]>(() => {
        return readStoredFilters(storageKey);
    });
    const [filterDraft, setFilterDraft] = useState<FilterDraft>({
        col: '',
        kind: 'string',
        op: 'contains',
        value: '',
        cs: false,
    });

    useLayoutEffect(() => {
        hydratedStorageKeyRef.current = storageKey;
        setActiveFilters(readStoredFilters(storageKey));
    }, [readStoredFilters, storageKey]);

    useEffect(() => {
        if (!storageKey) return;
        if (hydratedStorageKeyRef.current !== storageKey) return;
        try {
            localStorage.setItem(`${storageKey}:filters`, JSON.stringify(activeFilters));
        } catch {}
    }, [activeFilters, storageKey]);

    const filteredResults = useMemo(() => {
        if (activeFilters.length === 0) return results;
        return results.filter(row => {
            for (const filter of activeFilters) {
                const raw = row.rowData?.[filter.col];
                if (filter.kind === 'string') {
                    if (!testString(raw, filter.op as StrOp, filter.value, filter.caseSensitive)) return false;
                } else if (filter.kind === 'range') {
                    if (!testRange(raw, filter)) return false;
                } else if (!testNumber(raw, filter.op as NumOp, filter.value)) {
                    return false;
                }
            }
            return true;
        });
    }, [activeFilters, results]);

    const filtersByColumn = useMemo(() => {
        const map = new Map<string, ColumnFilter>();
        activeFilters.forEach(filter => map.set(filter.col, filter));
        return map;
    }, [activeFilters]);

    const setColumnFilter = useCallback((filter: ColumnFilter) => {
        setActiveFilters(prev => {
            const others = prev.filter(item => item.col !== filter.col);
            return [...others, filter];
        });
    }, []);

    const applyFilterDraft = useCallback(() => {
        const { col, kind, op, value, cs } = filterDraft;
        if (!col) return;
        setColumnFilter({ col, kind, op, value: value ?? '', caseSensitive: cs });
    }, [filterDraft, setColumnFilter]);

    const removeFilter = useCallback((col: string) => {
        setActiveFilters(prev => prev.filter(filter => filter.col !== col));
    }, []);

    const clearAllFilters = useCallback(() => {
        setActiveFilters([]);
    }, []);

    const getColumnFilter = useCallback(
        (column: string) => filtersByColumn.get(column),
        [filtersByColumn],
    );

    const getColumnFilterPopoverProps = useCallback(
        (column: string, columnsRaw: ColumnMeta[]) => ({
            column,
            columns: normalizeColumns(columnsRaw),
            draft: filterDraft,
            setDraft: setFilterDraft,
            existing: filtersByColumn.get(column),
            onApply: applyFilterDraft,
            onRemove: removeFilter,
        }),
        [applyFilterDraft, filterDraft, filtersByColumn, removeFilter],
    );

    return {
        activeFilters,
        filteredResults,
        setColumnFilter,
        removeFilter,
        clearAllFilters,
        getColumnFilter,
        getColumnFilterPopoverProps,
    };
}

export function useVTableFilterUi({
    activeFilters,
    columnsRaw,
    onUpsertFilter,
    onRemoveFilter,
}: {
    activeFilters: ColumnFilter[];
    columnsRaw: ColumnMeta[];
    onUpsertFilter: (filter: ColumnFilter) => void;
    onRemoveFilter: (col: string) => void;
}) {
    const [filterDraft, setFilterDraft] = useState<FilterDraft>({
        col: '',
        kind: 'string',
        op: 'contains',
        value: '',
        cs: false,
    });
    const filtersByColumn = useMemo(() => {
        const map = new Map<string, ColumnFilter>();
        activeFilters.forEach(filter => map.set(filter.col, filter));
        return map;
    }, [activeFilters]);
    const normalizedColumns = useMemo(() => normalizeColumns(columnsRaw), [columnsRaw]);
    const applyFilterDraft = useCallback(() => {
        const { col, kind, op, value, cs } = filterDraft;
        if (!col) return;
        onUpsertFilter({ col, kind, op, value: value ?? '', caseSensitive: cs });
    }, [filterDraft, onUpsertFilter]);
    const getColumnFilter = useCallback(
        (column: string) => filtersByColumn.get(column),
        [filtersByColumn],
    );
    const getColumnFilterPopoverProps = useCallback(
        (column: string) => ({
            column,
            columns: normalizedColumns,
            draft: filterDraft,
            setDraft: setFilterDraft,
            existing: filtersByColumn.get(column),
            onApply: applyFilterDraft,
            onRemove: onRemoveFilter,
        }),
        [applyFilterDraft, filterDraft, filtersByColumn, normalizedColumns, onRemoveFilter],
    );

    return {
        getColumnFilter,
        getColumnFilterPopoverProps,
        filterDraft,
        setFilterDraft,
        applyFilterDraft,
    };
}

export function VTableFilters({
    activeFilters,
    columnsRaw,
    onUpsertFilter,
    onRemoveFilter,
    onClearAllFilters,
    className,
}: {
    activeFilters: ColumnFilter[];
    columnsRaw: ColumnMeta[];
    onUpsertFilter: (filter: ColumnFilter) => void;
    onRemoveFilter: (col: string) => void;
    onClearAllFilters: () => void;
    className?: string;
}) {
    const t = useTranslations('SqlConsole');
    const [tagFilterAnchor, setTagFilterAnchor] = useState<HTMLElement | null>(null);
    const [tagFilterCol, setTagFilterCol] = useState<string | null>(null);
    const [tagOpenSig, setTagOpenSig] = useState(0);
    const [hiddenFiltersOpen, setHiddenFiltersOpen] = useState(false);
    const hiddenFiltersAnchorRef = useRef<HTMLDivElement | null>(null);
    const { getColumnFilterPopoverProps, setFilterDraft } = useVTableFilterUi({
        activeFilters,
        columnsRaw,
        onUpsertFilter,
        onRemoveFilter,
    });
    const tagFilterPopoverProps = tagFilterCol ? getColumnFilterPopoverProps(tagFilterCol) : null;
    const visibleFilters = activeFilters.slice(0, MAX_VISIBLE_FILTERS);
    const hiddenFilters = activeFilters.slice(MAX_VISIBLE_FILTERS);

    const openFilterEditor = useCallback(
        (filter: ColumnFilter, anchor: HTMLElement) => {
            if (filter.kind === 'range') {
                return;
            }
            setFilterDraft({
                col: filter.col,
                kind: filter.kind === 'number' ? 'number' : 'string',
                op: filter.op as StrOp | NumOp,
                value: filter.value ?? '',
                cs: !!filter.caseSensitive,
            });
            setTagFilterAnchor(anchor);
            setTagFilterCol(filter.col);
            setTagOpenSig(value => value + 1);
        },
        [setFilterDraft],
    );

    const openHiddenFilterEditor = useCallback(
        (filter: ColumnFilter) => {
            setHiddenFiltersOpen(false);
            openFilterEditor(filter, hiddenFiltersAnchorRef.current ?? document.body);
        },
        [openFilterEditor],
    );

    return (
        <>
            {activeFilters.length > 0 && (
                <div className={cn('flex items-center gap-2 border-b bg-muted/30 px-2 py-1', className)}>
                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        {visibleFilters.map(filter => (
                            <FilterPill
                                key={filter.col}
                                filter={filter}
                                label={formatFilterSummary(filter, t)}
                                onOpen={openFilterEditor}
                                onRemove={onRemoveFilter}
                                t={t}
                            />
                        ))}
                        {hiddenFilters.length > 0 && (
                            <>
                                <div ref={hiddenFiltersAnchorRef} className="h-0 w-0 shrink-0" />
                                <Popover open={hiddenFiltersOpen} onOpenChange={setHiddenFiltersOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="shrink-0 rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                                    >
                                        +{hiddenFilters.length} more
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-80 p-2">
                                    <div className="space-y-1">
                                        {hiddenFilters.map(filter => (
                                            <FilterPill
                                                key={filter.col}
                                                filter={filter}
                                                label={formatFilterSummary(filter, t)}
                                                onOpen={filter => openHiddenFilterEditor(filter)}
                                                onRemove={onRemoveFilter}
                                                t={t}
                                                className="w-full"
                                            />
                                        ))}
                                    </div>
                                </PopoverContent>
                                </Popover>
                            </>
                        )}
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="shrink-0"
                        onClick={onClearAllFilters}
                    >
                        {t('VTable.Filter.ClearAll')}
                    </Button>
                </div>
            )}

            {tagFilterCol && tagFilterPopoverProps && (
                <ColumnFilterPopover
                    {...tagFilterPopoverProps}
                    onApply={() => {
                        tagFilterPopoverProps.onApply();
                        setTagFilterAnchor(null);
                        setTagFilterCol(null);
                    }}
                    onRemove={col => {
                        onRemoveFilter(col);
                        setTagFilterAnchor(null);
                        setTagFilterCol(null);
                    }}
                    externalAnchor={tagFilterAnchor}
                    externalOpenSignal={tagOpenSig}
                />
            )}
        </>
    );
}

function FilterPill({
    filter,
    label,
    onOpen,
    onRemove,
    t,
    className,
}: {
    filter: ColumnFilter;
    label: string;
    onOpen: (filter: ColumnFilter, anchor: HTMLElement) => void;
    onRemove: (col: string) => void;
    t: (key: string) => string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex min-w-0 items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-xs',
                className,
            )}
        >
            <button
                type="button"
                className={cn('flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-left', filter.kind === 'range' ? 'cursor-default' : 'cursor-pointer')}
                onClick={event => {
                    if (filter.kind === 'range') return;
                    onOpen(filter, event.currentTarget);
                }}
                title={filter.kind === 'range' ? label : t('VTable.Filter.EditHint')}
            >
                <Filter className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
            </button>
            <button
                type="button"
                className="shrink-0 opacity-70 transition-opacity hover:opacity-100 cursor-pointer"
                onClick={event => {
                    event.stopPropagation();
                    onRemove(filter.col);
                }}
                aria-label={t('VTable.Filter.RemoveAria')}
                title={t('VTable.Filter.RemoveTitle')}
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}
