'use client';

import { ChevronDown, ChevronRight, Database, Eye, FolderTree, Loader2, Table, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { DEFAULT_GROUP_STATE, EMPTY_DATABASE_OBJECTS } from './types';
import type { DatabaseObjects, GroupState, TargetOption } from './types';
import { useTranslations } from 'next-intl';

type CatalogSchemaTreeProps = {
    catalogName: string;
    showCatalog: boolean;
    expandedCatalog: boolean;
    filteredDatabases: { label: string; value: string }[];
    expandedDatabases: Set<string>;
    expandedGroups: Record<string, GroupState>;
    databaseObjects: Record<string, DatabaseObjects>;
    loadingGroups: Record<string, GroupState>;
    normalized: string;
    hasAnyResults: boolean;
    selectedDatabase?: string;
    selectedTable?: string;
    onToggleCatalog: () => void;
    onToggleDatabase: (database: string) => void;
    onToggleGroup: (database: string, group: keyof GroupState) => void;
    onSelectDatabase: (database: string) => void;
    onSelectObject: (payload: { database: string; tableName: string; tabLabel?: string }) => void;
    onOpenObject: (payload: { database: string; tableName: string; tabLabel?: string }) => void;
    filterEntries: (entries: TargetOption[]) => TargetOption[];
};

type GroupConfig = {
    key: keyof GroupState;
    label: string;
    icon: LucideIcon;
    emptyLabel: string;
};

const resolveEntryValue = (entry: TargetOption) =>
    (entry.value ?? entry.label ?? entry.name ?? '').toString();

const resolveEntryLabel = (entry: TargetOption) =>
    (entry.label ?? entry.value ?? entry.name ?? '').toString();

export function CatalogSchemaTree({
    catalogName,
    showCatalog,
    expandedCatalog,
    filteredDatabases,
    expandedDatabases,
    expandedGroups,
    databaseObjects,
    loadingGroups,
    normalized,
    hasAnyResults,
    selectedDatabase,
    selectedTable,
    onToggleCatalog,
    onToggleDatabase,
    onToggleGroup,
    onSelectDatabase,
    onSelectObject,
    onOpenObject,
    filterEntries,
}: CatalogSchemaTreeProps) {
    const t = useTranslations('CatalogSchemaSidebar');
    const groupConfigs: GroupConfig[] = [
        { key: 'tables', label: t('Tables'), icon: Table, emptyLabel: t('No tables') },
        { key: 'materializedViews', label: t('Materialized views'), icon: Layers, emptyLabel: t('No materialized views') },
        { key: 'views', label: t('Views'), icon: Eye, emptyLabel: t('No views') },
    ];
    const showList = showCatalog ? expandedCatalog : true;

    return (
        <div className="space-y-1">
            {showCatalog ? (
                <CatalogHeader catalogName={catalogName} expanded={expandedCatalog} onToggle={onToggleCatalog} />
            ) : null}

            {showList ? (
                <div className="space-y-1">
                    {filteredDatabases.length === 0 && !hasAnyResults ? (
                        <div className="text-xs text-muted-foreground px-2 py-1.5" aria-live="polite">
                            {t('No matching objects found')}
                        </div>
                    ) : (
                        filteredDatabases.map(db => {
                            const dbName = db.value ?? db.label;
                            const isExpanded = expandedDatabases.has(dbName);
                            const groupState = expandedGroups[dbName] ?? DEFAULT_GROUP_STATE;
                            const objects = databaseObjects[dbName] ?? EMPTY_DATABASE_OBJECTS;
                            const groupLoading = loadingGroups[dbName] ?? DEFAULT_GROUP_STATE;

                            return (
                                <DatabaseNode
                                    key={dbName}
                                    dbName={dbName}
                                    label={db.label ?? dbName}
                                    isExpanded={isExpanded}
                                    groupState={groupState}
                                    objects={objects}
                                    loadingGroups={groupLoading}
                                    normalized={normalized}
                                    groupConfigs={groupConfigs}
                                    selectedDatabase={selectedDatabase}
                                    selectedTable={selectedTable}
                                    onToggleDatabase={onToggleDatabase}
                                    onToggleGroup={onToggleGroup}
                                    onSelectDatabase={onSelectDatabase}
                                    onSelectObject={onSelectObject}
                                    onOpenObject={onOpenObject}
                                    filterEntries={filterEntries}
                                />
                            );
                        })
                    )}
                </div>
            ) : null}
        </div>
    );
}

type CatalogHeaderProps = {
    catalogName: string;
    expanded: boolean;
    onToggle: () => void;
};

function CatalogHeader({ catalogName, expanded, onToggle }: CatalogHeaderProps) {
    const t = useTranslations('CatalogSchemaSidebar');
    return (
        <div className="flex items-center gap-2 px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
            <button
                type="button"
                onClick={onToggle}
                className="flex-shrink-0 p-0.5 hover:bg-muted rounded"
                aria-label={`${expanded ? t('Collapse') : t('Expand')} ${catalogName}`}
            >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <FolderTree className="h-3.5 w-3.5" />
            <span>{catalogName}</span>
        </div>
    );
}

type DatabaseNodeProps = {
    dbName: string;
    label: string;
    isExpanded: boolean;
    groupState: GroupState;
    objects: DatabaseObjects;
    loadingGroups: GroupState;
    normalized: string;
    groupConfigs: GroupConfig[];
    selectedDatabase?: string;
    selectedTable?: string;
    onToggleDatabase: (database: string) => void;
    onToggleGroup: (database: string, group: keyof GroupState) => void;
    onSelectDatabase: (database: string) => void;
    onSelectObject: (payload: { database: string; tableName: string; tabLabel?: string }) => void;
    onOpenObject: (payload: { database: string; tableName: string; tabLabel?: string }) => void;
    filterEntries: (entries: TargetOption[]) => TargetOption[];
};

function DatabaseNode({
    dbName,
    label,
    isExpanded,
    groupState,
    objects,
    loadingGroups,
    normalized,
    groupConfigs,
    selectedDatabase,
    selectedTable,
    onToggleDatabase,
    onToggleGroup,
    onSelectDatabase,
    onSelectObject,
    onOpenObject,
    filterEntries,
}: DatabaseNodeProps) {
    const t = useTranslations('CatalogSchemaSidebar');
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 py-1">
                <button
                    type="button"
                    onClick={() => onToggleDatabase(dbName)}
                    className="flex-shrink-0 p-0.5 hover:bg-muted rounded"
                    aria-label={`${isExpanded ? t('Collapse') : t('Expand')} ${dbName}`}
                >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <Database className="h-3.5 w-3.5 text-muted-foreground" />
                <button
                    type="button"
                    onClick={() => onSelectDatabase(dbName)}
                    className={cn(
                        'text-sm truncate text-left flex-1',
                        selectedDatabase === dbName
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                    title={dbName}
                >
                    {label}
                </button>
            </div>

            {isExpanded ? (
                <div className="ml-6 space-y-1">
                    {groupConfigs.map(group => {
                        const entries = objects[group.key];
                        const filtered = normalized ? filterEntries(entries) : entries;
                        const isGroupLoading = loadingGroups[group.key];

                        return (
                            <ObjectGroup
                                key={`${dbName}-${group.key}`}
                                dbName={dbName}
                                group={group}
                                isExpanded={groupState[group.key]}
                                isLoading={isGroupLoading}
                                entries={filtered}
                                normalized={normalized}
                                selectedDatabase={selectedDatabase}
                                selectedTable={selectedTable}
                                onToggle={() => onToggleGroup(dbName, group.key)}
                                onSelectObject={onSelectObject}
                                onOpenObject={onOpenObject}
                            />
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

type ObjectGroupProps = {
    dbName: string;
    group: GroupConfig;
    isExpanded: boolean;
    isLoading: boolean;
    entries: TargetOption[];
    normalized: string;
    selectedDatabase?: string;
    selectedTable?: string;
    onToggle: () => void;
    onSelectObject: (payload: { database: string; tableName: string; tabLabel?: string }) => void;
    onOpenObject: (payload: { database: string; tableName: string; tabLabel?: string }) => void;
};

function ObjectGroup({
    dbName,
    group,
    isExpanded,
    isLoading,
    entries,
    normalized,
    selectedDatabase,
    selectedTable,
    onToggle,
    onSelectObject,
    onOpenObject,
}: ObjectGroupProps) {
    const t = useTranslations('CatalogSchemaSidebar');
    return (
        <div className="space-y-1">
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
                {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                )}
                <span>{group.label}</span>
            </button>

            {isExpanded ? (
                <div className="ml-6 space-y-1">
                    {entries.length ? (
                        entries
                            .map(entry => ({ entry, value: resolveEntryValue(entry) }))
                            .filter(item => item.value)
                            .map(item => (
                                <ObjectItem
                                    key={`${dbName}-${group.key}-${item.value}`}
                                    dbName={dbName}
                                    entry={item.entry}
                                    icon={group.icon}
                                    selectedDatabase={selectedDatabase}
                                    selectedTable={selectedTable}
                                    onSelectObject={onSelectObject}
                                    onOpenObject={onOpenObject}
                                />
                            ))
                    ) : (
                        <div className="text-xs text-muted-foreground px-2 py-1.5">
                            {normalized ? t('No matching items') : group.emptyLabel}
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

type ObjectItemProps = {
    dbName: string;
    entry: TargetOption;
    icon: LucideIcon;
    selectedDatabase?: string;
    selectedTable?: string;
    onSelectObject: (payload: { database: string; tableName: string; tabLabel?: string }) => void;
    onOpenObject: (payload: { database: string; tableName: string; tabLabel?: string }) => void;
};

function ObjectItem({
    dbName,
    entry,
    icon: Icon,
    selectedDatabase,
    selectedTable,
    onSelectObject,
    onOpenObject,
}: ObjectItemProps) {
    const entryValue = resolveEntryValue(entry);
    const entryLabel = resolveEntryLabel(entry);
    const isSelected = selectedTable === entryValue && selectedDatabase === dbName;

    return (
        <button
            type="button"
            className={cn(
                'w-full flex items-center gap-2 text-left text-sm truncate px-2 py-1 rounded',
                isSelected
                    ? 'bg-primary/10 text-foreground ring-1 ring-primary/30'
                    : 'hover:bg-muted/50 text-muted-foreground',
            )}
            onClick={() =>
                onSelectObject({
                    database: dbName,
                    tableName: entryValue,
                    tabLabel: entryLabel,
                })
            }
            onDoubleClick={() =>
                onOpenObject({
                    database: dbName,
                    tableName: entryValue,
                    tabLabel: entryLabel,
                })
            }
            title={entryLabel}
        >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{entryLabel}</span>
        </button>
    );
}
