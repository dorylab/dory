'use client';

import { Boxes, ChevronDown, ChevronRight, Database, Eye, FolderTree, Loader2, Sigma, Table } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@dory/web-utils';
import type { RenameTableTarget, TableContextTarget } from '@/components/table-context-menu/types';

import { ObjectGroup } from './object-group';
import type { GroupConfig } from './object-group';
import { SchemaNodeRow } from './schema-node-row';
import { DEFAULT_GROUP_STATE, EMPTY_DATABASE_OBJECTS } from './types';
import type { DatabaseObjects, GroupState, SchemaNode, SidebarListKind, SidebarListTarget, SidebarObjectTarget, SidebarSelection, TargetOption } from './types';

type ExplorerSidebarTreeProps = {
    catalogName: string;
    groupKeys: (keyof GroupState)[];
    showCatalog: boolean;
    expandedCatalog: boolean;
    filteredDatabases: { label: string; value: string }[];
    expandedDatabases: Set<string>;
    expandedGroups: Record<string, GroupState>;
    expandedSchemas: Record<string, boolean>;
    databaseObjects: Record<string, DatabaseObjects>;
    databaseSchemas: Record<string, SchemaNode[]>;
    loadingGroups: Record<string, GroupState>;
    loadingSchemas: Record<string, boolean>;
    supportsSchemas: boolean;
    normalized: string;
    hasAnyResults: boolean;
    selectedDatabase?: string;
    selectedSchema?: string;
    selectedList?: SidebarListKind;
    selectedObject?: SidebarSelection;
    onToggleCatalog: () => void;
    onToggleDatabase: (database: string) => void;
    onToggleGroup: (scopeKey: string, group: keyof GroupState) => void;
    onToggleSchema: (database: string, schema: string) => void;
    onSelectDatabase: (database: string) => void;
    onSelectSchema: (target: { database: string; schema: string }) => void;
    onSelectList: (target: SidebarListTarget) => void;
    onSelectObject: (target: SidebarObjectTarget) => void;
    onOpenObject: (target: SidebarObjectTarget) => void;
    onNewQuery?: () => void | Promise<void>;
    onQuickQuery?: (target: TableContextTarget) => void | Promise<void>;
    onRenameTable?: (target: RenameTableTarget) => void | Promise<void>;
    onImportTable?: (target: TableContextTarget) => void | Promise<void>;
    filterEntries: (entries: TargetOption[]) => TargetOption[];
    getSchemaObjects: (database: string, schema: string) => DatabaseObjects;
};

function buildScopeKey(database: string, schema?: string) {
    return schema ? `${database}::${schema}` : database;
}

function isAnyGroupLoading(groupState?: GroupState) {
    if (!groupState) return false;
    return Object.values(groupState).some(Boolean);
}

