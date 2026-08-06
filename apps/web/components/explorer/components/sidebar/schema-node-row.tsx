'use client';

import { ChevronDown, ChevronRight, Layers, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@dory/web-utils';
import type { RenameTableTarget, TableContextTarget } from '@/components/table-context-menu/types';
import { ObjectGroup } from './object-group';
import { DEFAULT_GROUP_STATE } from './types';
import type { DatabaseObjects, GroupState, SchemaNode, SidebarListKind, SidebarListTarget, SidebarObjectTarget, SidebarSelection, TargetOption } from './types';
import type { GroupConfig } from './object-group';

type SchemaNodeRowProps = {
    dbName: string;
    schema: SchemaNode;
    scopeKey: string;
    isExpanded: boolean;
    expandedGroups: Record<string, GroupState>;
    groupConfigs: GroupConfig[];
    objects: DatabaseObjects;
    loadingState: GroupState;
    normalized: string;
    selectedDatabase?: string;
    selectedSchema?: string;
    selectedList?: SidebarListKind;
    selectedObject?: SidebarSelection;
    onToggleSchema: (database: string, schema: string) => void;
    onToggleGroup: (scopeKey: string, group: keyof GroupState) => void;
    onSelectSchema: (target: { database: string; schema: string }) => void;
    onSelectList: (target: SidebarListTarget) => void;
    onSelectObject: (target: SidebarObjectTarget) => void;
    onOpenObject: (target: SidebarObjectTarget) => void;
    onNewQuery?: () => void | Promise<void>;
    onQuickQuery?: (target: TableContextTarget) => void | Promise<void>;
    onRenameTable?: (target: RenameTableTarget) => void | Promise<void>;
    onImportTable?: (target: TableContextTarget) => void | Promise<void>;
    filterEntries: (entries: TargetOption[]) => TargetOption[];
};

export function SchemaNodeRow({
    dbName,
    schema,
    scopeKey,
    isExpanded,
    expandedGroups,
    groupConfigs,
    objects,
    loadingState,
    normalized,
    selectedDatabase,
    selectedSchema,
    selectedList,
    selectedObject,
    onToggleSchema,
    onToggleGroup,
    onSelectSchema,
    onSelectList,
    onSelectObject,
    onOpenObject,
    onNewQuery,
    onQuickQuery,
    onRenameTable,
    onImportTable,
    filterEntries,
}: SchemaNodeRowProps) {
    const t = useTranslations('CatalogSchemaSidebar');
    const groupState = expandedGroups[scopeKey] ?? DEFAULT_GROUP_STATE;
    const isLoading = Object.values(loadingState).some(Boolean);
    const isSelected = !selectedObject && selectedDatabase === dbName && selectedSchema === schema.name;

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-1 px-2">
                <button
                    type="button"
                    onClick={() => onToggleSchema(dbName, schema.name)}
                    className="shrink-0 cursor-pointer rounded p-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    aria-label={`${isExpanded ? t('Collapse') : t('Expand')} ${schema.label}`}
                >
                    {isExpanded && isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => onSelectSchema({ database: dbName, schema: schema.name })}
                    className={cn(
                        'flex flex-1 cursor-pointer items-center gap-1.5 truncate rounded px-2 py-1 text-left text-sm',
                        isSelected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )}
                >
                    <Layers className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{schema.label}</span>
                </button>
            </div>

            {isExpanded ? (
                <div className="ml-6 space-y-1">
                    {!isLoading
                        ? groupConfigs.map(group => (
                              <ObjectGroup
                                  key={`${scopeKey}-${group.key}`}
                                  scopeKey={scopeKey}
                                  dbName={dbName}
                                  group={group}
                                  objectKind={
                                      group.key === 'tables' ? 'table' : group.key === 'views' ? 'view' : group.key === 'materializedViews' ? 'materializedView' : 'function'
                                  }
                                  listTarget={{
                                      database: dbName,
                                      schema: schema.name,
                                      listKind: group.key,
                                  }}
                                  fallbackSchema={schema.name}
                                  isExpanded={groupState[group.key]}
                                  isLoading={loadingState[group.key]}
                                  entries={normalized ? filterEntries(objects[group.key]) : objects[group.key]}
                                  normalized={normalized}
                                  selectedDatabase={selectedDatabase}
                                  selectedSchema={selectedSchema}
                                  selectedList={selectedList}
                                  selectedObject={selectedObject}
                                  onToggle={() => onToggleGroup(scopeKey, group.key)}
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
                </div>
            ) : null}
        </div>
    );
}
