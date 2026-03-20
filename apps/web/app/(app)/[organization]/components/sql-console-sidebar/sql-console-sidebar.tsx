'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslations } from 'next-intl';
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
import type { SQLConsoleSidebarProps, SidebarOption, SidebarTableItem, TableColumn } from './types';
import { buildScopedTableKey, getInitialDatabase, isHiddenDatabase, matchesFilter, normalizeOption, toSidebarTableItem } from './utils';

export function SQLConsoleSidebar({ onOpenTableTab, onSelectTable, selectedTable, selectedDatabase, onSelectDatabase }: SQLConsoleSidebarProps) {
    const [localFilter, setFilter] = useState('');
    const deferredFilter = useDeferredValue(localFilter);
    const [activeDatabase, setActiveDatabase] = useAtom(activeDatabaseAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const t = useTranslations('SQLConsoleSidebar');
    const sidebarConfig = useMemo(() => getSidebarConfig(currentConnection?.connection?.type), [currentConnection?.connection?.type]);

    const { databases } = useDatabases();

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

    const { tables } = useTables(activeDatabase);
    const { schemas } = useSchemas(activeDatabase, sidebarConfig.supportsSchemas);
    const { refresh: getTableColumns } = useColumns();

    const [activeSchema, setActiveSchema] = useState('');
    const [expandedTableKeys, setExpandedTableKeys] = useState<Set<string>>(new Set());
    const [columnsByTableKey, setColumnsByTableKey] = useState<Record<string, TableColumn[]>>({});
    const [loadingTableKeys, setLoadingTableKeys] = useState<Set<string>>(new Set());

    const schemaOptions = useMemo(() => schemas.toSorted((left, right) => left.label.localeCompare(right.label)), [schemas]);

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

        const defaultSchema = schemaOptions.find(schema => schema.value === sidebarConfig.defaultSchemaName)?.value ?? schemaOptions[0]?.value ?? '';
        setActiveSchema(defaultSchema);
    }, [activeSchema, schemaOptions, sidebarConfig.defaultSchemaName, sidebarConfig.supportsSchemas]);

    const filteredTables = useMemo(() => {
        const normalizedFilter = deferredFilter.trim().toLowerCase();

        return (tables ?? [])
            .map(table => toSidebarTableItem(table, sidebarConfig))
            .filter((table): table is SidebarTableItem => Boolean(table))
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
    }, [activeSchema, deferredFilter, sidebarConfig, tables]);

    const handleDatabaseChange = (database: string) => {
        setActiveDatabase(database);
        setActiveSchema('');
        onSelectDatabase?.(database);
    };

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
            <DatabaseSelect value={activeDatabase} databases={databaseOptions} onChange={handleDatabaseChange} />

            <SchemaSelect value={activeSchema} schemas={schemaOptions} onChange={setActiveSchema} />

            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={localFilter} onChange={e => setFilter(e.target.value)} placeholder={t('Filter tables')} className="pl-8 h-8" aria-label={t('Filter tables')} />
            </div>

            <TableList
                tables={filteredTables}
                activeDatabase={activeDatabase}
                selectedTable={selectedTable}
                selectedDatabase={selectedDatabase}
                expandedTableKeys={expandedTableKeys}
                loadingTableKeys={loadingTableKeys}
                columnsByTableKey={columnsByTableKey}
                onToggleTable={toggleTableExpansion}
                onSelectTable={onSelectTable}
                onOpenTableTab={onOpenTableTab}
                t={t}
            />
        </div>
    );
}