export function ExplorerSidebarTree({
    catalogName,
    groupKeys,
    showCatalog,
    expandedCatalog,
    filteredDatabases,
    expandedDatabases,
    expandedGroups,
    expandedSchemas,
    databaseObjects,
    databaseSchemas,
    loadingGroups,
    loadingSchemas,
    supportsSchemas,
    normalized,
    hasAnyResults,
    selectedDatabase,
    selectedSchema,
    selectedList,
    selectedObject,
    onToggleCatalog,
    onToggleDatabase,
    onToggleGroup,
    onToggleSchema,
    onSelectDatabase,
    onSelectSchema,
    onSelectList,
    onSelectObject,
    onOpenObject,
    onNewQuery,
    onQuickQuery,
    onRenameTable,
    onImportTable,
    filterEntries,
    getSchemaObjects,
}: ExplorerSidebarTreeProps) {
    const t = useTranslations('CatalogSchemaSidebar');
    const groupConfigs: GroupConfig[] = groupKeys
        .map(groupKey => {
            switch (groupKey) {
                case 'tables':
                    return { key: 'tables', label: t('Tables'), icon: Table, emptyLabel: t('No tables') };
                case 'views':
                    return { key: 'views', label: t('Views'), icon: Eye, emptyLabel: t('No views') };
                case 'materializedViews':
                    return { key: 'materializedViews', label: t('Materialized views'), icon: Boxes, emptyLabel: t('No materialized views') };
                case 'functions':
                    return { key: 'functions', label: t('Functions'), icon: Sigma, emptyLabel: t('No functions') };
                default:
                    return null;
            }
        })
        .filter((config): config is GroupConfig => Boolean(config));
    const showList = showCatalog ? expandedCatalog : true;

    return (
        <div className="space-y-1">
            {showCatalog ? <CatalogHeader catalogName={catalogName} expanded={expandedCatalog} onToggle={onToggleCatalog} /> : null}

            {showList ? (
                <div className="space-y-1">
                    {filteredDatabases.length === 0 && !hasAnyResults ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground" aria-live="polite">
                            {t('No matching objects found')}
                        </div>
                    ) : (
                        filteredDatabases.map(db => {
                            const dbName = db.value ?? db.label;
                            const schemaNodes = databaseSchemas[dbName] ?? [];

                            return (
                                <DatabaseNode
                                    key={dbName}
                                    dbName={dbName}
                                    label={db.label ?? dbName}
                                    isExpanded={expandedDatabases.has(dbName)}
                                    groupState={expandedGroups[dbName] ?? DEFAULT_GROUP_STATE}
                                    objects={databaseObjects[dbName] ?? EMPTY_DATABASE_OBJECTS}
                                    schemaNodes={schemaNodes}
                                    expandedGroups={expandedGroups}
                                    expandedSchemas={expandedSchemas}
                                    loadingGroups={loadingGroups}
                                    loadingSchemas={loadingSchemas}
                                    normalized={normalized}
                                    supportsSchemas={supportsSchemas}
                                    groupConfigs={groupConfigs}
                                    selectedDatabase={selectedDatabase}
                                    selectedSchema={selectedSchema}
                                    selectedList={selectedList}
                                    selectedObject={selectedObject}
                                    onToggleDatabase={onToggleDatabase}
                                    onToggleSchema={onToggleSchema}
                                    onToggleGroup={onToggleGroup}
                                    onSelectDatabase={onSelectDatabase}
                                    onSelectSchema={onSelectSchema}
                                    onSelectList={onSelectList}
                                    onSelectObject={onSelectObject}
                                    onOpenObject={onOpenObject}
                                    onNewQuery={onNewQuery}
                                    onQuickQuery={onQuickQuery}
                                    onRenameTable={onRenameTable}
                                    onImportTable={onImportTable}
                                    filterEntries={filterEntries}
                                    getSchemaObjects={getSchemaObjects}
                                />
                            );
                        })
                    )}
                </div>
            ) : null}
        </div>
    );
}

