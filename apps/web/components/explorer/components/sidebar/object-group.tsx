'use client';

import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@dory/web-utils';
import { TableContextMenu } from '@/components/table-context-menu/table-context-menu';
import type { RenameTableTarget, TableContextTarget } from '@/components/table-context-menu/types';
import type { GroupState, SidebarListTarget, SidebarObjectKind, SidebarObjectTarget, SidebarSelection, SidebarListKind, TargetOption } from './types';

export type GroupConfig = {
    key: keyof GroupState;
    label: string;
    icon: LucideIcon;
    emptyLabel: string;
};

type ObjectGroupProps = {
    scopeKey: string;
    dbName: string;
    group: GroupConfig;
    objectKind: SidebarObjectKind;
    listTarget: SidebarListTarget;
    fallbackSchema?: string;
    isExpanded: boolean;
    isLoading: boolean;
    entries: TargetOption[];
    normalized: string;
    selectedDatabase?: string;
    selectedSchema?: string;
    selectedList?: SidebarListKind;
    selectedObject?: SidebarSelection;
    onToggle: () => void;
    onSelectList: (target: SidebarListTarget) => void;
    onSelectObject: (target: SidebarObjectTarget) => void;
    onOpenObject: (target: SidebarObjectTarget) => void;
    onNewQuery?: () => void | Promise<void>;
    onQuickQuery?: (target: TableContextTarget) => void | Promise<void>;
    onRenameTable?: (target: RenameTableTarget) => void | Promise<void>;
    onImportTable?: (target: TableContextTarget) => void | Promise<void>;
};

const resolveEntryValue = (entry: TargetOption) => (entry.value ?? entry.label ?? entry.name ?? '').toString();
const resolveEntryLabel = (entry: TargetOption) => (entry.label ?? entry.value ?? entry.name ?? '').toString();

export function ObjectGroup({
    scopeKey,
    dbName,
    group,
    objectKind,
    fallbackSchema,
    isExpanded,
    isLoading,
    entries,
    normalized,
    selectedDatabase,
    selectedObject,
    onToggle,
    onSelectObject,
    onOpenObject,
    onNewQuery,
    onQuickQuery,
    onRenameTable,
    onImportTable,
}: ObjectGroupProps) {
    const t = useTranslations('CatalogSchemaSidebar');

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-1 px-2 py-1">
                <button
                    type="button"
                    onClick={onToggle}
                    className="cursor-pointer rounded p-0.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    aria-label={`${isExpanded ? t('Collapse') : t('Expand')} ${group.label}`}
                >
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <span className="flex-1 truncate px-1 py-0.5 text-xs text-sidebar-foreground/70 select-none">{`${group.label} (${entries.length})`}</span>
            </div>

            {isExpanded ? (
                <div className="ml-6 space-y-1">
                    {entries.length ? (
                        entries
                            .map(entry => ({ entry, value: resolveEntryValue(entry) }))
                            .filter((item): item is { entry: TargetOption; value: string } => Boolean(item.value))
                            .map(item => (
                                <ObjectItem
                                    key={`${scopeKey}-${group.key}-${item.value}`}
                                    dbName={dbName}
                                    entry={item.entry}
                                    icon={group.icon}
                                    objectKind={objectKind}
                                    fallbackSchema={fallbackSchema}
                                    selectedDatabase={selectedDatabase}
                                    selectedObject={selectedObject}
                                    onSelectObject={onSelectObject}
                                    onOpenObject={onOpenObject}
                                    onNewQuery={onNewQuery}
                                    onQuickQuery={onQuickQuery}
                                    onRenameTable={onRenameTable}
                                    onImportTable={onImportTable}
                                />
                            ))
                    ) : (
                        <div className="px-2 py-1.5 text-xs text-sidebar-foreground/70">{normalized ? t('No matching items') : group.emptyLabel}</div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function ObjectItem({
    dbName,
    entry,
    icon: Icon,
    objectKind,
    fallbackSchema,
    selectedDatabase,
    selectedObject,
    onSelectObject,
    onOpenObject,
    onNewQuery,
    onQuickQuery,
    onRenameTable,
    onImportTable,
}: {
    dbName: string;
    entry: TargetOption;
    icon: LucideIcon;
    objectKind: SidebarObjectKind;
    fallbackSchema?: string;
    selectedDatabase?: string;
    selectedObject?: SidebarSelection;
    onSelectObject: (target: SidebarObjectTarget) => void;
    onOpenObject: (target: SidebarObjectTarget) => void;
    onNewQuery?: () => void | Promise<void>;
    onQuickQuery?: (target: TableContextTarget) => void | Promise<void>;
    onRenameTable?: (target: RenameTableTarget) => void | Promise<void>;
    onImportTable?: (target: TableContextTarget) => void | Promise<void>;
}) {
    const entryValue = resolveEntryValue(entry);
    const entryLabel = resolveEntryLabel(entry);
    const entrySchema = typeof entry.schema === 'string' && entry.schema.trim() ? entry.schema.trim() : fallbackSchema;
    const entryName = entrySchema && entryValue.startsWith(`${entrySchema}.`) ? entryValue.slice(entrySchema.length + 1) : entryValue;
    const isSelected =
        selectedDatabase === dbName &&
        selectedObject?.objectKind === objectKind &&
        (entryValue === selectedObject.name ||
            entryName === selectedObject.name ||
            (selectedObject.schema ? entryValue === `${selectedObject.schema}.${selectedObject.name}` : false));

    const itemButton = (
        <button
            type="button"
            className={cn(
                'flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left text-sm',
                isSelected
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
                'cursor-pointer',
            )}
            onClick={() =>
                onSelectObject({
                    database: dbName,
                    schema: entrySchema,
                    objectKind,
                    name: entryName,
                    label: entryLabel,
                })
            }
            onDoubleClick={() =>
                onOpenObject({
                    database: dbName,
                    schema: entrySchema,
                    objectKind,
                    name: entryName,
                    label: entryLabel,
                })
            }
            title={entryLabel}
        >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{entryLabel}</span>
        </button>
    );

    if (objectKind !== 'table') return itemButton;

    const target: TableContextTarget = {
        database: dbName,
        schema: entrySchema,
        tableName: entryValue,
        tableLabel: entryLabel,
        unqualifiedTableName: entryName,
    };

    return (
        <TableContextMenu target={target} onNewQuery={onNewQuery} onQuickQuery={onQuickQuery} onRename={onRenameTable} onImport={onImportTable}>
            {itemButton}
        </TableContextMenu>
    );
}
