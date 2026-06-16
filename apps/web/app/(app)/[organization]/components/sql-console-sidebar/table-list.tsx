'use client';

import { useState } from 'react';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/registry/new-york-v4/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { cn } from '@dory/web-utils';
import { ChevronDown, ChevronRight, Copy, Loader2, Pencil, Play, Table, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';
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
    onQueryTable?: (payload: TableActionPayload) => void | Promise<void>;
    onRenameTable?: (payload: RenameTablePayload) => void | Promise<void>;
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
    getTableActionPayload,
    t,
}: TableListProps) {
    const [renameTarget, setRenameTarget] = useState<TableActionPayload | null>(null);
    const [renameDraft, setRenameDraft] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);

    const toPayload = (table: SidebarTableItem): TableActionPayload =>
        getTableActionPayload?.(table) ?? {
            database: activeDatabase,
            schema: table.schemaName,
            tableName: table.value,
            tabLabel: table.label,
        };

    const handleCopyTableName = async (table: SidebarTableItem) => {
        try {
            await navigator.clipboard.writeText(table.value);
            toast.success(t('Table name copied'));
        } catch {
            toast.error(t('Copy table name failed'));
        }
    };

    const openRenameDialog = (table: SidebarTableItem) => {
        const payload = toPayload(table);
        setRenameTarget(payload);
        setRenameDraft(table.value.split('.').filter(Boolean).pop() ?? table.value);
    };

    const handleRenameConfirm = async () => {
        if (!renameTarget || !onRenameTable) return;
        const nextName = renameDraft.trim();
        const currentName = renameTarget.tableName.split('.').filter(Boolean).pop() ?? renameTarget.tableName;
        if (!nextName || nextName === currentName) {
            setRenameTarget(null);
            setRenameDraft('');
            return;
        }

        setIsRenaming(true);
        try {
            await onRenameTable({ ...renameTarget, nextName });
            toast.success(t('Table renamed'));
            setRenameTarget(null);
            setRenameDraft('');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('Rename table failed'));
        } finally {
            setIsRenaming(false);
        }
    };

    return (
        <>
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
                                <ContextMenu key={table.key}>
                                    <ContextMenuTrigger asChild>
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
                                    </ContextMenuTrigger>
                                    <ContextMenuContent className="w-52">
                                        <ContextMenuItem onSelect={() => void onOpenQueryConsole?.()}>
                                            <TerminalSquare className="mr-2 h-4 w-4" />
                                            {t('Open Console')}
                                        </ContextMenuItem>
                                        <ContextMenuItem onSelect={() => void onQueryTable?.(toPayload(table))}>
                                            <Play className="mr-2 h-4 w-4" />
                                            {t('Quick Query')}
                                        </ContextMenuItem>
                                        <ContextMenuItem onSelect={() => void handleCopyTableName(table)}>
                                            <Copy className="mr-2 h-4 w-4" />
                                            {t('Copy')}
                                        </ContextMenuItem>
                                        <ContextMenuSeparator />
                                        <ContextMenuItem disabled={!onRenameTable} onSelect={() => openRenameDialog(table)}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            {t('Rename')}
                                        </ContextMenuItem>
                                    </ContextMenuContent>
                                </ContextMenu>
                            );
                        })
                    )}
                </div>
            </ScrollArea>

            <Dialog
                open={!!renameTarget}
                onOpenChange={open => {
                    if (!open) {
                        setRenameTarget(null);
                        setRenameDraft('');
                    }
                }}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t('Rename table')}</DialogTitle>
                        <DialogDescription>{t('Rename table description')}</DialogDescription>
                    </DialogHeader>
                    <Input
                        value={renameDraft}
                        autoFocus
                        disabled={isRenaming}
                        onChange={event => setRenameDraft(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleRenameConfirm();
                            }
                        }}
                        placeholder={t('Table name')}
                    />
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isRenaming}
                            onClick={() => {
                                setRenameTarget(null);
                                setRenameDraft('');
                            }}
                        >
                            {t('Cancel')}
                        </Button>
                        <Button type="button" disabled={isRenaming || !renameDraft.trim()} onClick={() => void handleRenameConfirm()}>
                            {isRenaming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {t('Rename')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