function CatalogHeader({ catalogName, expanded, onToggle }: { catalogName: string; expanded: boolean; onToggle: () => void }) {
    const t = useTranslations('CatalogSchemaSidebar');

    return (
        <div className="flex items-center gap-2 px-2 py-1 text-xs uppercase tracking-wide text-sidebar-foreground/70">
            <button
                type="button"
                onClick={onToggle}
                className="cursor-pointer rounded p-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
    schemaNodes: SchemaNode[];
    expandedGroups: Record<string, GroupState>;
    expandedSchemas: Record<string, boolean>;
    loadingGroups: Record<string, GroupState>;
    loadingSchemas: Record<string, boolean>;
    normalized: string;
    supportsSchemas: boolean;
    groupConfigs: GroupConfig[];
    selectedDatabase?: string;
    selectedSchema?: string;
    selectedList?: SidebarListKind;
    selectedObject?: SidebarSelection;
    onToggleDatabase: (database: string) => void;
    onToggleSchema: (database: string, schema: string) => void;
    onToggleGroup: (scopeKey: string, group: keyof GroupState) => void;
    onSelectDatabase: (database: string) => void;
    onSelectSchema: (target: { database: string; schema: string }) => void;
    onSelectList: (target: SidebarListTarget) => void;
    onSelectObject: (target: SidebarObjectTarget) => void;
    onOpenObject: (target: SidebarObjectTarget) => void;
    onNewQuery?: () => void | Promise<void>;
    onQuickQuery?: (target: TableContextTarget) => void | Promise<void>;
    onRenameTable?: (target: RenameTableTarget) => void | Promise<void>;
    onImportTable?: (target: TableContextTarget) => void | Promise<void>;
    filterEntries: (entries: TargetOption[]) => TargetOption[];
    getSchemaObjects: (database: string, schema: string) => DatabaseObjects;
};

function DatabaseNode({
    dbName,
    label,
    isExpanded,
    groupState,
    objects,
    schemaNodes,
    expandedGroups,
    expandedSchemas,
    loadingGroups,
    loadingSchemas,
    normalized,
    supportsSchemas,
    groupConfigs,
    selectedDatabase,
    selectedSchema,
    selectedList,
    selectedObject,
    onToggleDatabase,
    onToggleSchema,
    onToggleGroup,
    onSelectDatabase,
    onSelectSchema,
    onSelectList,
    onSelectObject,
    onOpenObject,
    onNewQuery,
    onQuickQuery,
    onRenameTable,
    onImportTable,
    filterEntries,
    getSchemaObjects,
}: DatabaseNodeProps) {
    const t = useTranslations('CatalogSchemaSidebar');
    const isDatabaseLoading = supportsSchemas ? Boolean(loadingSchemas[dbName]) : isAnyGroupLoading(loadingGroups[dbName]);
    const isDbOnlySelected = selectedDatabase === dbName && !selectedSchema && !selectedObject;
    const visibleSchemas = schemaNodes.filter(schema => {
        if (!normalized) return true;
        if (schema.label.toLowerCase().includes(normalized) || schema.name.toLowerCase().includes(normalized)) {
            return true;
        }

        const schemaObjects = getSchemaObjects(dbName, schema.name);
        return groupConfigs.some(group => filterEntries(schemaObjects[group.key]).length > 0);
    });

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-1 px-2">
                <button
                    type="button"
                    onClick={() => onToggleDatabase(dbName)}
                    className="shrink-0 cursor-pointer rounded p-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    aria-label={`${isExpanded ? t('Collapse') : t('Expand')} ${dbName}`}
                >
                    {isExpanded && isDatabaseLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => onSelectDatabase(dbName)}
                    className={cn(
                        'flex flex-1 cursor-pointer items-center gap-1.5 truncate rounded px-2 py-1 text-left text-sm',
                        isDbOnlySelected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )}
                    title={dbName}
                >
                    <Database className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                </button>
            </div>

            {isExpanded ? (
                <div className="ml-6 space-y-1">
                    {supportsSchemas ? (
                        <>
                            {!loadingSchemas[dbName]
                                ? visibleSchemas.map(schema => {
                                      const scopeKey = buildScopeKey(dbName, schema.name);

                                      return (
                                          <SchemaNodeRow
                                              key={scopeKey}
                                              dbName={dbName}
                                              schema={schema}
                                              scopeKey={scopeKey}
                                              isExpanded={Boolean(expandedSchemas[scopeKey])}
                                              expandedGroups={expandedGroups}
                                              groupConfigs={groupConfigs}
                                              objects={getSchemaObjects(dbName, schema.name)}
                                              loadingState={loadingGroups[scopeKey] ?? DEFAULT_GROUP_STATE}
                                              normalized={normalized}
                                              selectedDatabase={selectedDatabase}
                                              selectedSchema={selectedSchema}
                                              selectedList={selectedList}
                                              selectedObject={selectedObject}
                                              onToggleSchema={onToggleSchema}
                                              onToggleGroup={onToggleGroup}
                                              onSelectSchema={onSelectSchema}
                                              onSelectList={onSelectList}
                                              onSelectObject={onSelectObject}
                                              onOpenObject={onOpenObject}
                                              onNewQuery={onNewQuery}
                                              onQuickQuery={onQuickQuery}
                                              onRenameTable={onRenameTable}
                                              onImportTable={onImportTable}
                                              filterEntries={filterEntries}
                                          />
                                      );
                                  })
                                : null}

                            {!visibleSchemas.length && !loadingSchemas[dbName] ? <div className="px-2 py-1.5 text-xs text-sidebar-foreground/70">{t('No schemas')}</div> : null}
                        </>
                    ) : (
                        <>
                            {!isAnyGroupLoading(loadingGroups[dbName])
                                ? groupConfigs.map(group => (
                                      <ObjectGroup
                                          key={`${dbName}-${group.key}`}
                                          scopeKey={dbName}
                                          dbName={dbName}
                                          group={group}
                                          objectKind={
                                              group.key === 'tables'
                                                  ? 'table'
                                                  : group.key === 'views'
                                                    ? 'view'
                                                    : group.key === 'materializedViews'
                                                      ? 'materializedView'
                                                      : 'function'
                                          }
                                          listTarget={{
                                              database: dbName,
                                              listKind: group.key,
                                          }}
                                          isExpanded={groupState[group.key]}
                                          isLoading={loadingGroups[dbName]?.[group.key] ?? false}
                                          entries={normalized ? filterEntries(objects[group.key]) : objects[group.key]}
                                          normalized={normalized}
                                          selectedDatabase={selectedDatabase}
                                          selectedSchema={selectedSchema}
                                          selectedList={selectedList}
                                          selectedObject={selectedObject}
                                          onToggle={() => onToggleGroup(dbName, group.key)}
                                          onSelectList={onSelectList}
                                          onSelectObject={onSelectObject}
                                          onOpenObject={onOpenObject}
                                          onNewQuery={onNewQuery}
                                          onQuickQuery={onQuickQuery}
                                          onRenameTable={onRenameTable}
                                          onImportTable={onImportTable}
                                      />
                                  ))
                                : null}
                        </>
                    )}
                </div>
            ) : null}
        </div>
    );
}
