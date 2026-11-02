'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SqlResultView, SqlResultTablePane, SqlResultChartPane, type SqlResultViewMode } from './sql-result-view';
import { VTableSearchBar } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/TableSearchBar';
import { useVTableFilters, VTableFilters } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/VTableFilters';
import type { ChartState } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared';
import type { VTableProps } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/type';

const NOOP = () => undefined;

/** Adapts an immutable, local snapshot to the same result UI as live query sessions. */
export function LocalSqlResult({
    rows,
    columns,
    storageKey,
    onChartStateChange,
}: {
    rows: VTableProps['results'];
    columns: Array<{ name: string; type?: string | null }>;
    storageKey: string;
    onChartStateChange?: (state: ChartState) => void;
}) {
    const t = useTranslations('SqlConsole');
    const [view, setView] = useState<SqlResultViewMode>('table');
    const [query, setQuery] = useState('');
    const [chartOpened, setChartOpened] = useState(false);
    const searched = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return needle
            ? rows.filter(row =>
                  columns.some(column =>
                      String(row.rowData[column.name] ?? '')
                          .toLowerCase()
                          .includes(needle),
                  ),
              )
            : rows;
    }, [rows, columns, query]);
    const { activeFilters, filteredResults, setColumnFilter, removeFilter, clearAllFilters } = useVTableFilters({ results: searched, storageKey });
    return (
        <SqlResultView
            view={view}
            onViewChange={next => {
                setView(next);
                if (next === 'charts') setChartOpened(true);
            }}
            filters={
                <>
                    <VTableSearchBar
                        query={query}
                        onQueryChange={setQuery}
                        onClearQuery={() => setQuery('')}
                        filteredCount={filteredResults.length}
                        totalCount={rows.length}
                        className="w-80 max-w-full"
                    />
                    <VTableFilters
                        activeFilters={activeFilters}
                        columnsRaw={columns}
                        onUpsertFilter={setColumnFilter}
                        onRemoveFilter={removeFilter}
                        onClearAllFilters={clearAllFilters}
                        className="border-0 bg-transparent px-0 py-0"
                    />
                </>
            }
            tables={
                <SqlResultTablePane
                    visible={view === 'table'}
                    isActive={view === 'table'}
                    results={filteredResults}
                    columnMetas={columns}
                    storageKey={storageKey}
                    onStatsChange={NOOP}
                    activeFilters={activeFilters}
                    onUpsertFilter={setColumnFilter}
                    onRemoveFilter={removeFilter}
                    onClearAllFilters={clearAllFilters}
                    showFiltersBar={false}
                    editable={false}
                />
            }
            charts={
                chartOpened && (
                    <SqlResultChartPane
                        visible={view === 'charts'}
                        rows={filteredResults}
                        columnsRaw={columns}
                        stateKey={storageKey}
                        onStateChange={onChartStateChange}
                        onApplyFilters={(filters, options) => {
                            if (!options?.append) clearAllFilters();
                            filters.forEach(setColumnFilter);
                        }}
                    />
                )
            }
            empty={
                filteredResults.length === 0 ? (
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-sm text-muted-foreground">{t('Results.NoResults')}</div>
                ) : undefined
            }
        />
    );
}
