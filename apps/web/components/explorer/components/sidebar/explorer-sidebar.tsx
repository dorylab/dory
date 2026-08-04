'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useAtom, useAtomValue } from 'jotai';
import { useParams } from 'next/navigation';
import { Eye, Loader2, Search, Table } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@dory/web-utils';
import { Input } from '@/registry/new-york-v4/ui/input';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { useDatabases } from '@/hooks/use-databases';
import { getSidebarConfig } from '@/app/(app)/[organization]/components/sql-console-sidebar/sidebar-config';
import { executeActionClient } from '@/lib/actions/client';
import { getDriverCapabilities } from '@/lib/explorer/capabilities';
import { isLocalFilesDataset } from '@/lib/explorer/local-files';
import { activeDatabaseAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { ExplorerSidebarTree } from './explorer-sidebar-tree';
import { buildLocalFilesSidebarModel } from './local-files-sidebar';
import { DEFAULT_GROUP_STATE, EMPTY_DATABASE_OBJECTS } from './types';
import type {
    DatabaseObjects,
    GroupState,
    SchemaNode,
    SidebarImportTarget,
    SidebarListKind,
    SidebarListTarget,
    SidebarObjectTarget,
    SidebarSelection,
    TargetOption,
} from './types';

type ExplorerSidebarProps = {
    catalogName?: string;
    onSelectDatabase?: (database: string) => void;
    onSelectSchema?: (target: { database: string; schema: string }) => void;
    onSelectList?: (target: SidebarListTarget) => void;
    onSelectObject?: (target: SidebarObjectTarget) => void;
    onOpenObject?: (target: SidebarObjectTarget) => void;
    onImportTable?: (target: SidebarImportTarget) => void;
    selectedDatabase?: string;
    selectedSchema?: string;
    selectedList?: SidebarListKind;
    selectedObject?: SidebarSelection;
};

const STALE_TIME = 1000 * 60 * 5;
const GC_TIME = STALE_TIME * 2;
const GROUP_ENDPOINTS = {
    tables: 'tables',
    views: 'views',
    materializedViews: 'materialized-views',
    functions: 'functions',
} as const;
const GROUP_KEYS = Object.keys(GROUP_ENDPOINTS) as (keyof GroupState)[];
const GROUP_ACTIONS = {
    tables: { id: 'schema.listTables', key: 'tables' },
    views: { id: 'schema.listViews', key: 'views' },
    materializedViews: { id: 'schema.listMaterializedViews', key: 'materializedViews' },
    functions: { id: 'schema.listFunctions', key: 'functions' },
} as const;

function resolveParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
}

function buildScopeKey(database: string, schema?: string) {
    return schema ? `${database}::${schema}` : database;
}

function normalizeEntry(entry: TargetOption): TargetOption | null {
    const value = (entry.value ?? entry.label ?? entry.name ?? '').toString();
    if (!value) return null;

    return {
        ...entry,
        value,
        label: (entry.label ?? entry.value ?? entry.name ?? value).toString(),
    };
}

function normalizeEntries(entries: TargetOption[]): TargetOption[] {
    return entries.map(entry => normalizeEntry(entry)).filter((entry): entry is TargetOption => Boolean(entry));
}

function resolveSchemaName(entry: TargetOption, defaultSchemaName?: string | null) {
    if (typeof entry.schema === 'string' && entry.schema.trim()) {
        return entry.schema.trim();
    }

    const rawValue = (entry.value ?? entry.label ?? entry.name ?? '').toString().trim();
    if (!rawValue) {
        return defaultSchemaName ?? null;
    }

    const [schemaName, ...rest] = rawValue.split('.');
    if (rest.length === 0) {
        return defaultSchemaName ?? null;
    }

    return schemaName || defaultSchemaName || null;
}

