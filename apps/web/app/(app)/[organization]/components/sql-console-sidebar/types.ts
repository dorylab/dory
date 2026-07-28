import type { ConnectionType } from '@dory/shared/types/connections';

export type TableColumn = {
    columnName: string;
    columnType: string;
    defaultKind?: string | null;
    defaultExpression?: string | null;
    isPrimaryKey?: boolean | number | string | null;
    nullable?: boolean | number | string | null;
    isNullable?: boolean | number | string | null;
    comment?: string | null;
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
    schema?: string | null;
    tableName: string;
    tabLabel?: string;
};

export type RenameTablePayload = TableActionPayload & {
    nextName: string;
};

export type SQLConsoleSidebarProps = {
    onOpenTableTab?: (payload: TableActionPayload) => void;
    onOpenQueryConsole?: () => void | Promise<void>;
    onQueryTable?: (payload: TableActionPayload) => void | Promise<void>;
    onRenameTable?: (payload: RenameTablePayload) => void | Promise<void>;
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
