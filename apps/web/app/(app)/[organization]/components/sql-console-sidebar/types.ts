import type { ConnectionType } from '@/types/connections';

export type TableColumn = {
    columnName: string;
    columnType: string;
};

export type SidebarOption = {
    value: string;
    label: string;
};

export type SidebarTableEntry = {
    value?: string;
    label?: string;
    name?: string;
    database?: string;
};

export type SidebarTableItem = {
    key: string;
    value: string;
    label: string;
    schemaName: string | null;
};

export type TableActionPayload = {
    database?: string;
    tableName: string;
    tabLabel?: string;
};

export type SQLConsoleSidebarProps = {
    onOpenTableTab?: (payload: TableActionPayload) => void;
    onSelectTable?: (payload: TableActionPayload) => void;
    onSelectDatabase?: (database: string) => void;
    selectedTable?: string;
    selectedDatabase?: string;
};

export type SidebarConfig = {
    dialect: ConnectionType | 'default';
    supportsSchemas: boolean;
    defaultSchemaName?: string;
    hiddenDatabases: readonly string[];
};