export function ExplorerSidebar({
    catalogName = 'default',
    onSelectDatabase,
    onSelectSchema,
    onSelectList,
    onSelectObject,
    onOpenObject,
    onImportTable,
    selectedDatabase,
    selectedSchema,
    selectedList,
    selectedObject,
}: ExplorerSidebarProps) {
    const [localFilter, setFilter] = useState('');
    const deferredFilter = useDeferredValue(localFilter);
    const [, setActiveDatabase] = useAtom(activeDatabaseAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const t = useTranslations('CatalogSchemaSidebar');
    const params = useParams<{ connectionId?: string | string[] }>();
    const connectionId = resolveParam(params?.connectionId) ?? currentConnection?.connection?.id;
    const connectionType = currentConnection?.connection?.type;
    const isLocalFilesExplorer = currentConnection?.connection?.id === connectionId && isLocalFilesDataset(currentConnection?.connection?.options);
    const sidebarConfig = useMemo(() => getSidebarConfig(connectionType), [connectionType]);
    const supportedGroupKeys = useMemo(() => GROUP_KEYS.filter(group => getDriverCapabilities(connectionType).listKinds.includes(group)), [connectionType]);
    const supportsSchemas = sidebarConfig.supportsSchemas;
    const defaultSchemaName = sidebarConfig.defaultSchemaName ?? 'public';
    const showCatalog = false; // For now, we are hiding the catalog level as it's not commonly used and adds extra complexity to the UI. We can revisit this decision in the future if needed.

    const { databases, loading: databasesLoading } = useDatabases();

    const [expandedCatalog, setExpandedCatalog] = useState(false);
    const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Record<string, GroupState>>({});
    const [expandedSchemas, setExpandedSchemas] = useState<Record<string, boolean>>({});
    const skipAutoExpandRef = useRef(false);
    const lastAutoExpandedTargetRef = useRef<string | null>(null);

    const databaseEntries = useMemo(() => {
        return (databases ?? [])
            .map(db => {
                const dbName = (db?.value ?? db?.label ?? '').toString();
                return dbName
                    ? {
                          label: (db?.label ?? dbName).toString(),
                          value: dbName,
                      }
                    : null;
            })
            .filter((entry): entry is { label: string; value: string } => Boolean(entry));
    }, [databases]);

    const normalized = deferredFilter.trim().toLowerCase();

    const filterEntries = useCallback(
        (entries: TargetOption[]) => {
            if (!normalized) return entries;
            return entries.filter(entry => {
                const label = (entry.label ?? entry.value ?? entry.name ?? '').toString().toLowerCase();
                return label.includes(normalized);
            });
        },
        [normalized],
    );

    const schemaQueries = useQueries({
        queries: databaseEntries.map(entry => ({
            queryKey: ['catalog-db-schemas', connectionId, entry.value] as const,
            queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<TargetOption[]> => {
                if (!connectionId || !supportsSchemas) return [];

                try {
                    const payload = await executeActionClient<TargetOption[]>(
                        'schema.listSchemas',
                        { connectionId, database: entry.value },
                        { currentConnectionId: connectionId, signal },
                    );
                    return normalizeEntries(payload ?? []);
                } catch (error) {
                    console.error('Failed to load schemas:', error);
                    return [];
                }
            },
            enabled: Boolean(connectionId) && supportsSchemas && expandedDatabases.has(entry.value),
            staleTime: STALE_TIME,
            gcTime: GC_TIME,
        })),
    });

    const groupQueries = useQueries({
        queries: databaseEntries.flatMap(entry =>
            supportedGroupKeys.map(group => ({
                queryKey: ['catalog-db-group', connectionId, entry.value, group] as const,
                queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<TargetOption[]> => {
                    if (!connectionId) return [];

                    try {
                        const action = GROUP_ACTIONS[group];
                        const payload = await executeActionClient<Record<string, TargetOption[]>>(
                            action.id,
                            { connectionId, database: entry.value },
                            { currentConnectionId: connectionId, signal },
                        );
                        return normalizeEntries(payload?.[action.key] ?? []);
                    } catch (error) {
                        console.error('Failed to load database objects:', error);
                        return [];
                    }
                },
                enabled: (() => {
                    if (!connectionId || (!isLocalFilesExplorer && !expandedDatabases.has(entry.value))) return false;
                    if (isLocalFilesExplorer) return true;
                    if (!supportsSchemas) {
                        return true;
                    }

                    return Object.entries(expandedSchemas).some(([scopeKey, expanded]) => {
                        return expanded && scopeKey.startsWith(`${entry.value}::`);
                    });
                })(),
                staleTime: STALE_TIME,
                gcTime: GC_TIME,
            })),
        ),
    });

    const databaseObjects = useMemo(() => {
        const next: Record<string, DatabaseObjects> = {};
        let index = 0;

        databaseEntries.forEach(entry => {
            const objects: DatabaseObjects = { ...EMPTY_DATABASE_OBJECTS };

            supportedGroupKeys.forEach(group => {
                const data = groupQueries[index]?.data;
                if (Array.isArray(data)) {
                    objects[group] = data;
                }
                index += 1;
            });

            next[entry.value] = objects;
        });

        return next;
    }, [databaseEntries, groupQueries, supportedGroupKeys]);

    const loadingGroups = useMemo(() => {
        const next: Record<string, GroupState> = {};
        let index = 0;

        databaseEntries.forEach(entry => {
            const databaseLoading: GroupState = { ...DEFAULT_GROUP_STATE };

            supportedGroupKeys.forEach(group => {
                databaseLoading[group] = Boolean(groupQueries[index]?.isFetching);
                index += 1;
            });

            next[entry.value] = databaseLoading;

            Object.entries(expandedSchemas).forEach(([scopeKey, expanded]) => {
                if (!expanded || !scopeKey.startsWith(`${entry.value}::`)) return;
                next[scopeKey] = databaseLoading;
            });
        });

        return next;
    }, [databaseEntries, expandedSchemas, groupQueries, isLocalFilesExplorer, supportedGroupKeys]);

    const databaseSchemas = useMemo(() => {
        const next: Record<string, SchemaNode[]> = {};

        databaseEntries.forEach((entry, index) => {
            const schemaEntries = supportsSchemas ? (schemaQueries[index]?.data ?? []) : [];
            const seen = new Set<string>();
            const nodes: SchemaNode[] = [];

            schemaEntries.forEach(schema => {
                const value = (schema.value ?? schema.label ?? schema.name ?? '').toString().trim();
                if (!value || seen.has(value)) return;
                seen.add(value);
                nodes.push({
                    name: value,
                    label: (schema.label ?? value).toString(),
                });
            });

            next[entry.value] = nodes;
        });

        return next;
    }, [databaseEntries, schemaQueries, supportsSchemas]);

    const loadingSchemas = useMemo(() => {
        const next: Record<string, boolean> = {};
        databaseEntries.forEach((entry, index) => {
            next[entry.value] = Boolean(schemaQueries[index]?.isFetching);
        });
        return next;
    }, [databaseEntries, schemaQueries]);

    const schemaObjectsByDatabase = useMemo(() => {
        if (!supportsSchemas) return {};

        const next: Record<string, Record<string, DatabaseObjects>> = {};

        databaseEntries.forEach(entry => {
            const perSchema: Record<string, DatabaseObjects> = {};
            const objects = databaseObjects[entry.value] ?? EMPTY_DATABASE_OBJECTS;

            supportedGroupKeys.forEach(group => {
                objects[group].forEach(item => {
                    const schemaName = resolveSchemaName(item, defaultSchemaName);
                    if (!schemaName) return;

                    if (!perSchema[schemaName]) {
                        perSchema[schemaName] = {
                            tables: [],
                            views: [],
                            materializedViews: [],
                            functions: [],
                        };
                    }

                    perSchema[schemaName][group].push(item);
                });
            });

            next[entry.value] = perSchema;
        });

        return next;
    }, [databaseEntries, databaseObjects, defaultSchemaName, supportedGroupKeys, supportsSchemas]);

    useEffect(() => {
        if (!selectedDatabase) return;
        if (skipAutoExpandRef.current) {
            skipAutoExpandRef.current = false;
            return;
        }

        setExpandedDatabases(prev => {
            if (prev.has(selectedDatabase)) return prev;
            const next = new Set(prev);
            next.add(selectedDatabase);
            return next;
        });
    }, [selectedDatabase]);

    useEffect(() => {
        if (!isLocalFilesExplorer) return;
        const database = selectedDatabase ?? databaseEntries[0]?.value;
        if (!database) return;

        setExpandedGroups(prev => {
            const current = prev[database] ?? DEFAULT_GROUP_STATE;
            if (current.views || current.tables) return prev;
            return {
                ...prev,
                [database]: {
                    ...current,
                    tables: true,
                    views: true,
                },
            };
        });
    }, [databaseEntries, isLocalFilesExplorer, selectedDatabase]);

    useEffect(() => {
        if (!selectedDatabase) return;

        if (!supportsSchemas) {
            const targetKey = selectedObject?.name ? `${selectedDatabase}::${selectedObject.objectKind}::${selectedObject.name}` : selectedDatabase;
            if (lastAutoExpandedTargetRef.current === targetKey) return;
            lastAutoExpandedTargetRef.current = targetKey;

            setExpandedGroups(prev => {
                const current = prev[selectedDatabase] ?? DEFAULT_GROUP_STATE;
                if (current.tables) return prev;
                return {
                    ...prev,
                    [selectedDatabase]: {
                        ...current,
                        tables: true,
                    },
                };
            });
            return;
        }

        const selectedDatabaseSchemas = databaseSchemas[selectedDatabase] ?? [];
        const schemaToExpand =
            selectedSchema ?? selectedObject?.schema ?? selectedDatabaseSchemas.find(schema => schema.name === defaultSchemaName)?.name ?? selectedDatabaseSchemas[0]?.name;

        if (!schemaToExpand) return;

        const scopeKey = buildScopeKey(selectedDatabase, schemaToExpand);
        const targetKey = [selectedDatabase, schemaToExpand, selectedList ?? '', selectedObject?.objectKind ?? '', selectedObject?.schema ?? '', selectedObject?.name ?? ''].join(
            '::',
        );

        if (lastAutoExpandedTargetRef.current === targetKey) return;
        lastAutoExpandedTargetRef.current = targetKey;

        setExpandedSchemas(prev => {
            if (prev[scopeKey]) return prev;
            return {
                ...prev,
                [scopeKey]: true,
            };
        });

        setExpandedGroups(prev => {
            const current = prev[scopeKey] ?? DEFAULT_GROUP_STATE;
            if (current.tables) return prev;
            return {
                ...prev,
                [scopeKey]: {
                    ...current,
                    tables: true,
                },
            };
        });
    }, [
        databaseSchemas,
        defaultSchemaName,
        selectedDatabase,
        selectedList,
        selectedObject?.name,
        selectedObject?.objectKind,
        selectedObject?.schema,
        selectedSchema,
        supportsSchemas,
    ]);

    const toggleDatabase = useCallback((database: string) => {
        setExpandedDatabases(prev => {
            const next = new Set(prev);
            if (next.has(database)) {
                next.delete(database);
            } else {
                next.add(database);
            }
            return next;
        });
    }, []);

    const toggleSchema = useCallback((database: string, schema: string) => {
        const scopeKey = buildScopeKey(database, schema);
        setExpandedSchemas(prev => ({
            ...prev,
            [scopeKey]: !prev[scopeKey],
        }));
    }, []);

    const toggleGroup = useCallback((scopeKey: string, group: keyof GroupState) => {
        setExpandedGroups(prev => {
            const current = prev[scopeKey] ?? DEFAULT_GROUP_STATE;
            return {
                ...prev,
                [scopeKey]: {
                    ...current,
                    [group]: !current[group],
                },
            };
        });
    }, []);

    const filteredDatabases = useMemo(() => {
        if (!normalized) return databaseEntries;

        return databaseEntries.filter(db => {
            if (db.label.toLowerCase().includes(normalized) || db.value.toLowerCase().includes(normalized)) {
                return true;
            }

            const schemas = databaseSchemas[db.value] ?? [];
            if (schemas.some(schema => schema.label.toLowerCase().includes(normalized) || schema.name.toLowerCase().includes(normalized))) {
                return true;
            }

            const objects = databaseObjects[db.value];
            if (!objects) return false;

            return supportedGroupKeys.some(group => filterEntries(objects[group]).length > 0);
        });
    }, [databaseEntries, databaseObjects, databaseSchemas, filterEntries, normalized, supportedGroupKeys]);

    const hasAnyResults = useMemo(() => {
        if (!normalized) return true;
        return filteredDatabases.length > 0;
    }, [filteredDatabases.length, normalized]);

    const getSchemaObjects = useCallback(
        (database: string, schema: string): DatabaseObjects => {
            return schemaObjectsByDatabase[database]?.[schema] ?? EMPTY_DATABASE_OBJECTS;
        },
        [schemaObjectsByDatabase],
    );

    const localFilesModel = buildLocalFilesSidebarModel({
        selectedDatabase,
        selectedObject,
        databaseEntries,
        databaseObjects,
        loadingGroups,
        normalizedFilter: normalized,
    });

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 p-3">
            <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={localFilter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder={t('Filter tables or views')}
                    className="h-8 pl-8"
                    aria-label={t('Filter tables or views')}
                />
            </div>

            <ScrollArea className="mt-1 min-h-0 flex-1 w-[calc(100%+0.75rem)] -mr-3 space-y-2">
                <div className="pr-3">
                    {databasesLoading && databaseEntries.length === 0 ? (
                        <div className="space-y-3 px-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Skeleton className="h-3.5 w-3.5 rounded" />
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                    <div className="ml-6 space-y-1.5">
                                        <Skeleton className="h-3 w-20" />
                                        <Skeleton className="h-3 w-28" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : isLocalFilesExplorer ? (
                        localFilesModel.database ? (
                            <div className="space-y-1">
                                {localFilesModel.loading ? (
                                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Loading
                                    </div>
                                ) : null}
                                {!localFilesModel.loading && localFilesModel.items.length
                                    ? localFilesModel.items.map(item => {
                                          const Icon = item.objectKind === 'table' ? Table : Eye;

                                          return (
                                              <button
                                                  key={item.key}
                                                  type="button"
                                                  className={cn(
                                                      'flex w-full cursor-pointer items-center gap-2 truncate rounded px-2 py-1 text-left text-sm',
                                                      item.selected
                                                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                                                          : 'text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                                  )}
                                                  onClick={() => {
                                                      setActiveDatabase(item.target.database);
                                                      onSelectObject?.(item.target);
                                                  }}
                                                  onDoubleClick={() => {
                                                      setActiveDatabase(item.target.database);
                                                      onOpenObject?.(item.target);
                                                  }}
                                                  title={item.label}
                                              >
                                                  <Icon className="h-3.5 w-3.5 shrink-0" />
                                                  <span className="truncate">{item.label}</span>
                                              </button>
                                          );
                                      })
                                    : null}
                                {!localFilesModel.loading && !localFilesModel.items.length ? (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground" aria-live="polite">
                                        {t('No matching objects found')}
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground" aria-live="polite">
                                {t('No matching objects found')}
                            </div>
                        )
                    ) : (
                        <ExplorerSidebarTree
                            catalogName={catalogName}
                            groupKeys={supportedGroupKeys}
                            showCatalog={showCatalog}
                            expandedCatalog={expandedCatalog}
                            filteredDatabases={filteredDatabases}
                            expandedDatabases={expandedDatabases}
                            expandedGroups={expandedGroups}
                            expandedSchemas={expandedSchemas}
                            databaseObjects={databaseObjects}
                            databaseSchemas={databaseSchemas}
                            loadingGroups={loadingGroups}
                            loadingSchemas={loadingSchemas}
                            supportsSchemas={supportsSchemas}
                            normalized={normalized}
                            hasAnyResults={hasAnyResults}
                            selectedDatabase={selectedDatabase}
                            selectedSchema={selectedSchema}
                            selectedList={selectedList}
                            selectedObject={selectedObject}
                            onToggleCatalog={() => setExpandedCatalog(prev => !prev)}
                            onToggleDatabase={toggleDatabase}
                            onToggleGroup={toggleGroup}
                            onToggleSchema={toggleSchema}
                            onSelectDatabase={dbName => {
                                skipAutoExpandRef.current = true;
                                setActiveDatabase(dbName);

                                onSelectDatabase?.(dbName);
                            }}
                            onSelectSchema={target => {
                                setActiveDatabase(target.database);
                                onSelectSchema?.(target);
                            }}
                            onSelectList={target => {
                                setActiveDatabase(target.database);
                                onSelectList?.(target);
                            }}
                            onSelectObject={target => {
                                setActiveDatabase(target.database);
                                onSelectObject?.(target);
                            }}
                            onOpenObject={target => {
                                setActiveDatabase(target.database);
                                onOpenObject?.(target);
                            }}
                            onImportTable={connectionType === 'postgres' || connectionType === 'sqlite' ? onImportTable : undefined}
                            filterEntries={filterEntries}
                            getSchemaObjects={getSchemaObjects}
                        />
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
