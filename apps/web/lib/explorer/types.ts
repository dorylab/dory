export const DEFAULT_EXPLORER_CATALOG = 'default';

export type ExplorerDriver =
    | 'postgres'
    | 'clickhouse'
    | 'mysql'
    | 'doris'
    | 'duckdb'
    | 'sqlite'
    | 'trino'
    | 'unknown';

export type ExplorerObjectKind =
    | 'database'
    | 'schema'
    | 'table'
    | 'view'
    | 'materializedView'
    | 'function'
    | 'sequence'
    | 'dictionary'
    | 'procedure';

export type ExplorerListKind =
    | 'tables'
    | 'views'
    | 'materializedViews'
    | 'functions'
    | 'sequences'
    | 'dictionaries'
    | 'procedures'
    | 'schemas';

export type ExplorerBaseParams = {
    organization: string;
    connectionId: string;
    catalog?: string;
};

export type ExplorerDatabaseResource = {
    kind: 'database';
    database: string;
};

export type ExplorerSchemaResource = {
    kind: 'schema';
    database: string;
    schema: string;
};

export type ExplorerListResource = {
    kind: 'list';
    database: string;
    schema?: string;
    listKind: ExplorerListKind;
};

export type ExplorerObjectResource = {
    kind: 'object';
    database: string;
    schema?: string;
    objectKind: Exclude<ExplorerObjectKind, 'database' | 'schema'>;
    name: string;
};

export type ExplorerResource =
    | ExplorerDatabaseResource
    | ExplorerSchemaResource
    | ExplorerListResource
    | ExplorerObjectResource;

export type ExplorerPageType = 'root' | 'namespace' | 'schemaSummary' | 'object' | 'notFound';

export type BreadcrumbItem = {
    label: string;
    href: string;
};

export type ParsedExplorerSlug = {
    catalog: string;
    segments: string[];
    resource?: ExplorerResource;
    recognized: boolean;
};

export type ExplorerResolvedRoute = {
    catalog: string;
    slug: string[];
    normalizedSlug: string[];
    driver: ExplorerDriver;
    resource?: ExplorerResource;
    pageType: ExplorerPageType;
    recognized: boolean;
    isValid: boolean;
};
