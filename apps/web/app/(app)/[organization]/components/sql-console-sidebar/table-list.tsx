'use client';

import { Badge } from '@/registry/new-york-v4/ui/badge';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Loader2, Table } from 'lucide-react';
import type { SidebarTableItem, TableColumn } from './types';

type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

type TableListProps = {
    tables: SidebarTableItem[];
    activeDatabase: string;
    selectedTable?: string;
    selectedDatabase?: string;
    expandedTableKeys: Set<string>;
    loadingTableKeys: Set<string>;
    columnsByTableKey: Record<string, TableColumn[]>;
    onToggleTable: (table: SidebarTableItem) => void | Promise<void>;
    onSelectTable?: (payload: { database?: string; tableName: string; tabLabel?: string }) => void;
    onOpenTableTab?: (payload: { database?: string; tableName: string; tabLabel?: string }) => void;
    t: TranslationFn;
};

export function TableList({
    tables,
    activeDatabase,
    selectedTable,
    selectedDatabase,
    expandedTableKeys,
    loadingTableKeys,
    columnsByTableKey,
    onToggleTable,
    onSelectTable,
    onOpenTableTab,
    t,
}: TableListProps) {
    return (
        <ScrollArea className="mt-1 min-h-0 flex-1 w-[calc(100%+0.75rem)] -mr-3 space-y-2">
            <div className="pr-3">
                {tables.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground" aria-live="polite">
                        {t('No matching tables found')}
                    </div>
                ) : (
                    tables.map(table => {
                        const isExpanded = expandedTableKeys.has(table.key);
                        const columns = columnsByTableKey[table.key] || [];
                        const isLoading = loadingTableKeys.has(table.key);
                        const isSelected = Boolean(selectedTable) && table.value === selectedTable && (!selectedDatabase || activeDatabase === selectedDatabase);

                        return (
                            <div key={table.key} className="my-px space-y-1">
                                <div className={cn('mx-1 rounded-md', !isSelected && 'hover:bg-muted/50', isSelected && 'bg-primary/10 text-foreground ring-1 ring-primary/30')}>
                                    <div className="flex items-center justify-between gap-2 px-1 py-1">
                                        <div className="flex flex-1 items-center gap-2">
                                            <button
                                                onClick={() => onToggleTable(table)}
                                                className="cursor-pointer rounded p-0.5 hover:bg-muted"
                                                aria-label={`${isExpanded ? t('Collapse') : t('Expand')} ${table.value} ${t('Columns')}`}
                                            >
                                                {isLoading ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : isExpanded ? (
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                ) : (
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                )}
                                            </button>

                                            <Table className="h-3.5 w-3.5 shrink-0" />

                                            <button
                                                className="w-full cursor-pointer overflow-hidden truncate whitespace-nowrap text-left text-sm"
                                                onClick={() =>
                                                    onSelectTable?.({
                                                        database: activeDatabase,
                                                        tableName: table.value,
                                                        tabLabel: table.label,
                                                    })
                                                }
                                                onDoubleClick={() =>
                                                    onOpenTableTab?.({
                                                        database: activeDatabase,
                                                        tableName: table.value,
                                                        tabLabel: table.label,
                                                    })
                                                }
                                                aria-label={t('Insert select for', { table: table.value })}
                                                title={table.label}
                                            >
                                                {table.label}
                                            </button>
                                        </div>
                                    </div>

                                    {isExpanded && !isLoading && columns.length > 0 ? (
                                        <div className="mt-1 space-y-1">
                                            {columns.map(column => (
                                                <div
                                                    key={`${table.key}:${column.columnName}`}
                                                    className="ml-6 flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/30"
                                                >
                                                    <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                                                    <span className="flex-1 truncate" title={column.columnName}>
                                                        {column.columnName}
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className="h-4 max-w-35 cursor-default justify-start truncate px-1 py-0 text-xs text-muted-foreground"
                                                        title={column.columnType}
                                                    >
                                                        {column.columnType}
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </ScrollArea>
    );
}
