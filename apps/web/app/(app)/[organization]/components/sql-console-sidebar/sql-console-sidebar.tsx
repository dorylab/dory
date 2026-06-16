'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslations } from 'next-intl';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { useDatabases } from '@/hooks/use-databases';
import { useTables } from '@/hooks/use-tables';
import { useColumns } from '@/hooks/use-columns';
import { useSchemas } from '@/hooks/use-schemas';
import { activeDatabaseAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { DatabaseSelect } from './database-select';
import { getSidebarConfig } from './sidebar-config';
import { SchemaSelect } from './schema-select';
import { TableList } from './table-list';
import type { RenameTablePayload, SQLConsoleSidebarProps, SidebarOption, SidebarTableItem, TableActionPayload, TableColumn } from './types';
import { buildScopedTableKey, getInitialDatabase, isHiddenDatabase, matchesFilter, normalizeOption, toSidebarTableItem } from './utils';

function parseConnectionOptions(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw !== 'string') return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

function isLocalFilesDatasetConnection(options: Record<string, unknown>) {
    return options.managedBy === 'local-files' && options.mode === 'localFilesDataset';
}

function getOpenFilesTableLabel(tableName: string) {
    const parts = tableName.split('.');
    return parts[parts.length - 1] || tableName;
}

export function SQLConsoleSidebar({
    onOpenTableTab,
    onOpenQueryConsole,
    onQueryTable,
    onRenameTable,
    onSelectTable,
    selectedTable,
    selectedDatabase,
    onSelectDatabase,
}: SQLConsoleSidebarProps) {
    const [localFilter, setFilter] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const deferredFilter = useDeferredValue(localFilter);
    const [activeDatabase, setActiveDatabase] = useAtom(activeDatabaseAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const t = useTranslations('SQLConsoleSidebar');
    const sidebarConfig = useMemo(() => getSidebarConfig(currentConnection?.connection?.type), [currentConnection?.connection?.type]);
    const isLocalFilesDataset = useMemo(
        () => isLocalFilesDatasetConnection(parseConnectionOptions(currentConnection?.connection?.options)),
        [currentConnection?.connection?.options],
    );

    const { databases, loading: databasesLoading, error: databasesError } = useDatabases();

    const databaseOptions = useMemo(
        () =>
            (databases ?? [])
                .map(database => normalizeOption(database))
                .filter((database): database is SidebarOption => Boolean(database))
                .filter(database => !isHiddenDatabase(database.value, sidebarConfig)),
        [databases, sidebarConfig],
    );

    useEffect(() => {
        if (!databaseOptions.length) return;
        const initialDatabase = getInitialDatabase(databaseOptions, currentConnection?.connection?.database);
        if (!initialDatabase) return;

        const hasActiveDatabase = activeDatabase && databaseOptions.some(database => database.value === activeDatabase);
        if (hasActiveDatabase) return;

        setActiveDatabase(initialDatabase);
        onSelectDatabase?.(initialDatabase);
    }, [activeDatabase, currentConnection?.connection?.database, databaseOptions, onSelectDatabase, setActiveDatabase, sidebarConfig]);

    const { tables, loading: tablesLoading, refresh: refreshTables } = useTables(activeDatabase);
    const { schemas, refresh: refreshSchemas } = useSchemas(activeDatabase, sidebarConfig.supportsSchemas);
    const { refresh: getTableColumns } = useColumns();

    const [activeSchema, setActiveSchema] = useState('');
    const [expandedTableKeys, setExpandedTableKeys] = useState<Set<string>>(new Set());
    const [columnsByTableKey, setColumnsByTableKey] = useState<Record<string, TableColumn[]>>({});
    const [loadingTableKeys, setLoadingTableKeys] = useState<Set<string>>(new Set());

    const schemaOptions = useMemo(() => schemas.toSorted((left, right) => left.label.localeCompare(right.label)), [schemas]);
    const preferredSchema = useMemo(() => {
        const defaultIdentity = currentConnection?.identities?.find(identity => identity.isDefault) ?? currentConnection?.identities?.[0];
        return defaultIdentity?.username?.trim() || sidebarConfig.defaultSchemaName || '';
    }, [currentConnection?.identities, sidebarConfig.defaultSchemaName]);

    useEffect(() => {
        if (!sidebarConfig.supportsSchemas) {
            if (activeSchema) {
                setActiveSchema('');
            }
            return;
        }

        if (schemaOptions.length === 0) {
            if (activeSchema) {
                setActiveSchema('');
            }
            return;
        }

        if (activeSchema && schemaOptions.some(schema => schema.value === activeSchema)) {
            return;
        }

        const defaultSchema =
            schemaOptions.find(schema => schema.value.toLowerCase() === preferredSchema.toLowerCase())?.value ??
            schemaOptions.find(schema => schema.value === sidebarConfig.defaultSchemaName)?.value ??
            schemaOptions[0]?.value ??
            '';
        setActiveSchema(defaultSchema);
    }, [activeSchema, preferredSchema, schemaOptions, sidebarConfig.defaultSchemaName, sidebarConfig.supportsSchemas]);

    const filteredTables = useMemo(() => {
        const normalizedFilter = deferredFilter.trim().toLowerCase();

        return (tables ?? [])
            .map(table => toSidebarTableItem(table, sidebarConfig))
            .filter((table): table is SidebarTableItem => Boolean(table))
            .map(table => (isLocalFilesDataset ? { ...table, label: getOpenFilesTableLabel(table.value) } : table))
            .map(table => ({
                ...table,
                key: buildScopedTableKey(activeDatabase, table.value),
            }))
            .filter(table => {
                if (!sidebarConfig.supportsSchemas || !activeSchema) {
                    return true;
                }

                return table.schemaName === activeSchema;
            })
            .filter(table => matchesFilter(table.value, table.label, normalizedFilter));
    }, [activeDatabase, activeSchema, deferredFilter, isLocalFilesDataset, sidebarConfig, tables]);

    const handleDatabaseChange = (database: string) => {
        setActiveDatabase(database);
        setActiveSchema('');
        onSelectDatabase?.(database);
    };

    const handleRefresh = async () => {
        if (!activeDatabase || isRefreshing) {
            return;
        }

        setIsRefreshing(true);
        setExpandedTableKeys(new Set());
        setColumnsByTableKey({});
        setLoadingTableKeys(new Set());

        try {
            await Promise.all([refreshTables(), sidebarConfig.supportsSchemas ? refreshSchemas() : Promise.resolve()]);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleRenameTable = async (payload: RenameTablePayload) => {
        await onRenameTable?.(payload);
        setExpandedTableKeys(prev => {
            const next = new Set(prev);
            if (payload.database) {
                next.delete(buildScopedTableKey(payload.database, payload.tableName));
            }
            return next;
        });
        setColumnsByTableKey(prev => {
            if (!payload.database) return prev;
            const next = { ...prev };
            delete next[buildScopedTableKey(payload.database, payload.tableName)];
            return next;
        });
        await refreshTables();
    };

    const toTableActionPayload = (table: SidebarTableItem): TableActionPayload => ({
        database: activeDatabase,
        schema: table.schemaName,
        tableName: table.value,
        tabLabel: table.label,
    });

    const toggleTableExpansion = async (table: SidebarTableItem) => {
        const scopedTableKey = table.key;

        setExpandedTableKeys(prev => {
            const next = new Set(prev);
            if (next.has(scopedTableKey)) {
                next.delete(scopedTableKey);
                return next;
            }

            next.add(scopedTableKey);
            return next;
        });

        if (columnsByTableKey[scopedTableKey]) {
            return;
        }

        setLoadingTableKeys(prev => {
            const next = new Set(prev);
            next.add(scopedTableKey);
            return next;
        });

        try {
            const columns = await getTableColumns(activeDatabase, table.value);
            setColumnsByTableKey(prev => ({
                ...prev,
                [scopedTableKey]: columns || [],
            }));
        } catch (error) {
            console.error(`Failed to fetch columns for ${table.value}:`, error);
        } finally {
            setLoadingTableKeys(prev => {
                const next = new Set(prev);
                next.delete(scopedTableKey);
                return next;
            });
        }
    };

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 p-3">
            {!isLocalFilesDataset && (
                <DatabaseSelect value={activeDatabase} databases={databaseOptions} onChange={handleDatabaseChange} loading={databasesLoading} error={databasesError} />
            )}

            {sidebarConfig.supportsSchemas && <SchemaSelect value={activeSchema} schemas={schemaOptions} onChange={setActiveSchema} />}

            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={localFilter} onChange={e => setFilter(e.target.value)} placeholder={t('Filter tables')} className="h-8 pl-8" aria-label={t('Filter tables')} />
                </div>

                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="h-8 w-8 shrink-0"
                    onClick={() => void handleRefresh()}
                    disabled={!activeDatabase || isRefreshing}
                    aria-label={t('Refresh tables')}
                    title={t('Refresh tables')}
                >
                    {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
            </div>

            <TableList
                tables={filteredTables}
                loading={tablesLoading}
                activeDatabase={activeDatabase}
                selectedTable={selectedTable}
                selectedDatabase={selectedDatabase}
                expandedTableKeys={expandedTableKeys}
                loadingTableKeys={loadingTableKeys}
                columnsByTableKey={columnsByTableKey}
                onToggleTable={toggleTableExpansion}
                onSelectTable={onSelectTable}
                onOpenTableTab={onOpenTableTab}
                onOpenQueryConsole={onOpenQueryConsole}
                onQueryTable={onQueryTable}
                onRenameTable={handleRenameTable}
                getTableActionPayload={toTableActionPayload}
                t={t}
            />
        </div>
    );
}
