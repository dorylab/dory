'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useAtom, useAtomValue } from 'jotai';
import { useParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Input } from '@/registry/new-york-v4/ui/input';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { useDatabases } from '@/hooks/use-databases';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import { activeDatabaseAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { CatalogSchemaTree } from './catalog-schema-sidebar-tree';
import { DEFAULT_GROUP_STATE, EMPTY_DATABASE_OBJECTS } from './types';
import type { DatabaseObjects, GroupState, TargetOption } from './types';

type CatalogSchemaSidebarProps = {
    catalogName?: string;
    onOpenTableTab?: (payload: { database?: string; tableName: string; tabLabel?: string }) => void;
    onSelectTable?: (payload: { database?: string; tableName: string; tabLabel?: string }) => void;
    onSelectDatabase?: (database: string) => void;
    selectedTable?: string;
    selectedDatabase?: string;
};

const STALE_TIME = 1000 * 60 * 5;
const GC_TIME = STALE_TIME * 2;
const GROUP_ENDPOINTS = {
    tables: 'tables',
    materializedViews: 'materialized-views',
    views: 'views',
} as const;
const GROUP_KEYS = Object.keys(GROUP_ENDPOINTS) as (keyof GroupState)[];

function resolveParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
}

function normalizeEntry(entry: TargetOption): TargetOption | null {
    const value = (entry.value ?? entry.label ?? entry.name ?? '').toString();
    if (!value) return null;
    const label = (entry.label ?? entry.value ?? entry.name ?? value).toString();
    return { ...entry, value, label };
}

function normalizeEntries(entries: TargetOption[]): TargetOption[] {
    return entries
        .map(entry => normalizeEntry(entry))
        .filter((entry): entry is TargetOption => Boolean(entry));
}

