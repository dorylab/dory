import type { SidebarConfig, SidebarOption, SidebarTableEntry, SidebarTableItem } from './types';

export function normalizeOption(option?: { value?: string; label?: string; name?: string } | null): SidebarOption | null {
    const value = (option?.value ?? option?.label ?? option?.name ?? '').toString();
    if (!value) return null;

    return {
        value,
        label: (option?.label ?? option?.value ?? option?.name ?? value).toString(),
    };
}

export function getInitialDatabase(databases: SidebarOption[], preferredDatabase?: string | null): string | null {
    if (preferredDatabase) {
        const matched = databases.find(database => database.value === preferredDatabase);
        if (matched) {
            return matched.value;
        }
    }

    return databases[0]?.value ?? null;
}

export function isHiddenDatabase(databaseName: string, config: SidebarConfig): boolean {
    const normalized = databaseName.trim().toLowerCase();
    return config.hiddenDatabases.some(name => name.toLowerCase() === normalized);
}

export function resolveTableValue(table: SidebarTableEntry): string {
    return (table?.value ?? table?.name ?? table?.label ?? '').toString();
}

export function resolveTableLabel(table: SidebarTableEntry): string {
    return (table?.label ?? table?.value ?? table?.name ?? '').toString();
}

export function getSchemaName(tableName: string, config: SidebarConfig): string | null {
    if (!config.supportsSchemas) return null;

    const trimmed = tableName.trim();
    if (!trimmed) return null;

    const [schemaName, ...rest] = trimmed.split('.');
    if (rest.length === 0) {
        return config.defaultSchemaName ?? null;
    }

    return schemaName || config.defaultSchemaName || null;
}

export function toSidebarTableItem(table: SidebarTableEntry, config: SidebarConfig): SidebarTableItem | null {
    const value = resolveTableValue(table);
    if (!value) return null;

    return {
        key: value,
        value,
        label: resolveTableLabel(table) || value,
        schemaName: getSchemaName(value, config),
    };
}

export function matchesFilter(value: string, label: string, filterText: string): boolean {
    if (!filterText) return true;
    const normalizedFilter = filterText.trim().toLowerCase();
    if (!normalizedFilter) return true;
    return value.toLowerCase().includes(normalizedFilter) || label.toLowerCase().includes(normalizedFilter);
}

export function buildScopedTableKey(databaseName: string, tableName: string): string {
    return `${databaseName}::${tableName}`;
}
