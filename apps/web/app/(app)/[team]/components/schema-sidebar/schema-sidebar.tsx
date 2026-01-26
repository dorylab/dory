'use client';

import { useMemo, useState, useDeferredValue, useEffect } from 'react';
import { Table, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Input } from '@/registry/new-york-v4/ui/input';
import { DatabasesSelect } from './databases-select/databases-select';
import { activeDatabaseAtom } from '@/shared/stores/app.store';
import { useAtom } from 'jotai';
import { useDatabases } from '@/hooks/use-databases';
import { useTables } from '@/hooks/use-tables';
import { useColumns } from '@/hooks/use-columns';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type TableColumn = {
    columnName: string;
    columnType: string;
};

type SchemaSidebarProps = {
    onOpenTableTab?: (payload: { database?: string; tableName: string; tabLabel?: string }) => void;
    onSelectTable?: (payload: { database?: string; tableName: string; tabLabel?: string }) => void;
    onSelectDatabase?: (database: string) => void;
    selectedTable?: string;
    selectedDatabase?: string;
};

export function SchemaSidebar({
    onOpenTableTab,
    onSelectTable,
    selectedTable,
    selectedDatabase,
    onSelectDatabase,
}: SchemaSidebarProps) {
    const [localFilter, setFilter] = useState('');
    const deferredFilter = useDeferredValue(localFilter);
    const [activeDatabase, setActiveDatabase] = useAtom(activeDatabaseAtom);
    const t = useTranslations('SchemaSidebar');

    const { databases } = useDatabases();
    useEffect(() => {
        if (!databases?.length) return;
        const normalizeName = (item?: { value?: string; label?: string }) =>
            (item?.value ?? item?.label ?? '').toString().toLowerCase();

        const isReservedDatabase = (item: { value?: string; label?: string }) => {
            const normalized = normalizeName(item);
            return normalized === 'system' || normalized === 'information_schema';
        };

        const firstAvailableDatabase = databases.find(db => !isReservedDatabase(db));
        if (!firstAvailableDatabase) return;

        const hasActiveDatabase = activeDatabase && databases.some(db => db.value === activeDatabase);
        if (hasActiveDatabase) return;

        setActiveDatabase(firstAvailableDatabase.value);
        onSelectDatabase?.(firstAvailableDatabase.value);
    }, [databases, activeDatabase, onSelectDatabase, setActiveDatabase]);
    const { tables } = useTables(activeDatabase);
    const { refresh: getTableColumns } = useColumns();

    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
    const [tableColumns, setTableColumns] = useState<Record<string, TableColumn[]>>({});
    const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set());

    const normalized = deferredFilter.trim().toLowerCase();

    const resolveTableValue = (table: any) => (table?.value ?? table?.name ?? table?.label ?? '').toString();
    const resolveTableLabel = (table: any) => (table?.label ?? table?.value ?? table?.name ?? '').toString();

    const filteredTables = useMemo(() => {
        if (!normalized) return tables;
        return (tables || []).filter((t: any) => {
            const name = resolveTableLabel(t).toLowerCase();
            const value = resolveTableValue(t).toLowerCase();
            return name.includes(normalized) || value.includes(normalized);
        });
    }, [tables, normalized]);

    const toggleTableExpansion = async (tableName: string) => {
        const next = new Set(expandedTables);

        if (next.has(tableName)) {
            next.delete(tableName);
            setExpandedTables(next);
            return;
        }

        next.add(tableName);
        setExpandedTables(next);

        if (!tableColumns[tableName]) {
            setLoadingTables(prev => new Set(prev).add(tableName));
            try {
                const cols = await getTableColumns(activeDatabase, tableName);
                setTableColumns(prev => ({ ...prev, [tableName]: cols || [] }));
            } catch (e) {
                console.error(`Failed to fetch columns for ${tableName}:`, e);
            } finally {
                setLoadingTables(prev => {
                    const s = new Set(prev);
                    s.delete(tableName);
                    return s;
                });
            }
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0 gap-2 p-3 w-full min-w-0">
            <DatabasesSelect
                value={activeDatabase}
                databases={databases}
                onChange={db => {
                    setActiveDatabase(db);
                    onSelectDatabase?.(db);
                }}
            />

            {/* Filter */}
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    value={localFilter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder={t('Filter tables')}
                    className="pl-8 h-8"
                    aria-label={t('Filter tables')}
                />
            </div>

            <ScrollArea className="flex-1 space-y-2 min-h-0 mt-1">
                {filteredTables.length === 0 ? (
                    <div className="text-xs text-muted-foreground px-2 py-1.5" aria-live="polite">
                        {t('No matching tables found')}
                    </div>
                ) : (
                    filteredTables.map((table: any) => {
                        const tableValue = resolveTableValue(table);
                        const tableLabel = resolveTableLabel(table) || tableValue;
                        const isExpanded = expandedTables.has(tableValue);
                        const columns = tableColumns[tableValue] || [];
                        const isLoading = loadingTables.has(tableValue);
                        const isSelected =
                            !!selectedTable &&
                            tableValue === selectedTable &&
                            (!selectedDatabase || activeDatabase === selectedDatabase);

                        return (
                            <div key={tableValue} className="space-y-1 my-[1px]">
                                <div
                                    className={cn(
                                        'rounded-md mx-1',
                                        !isSelected && 'hover:bg-muted/50',
                                        isSelected && 'bg-primary/10 text-foreground ring-1 ring-primary/30',
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2 px-1 py-1">
                                        <div className="flex items-center gap-2 flex-1">
                                            <button
                                                onClick={() => toggleTableExpansion(tableValue)}
                                                className="flex-shrink-0 p-0.5 hover:bg-muted rounded cursor-pointer"
                                                aria-label={`${isExpanded ? t('Collapse') : t('Expand')} ${tableValue} ${t('Columns')}`}
                                            >
                                                {isLoading ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : isExpanded ? (
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                ) : (
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                )}
                                            </button>

                                            <Table className="h-3.5 w-3.5 flex-shrink-0" />

                                            
                                            <button
                                                className="text-sm text-left truncate overflow-hidden whitespace-nowrap w-full cursor-pointer"
                                                onClick={() =>
                                                    onSelectTable?.({
                                                        database: activeDatabase,
                                                        tableName: tableValue,
                                                        tabLabel: tableLabel,
                                                    })
                                                }
                                                onDoubleClick={() =>
                                                    onOpenTableTab?.({
                                                        database: activeDatabase,
                                                        tableName: tableValue,
                                                        tabLabel: tableLabel,
                                                    })
                                                }
                                                aria-label={t('Insert select for', { table: tableValue })}
                                                title={tableLabel}
                                            >
                                                {tableLabel}
                                            </button>
                                        </div>
                                    </div>

                                    {isExpanded && !isLoading && columns.length > 0 && (
                                        <div className="ml-6 mt-1 space-y-1">
                                            {columns.map(column => (
                                                <div
                                                    key={column.columnName}
                                                    className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/30 rounded cursor-pointer"
                                                >
                                                    <div className="w-2 h-2 rounded-full bg-muted-foreground/40 flex-shrink-0" />

                                                    
                                                    <span
                                                        className="truncate flex-1 cursor-pointer"
                                                        title={column.columnName}
                                                    >
                                                        {column.columnName}
                                                    </span>

                                                    
                                                    <Badge
                                                        variant="outline"
                                                        className="text-xs px-1 py-0 h-4 text-muted-foreground max-w-[140px] truncate justify-start cursor-pointer"
                                                        title={column.columnType}
                                                    >
                                                        {column.columnType}
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </ScrollArea>
        </div>
    );
}