export function CatalogSchemaSidebar({
    catalogName = 'default',
    onOpenTableTab,
    onSelectTable,
    onSelectDatabase,
    selectedTable,
    selectedDatabase,
}: CatalogSchemaSidebarProps) {
    const [localFilter, setFilter] = useState('');
    const deferredFilter = useDeferredValue(localFilter);
    const [, setActiveDatabase] = useAtom(activeDatabaseAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const t = useTranslations('CatalogSchemaSidebar');
    const params = useParams<{ connectionId?: string | string[] }>();
    const connectionId = resolveParam(params?.connectionId) ?? currentConnection?.connection?.id;
    const connectionType = currentConnection?.connection?.type;
    const showCatalog = connectionType !== 'clickhouse';

    const { databases } = useDatabases();

    const [expandedCatalog, setExpandedCatalog] = useState(false);
    const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Record<string, GroupState>>({});
    const skipAutoExpandRef = useRef(false);
    const databaseEntries = useMemo(() => {
        return (databases ?? [])
            .map(db => {
                const dbName = db?.value ?? db?.label ?? '';
                return {
                    dbName,
                    label: db?.label ?? dbName,
                };
            })
            .filter(entry => entry.dbName);
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

    const groupQueries = useQueries({
        queries: databaseEntries.flatMap(entry =>
            GROUP_KEYS.map(group => ({
                queryKey: ['catalog-db-group', connectionId, entry.dbName, group] as const,
                queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<TargetOption[]> => {
                    if (!connectionId) return [];
                    const encodedDb = encodeURIComponent(entry.dbName);
                    try {
                        const response = await authFetch(
                            `/api/connection/${connectionId}/databases/${encodedDb}/${GROUP_ENDPOINTS[group]}`,
                            {
                                method: 'GET',
                                signal,
                                headers: {
                                    'X-Connection-ID': connectionId,
                                },
                            },
                        );
                        const payload = (await response.json()) as ResponseObject<TargetOption[]>;
                        if (!isSuccess(payload)) return [];
                        return normalizeEntries(payload.data ?? []);
                    } catch (error) {
                        console.error('Failed to load database objects:', error);
                        return [];
                    }
                },
                enabled:
                    Boolean(connectionId) &&
                    expandedDatabases.has(entry.dbName) &&
                    (expandedGroups[entry.dbName]?.[group] ?? false),
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
            GROUP_KEYS.forEach(group => {
                const data = groupQueries[index]?.data;
                if (Array.isArray(data)) {
                    objects[group] = data;
                }
                index += 1;
            });
            next[entry.dbName] = objects;
        });
        return next;
    }, [databaseEntries, groupQueries]);

    const loadingGroups = useMemo(() => {
        const next: Record<string, GroupState> = {};
        let index = 0;
        databaseEntries.forEach(entry => {
            const groupLoading: GroupState = { ...DEFAULT_GROUP_STATE };
            GROUP_KEYS.forEach(group => {
                groupLoading[group] = Boolean(groupQueries[index]?.isFetching);
                index += 1;
            });
            next[entry.dbName] = groupLoading;
        });
        return next;
    }, [databaseEntries, groupQueries]);

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

    const toggleDatabase = useCallback(
        (database: string) => {
            setExpandedDatabases(prev => {
                const next = new Set(prev);
                if (next.has(database)) {
                    next.delete(database);
                } else {
                    next.add(database);
                }
                return next;
            });
        },
        [],
    );

    const toggleGroup = useCallback((database: string, group: keyof GroupState) => {
        setExpandedGroups(prev => {
            const current = prev[database] ?? DEFAULT_GROUP_STATE;
            return {
                ...prev,
                [database]: {
                    ...current,
                    [group]: !current[group],
                },
            };
        });
    }, []);

    const filteredDatabases = useMemo(() => {
        if (!normalized) return databases ?? [];
        return (databases ?? []).filter(db => {
            const dbName = (db?.value ?? db?.label ?? '').toString();
            if (dbName.toLowerCase().includes(normalized)) return true;
            const objects = databaseObjects[dbName];
            if (!objects) return false;
            return (
                filterEntries(objects.tables).length > 0 ||
                filterEntries(objects.materializedViews).length > 0 ||
                filterEntries(objects.views).length > 0
            );
        });
    }, [databaseObjects, databases, filterEntries, normalized]);

    const hasAnyResults = useMemo(() => {
        if (!normalized) return true;
        return filteredDatabases.length > 0;
    }, [filteredDatabases.length, normalized]);

    return (
        <div className="flex flex-col h-full min-h-0 gap-2 p-3 w-full min-w-0">
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    value={localFilter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder={t('Filter tables or views')}
                    className="pl-8 h-8"
                    aria-label={t('Filter tables or views')}
                />
            </div>

            <ScrollArea className="flex-1 space-y-2 min-h-0 mt-1">
                <CatalogSchemaTree
                    catalogName={catalogName}
                    showCatalog={showCatalog}
                    expandedCatalog={expandedCatalog}
                    filteredDatabases={filteredDatabases}
                    expandedDatabases={expandedDatabases}
                    expandedGroups={expandedGroups}
                    databaseObjects={databaseObjects}
                    loadingGroups={loadingGroups}
                    normalized={normalized}
                    hasAnyResults={hasAnyResults}
                    selectedDatabase={selectedDatabase}
                    selectedTable={selectedTable}
                    onToggleCatalog={() => setExpandedCatalog(prev => !prev)}
                    onToggleDatabase={toggleDatabase}
                    onToggleGroup={toggleGroup}
                    onSelectDatabase={dbName => {
                        skipAutoExpandRef.current = true;
                        setActiveDatabase(dbName);
                        onSelectDatabase?.(dbName);
                    }}
                    onSelectObject={payload => {
                        setActiveDatabase(payload.database);
                        onSelectTable?.(payload);
                    }}
                    onOpenObject={payload => {
                        setActiveDatabase(payload.database);
                        onOpenTableTab?.(payload);
                    }}
                    filterEntries={filterEntries}
                />
            </ScrollArea>
        </div>
    );
}
