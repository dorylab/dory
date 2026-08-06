'use client';

import { Badge } from '@/registry/new-york-v4/ui/badge';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { cn } from '@dory/web-utils';
import { ChevronDown, ChevronRight, Loader2, Table } from 'lucide-react';
import { TableContextMenu } from '@/components/table-context-menu/table-context-menu';
import type { TableContextTarget } from '@/components/table-context-menu/types';
import type { RenameTablePayload, SidebarTableItem, TableActionPayload, TableColumn } from './types';

type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

type TableListProps = {
    tables: SidebarTableItem[];
    loading: boolean;
    activeDatabase: string;
    selectedTable?: string;
    selectedDatabase?: string;
    expandedTableKeys: Set<string>;
    loadingTableKeys: Set<string>;
    columnsByTableKey: Record<string, TableColumn[]>;
    onToggleTable: (table: SidebarTableItem) => void | Promise<void>;
    onSelectTable?: (payload: TableActionPayload) => void;
    onOpenTableTab?: (payload: TableActionPayload) => void;
    onOpenQueryConsole?: () => void | Promise<void>;
    onQueryTable?: (payload: TableContextTarget) => void | Promise<void>;
    onRenameTable?: (payload: RenameTablePayload) => void | Promise<void>;
    onImportTable?: (payload: TableContextTarget) => void | Promise<void>;
    getTableActionPayload?: (table: SidebarTableItem) => TableActionPayload;
    t: TranslationFn;
};

export function TableList({
    tables,
    loading,
    activeDatabase,
    selectedTable,
    selectedDatabase,
    expandedTableKeys,
    loadingTableKeys,
    columnsByTableKey,
    onToggleTable,
    onSelectTable,
    onOpenTableTab,
    onOpenQueryConsole,
    onQueryTable,
    onRenameTable,
    onImportTable,
    getTableActionPayload,
    t,
}: TableListProps) {
    const toPayload = (table: SidebarTableItem): TableActionPayload =>
        getTableActionPayload?.(table) ?? {
            database: activeDatabase,
            schema: table.schemaName,
            tableName: table.value,
            tabLabel: table.label,
        };

    const toContextTarget = (table: SidebarTableItem): TableContextTarget => {
        const payload = toPayload(table);
        return {
            database: payload.database ?? activeDatabase,
            schema: payload.schema,
            tableName: payload.tableName,
            tableLabel: payload.tabLabel,
            unqualifiedTableName: table.value.split('.').filter(Boolean).pop() ?? table.value,
        };
    };

    return (
        <ScrollArea className="mt-1 min-h-0 w-[calc(100%+0.75rem)] min-w-0 flex-1 -mr-3 space-y-2">
            <div className="min-w-0 pr-3">
                {loading ? (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground" aria-live="polite">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t('Loading tables')}
                    </div>
                ) : tables.length === 0 ? (
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
                            <TableContextMenu
                                key={table.key}
                                target={toContextTarget(table)}
                                onNewQuery={onOpenQueryConsole}
                                onQuickQuery={onQueryTable}
                                onRename={onRenameTable}
                                onImport={onImportTable}
                            >
                                <div className="group/table-row my-px min-w-0 space-y-1">
                                    <div
                                        className={cn(
                                            'mx-1 min-w-0 overflow-hidden rounded-md',
                                            !isSelected && 'hover:bg-muted/50 group-data-[state=open]/table-row:bg-muted/50',
                                            isSelected && 'bg-primary/10 text-foreground ring-1 ring-primary/30',
                                        )}
                                    >
                                        <div className="flex min-w-0 items-center justify-between gap-2 px-1 py-1">
                                            <div className="flex min-w-0 flex-1 items-center gap-2">
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
                                                    className="min-w-0 flex-1 cursor-pointer overflow-hidden truncate whitespace-nowrap text-left text-sm"
                                                    onClick={() => {
                                                        const payload = toPayload(table);
                                                        onSelectTable?.(payload);
                                                        onOpenTableTab?.(payload);
                                                    }}
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
                            </TableContextMenu>
                        );
                    })
                )}
            </div>
        </ScrollArea>
    );
}
