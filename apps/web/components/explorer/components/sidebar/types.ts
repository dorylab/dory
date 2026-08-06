import type { ExplorerListKind, ExplorerObjectKind } from '@/lib/explorer/types';

export type TargetOption = {
    label?: string;
    value?: string;
    name?: string;
    schema?: string;
    [key: string]: unknown;
};

export type SidebarObjectKind = Extract<ExplorerObjectKind, 'table' | 'view' | 'materializedView' | 'function'>;
export type SidebarListKind = Extract<ExplorerListKind, 'tables' | 'views' | 'materializedViews' | 'functions'>;

export type SidebarSelection = {
    schema?: string;
    name: string;
    objectKind: SidebarObjectKind;
};

export type SidebarSchemaTarget = {
    database: string;
    schema: string;
};

export type SidebarListTarget = {
    database: string;
    schema?: string;
    listKind: SidebarListKind;
};

export type SidebarObjectTarget = {
    database: string;
    schema?: string;
    objectKind: SidebarObjectKind;
    name: string;
    label?: string;
};

export type SidebarImportTarget = {
    database: string;
    schema?: string;
    table: string;
};

export type GroupState = {
    tables: boolean;
    materializedViews: boolean;
    views: boolean;
    functions: boolean;
};

export type DatabaseObjects = {
    tables: TargetOption[];
    materializedViews: TargetOption[];
    views: TargetOption[];
    functions: TargetOption[];
};

export type SchemaNode = {
    name: string;
    label: string;
    system?: boolean;
};

export const DEFAULT_GROUP_STATE: GroupState = {
    tables: false,
    materializedViews: false,
    views: false,
    functions: false,
};

export const EMPTY_DATABASE_OBJECTS: DatabaseObjects = {
    tables: [],
    materializedViews: [],
    views: [],
    functions: [],
};
