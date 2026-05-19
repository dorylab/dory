import type { QueryInsightsFilters, QueryInsightsRow, QueryInsightsSummary, QueryTimelinePoint } from './monitoring';
import type { TableIndexInfo, TablePropertiesRow, TableStats } from './table-info';
export * from './monitoring';
export * from './postgres-family';
export * from './privilege-utils';
export * from './privileges';
export * from './table-info';

export const DEFAULT_MAX_RESULT_ROWS = 10000;
export const DEFAULT_TABLE_PREVIEW_LIMIT = 200;

export type DriverType = 'clickhouse' | 'duckdb' | 'mariadb' | 'mysql' | 'neon' | 'oracle' | 'postgres' | 'sqlite' | 'sqlserver';
export type ConnectionType = DriverType;

export interface DriverConfig {
    id: string; // datasource_id
    type: DriverType;
    host: string;
    port?: number | string;
    username?: string;
    password?: string;
    database?: string; // Default database
    path?: string;
    options?: Record<string, any>; // Extra driver options (TLS, schema, account, settings)
    configVersion?: string | number; // ✅ Optional: version awareness
    updatedAt?: string | number; // ✅ Optional: version awareness
}
export type BaseConfig = DriverConfig;

export type ColumnMeta = {
    name: string;
    type?: string;
};

export type DriverQueryContext = {
    database?: string;
    schema?: string;
    queryId?: string;
    statementTimeoutMs?: number;
};
export type ConnectionQueryContext = DriverQueryContext;

export interface DriverQueryResult<Row = any> {
    rows: Row[];
    rowCount?: number;
    limited?: boolean;
    limit?: number;
    columns?: ColumnMeta[];
    tookMs?: number;
    statistics?: Record<string, unknown>;
}
export type QueryResult<Row = any> = DriverQueryResult<Row>;

export interface DriverHealthInfo {
    ok: boolean;
    message?: string;
    tookMs?: number;
}
export type HealthInfo = DriverHealthInfo;

export interface DatabaseMeta {
    label: string;
    value: string;
}

export interface TableMeta {
    label: string;
    value: string;
    database?: string;
    schema?: string;
}

export type ConnectionSchemaMap = Record<string, string[]>;

export type TableColumnInfo = {
    columnName: string;
    columnType?: string | null;
    defaultKind?: string | null;
    defaultExpression?: string | null;
    isPrimaryKey?: boolean | number | string | null;
    comment?: string | null;
};

export type DatabaseObjectRow = {
    name: string;
    label?: string;
    value?: string;
    schema?: string;
    engine?: string | null;
    totalBytes?: number | null;
    totalRows?: number | null;
    comment?: string | null;
    lastModified?: string | null;
};

export type DatabaseFunctionMeta = {
    label: string;
    value: string;
    schema?: string | null;
    kind?: DatabaseFunctionKind | null;
};

export type DatabaseFunctionKind = 'scalar' | 'table' | 'aggregate' | 'procedure' | 'function' | 'unknown';

export type DatabaseFunctionParameter = {
    name: string;
    dataType: string | null;
    nullable: boolean | null;
    hasDefault?: boolean | null;
    mode?: 'in' | 'out' | 'inout' | 'return' | 'unknown' | null;
};

export type DatabaseFunctionReturnColumn = {
    name: string;
    dataType: string | null;
    nullable: boolean | null;
};

export type DatabaseFunctionDependency = {
    name: string;
    schema?: string | null;
    type?: string | null;
};

export type DatabaseFunctionDetail = {
    name: string;
    schema?: string | null;
    qualifiedName: string;
    kind: DatabaseFunctionKind;
    signature: string | null;
    owner: string | null;
    createdAt: string | null;
    modifiedAt: string | null;
    parameters: DatabaseFunctionParameter[];
    returnType: string | null;
    returnColumns: DatabaseFunctionReturnColumn[];
    definition: string | null;
    sampleCallSql: string | null;
    dependencies: DatabaseFunctionDependency[];
    usedBy: DatabaseFunctionDependency[];
};

export type DatabaseExtensionMeta = {
    name: string;
    schema?: string | null;
    version?: string | null;
    relocatable?: boolean | null;
    comment?: string | null;
};

export type DatabaseSummaryTable = {
    name: string;
    bytes: number | null;
    rowsEstimate: number | null;
    comment: string | null;
};

export type DatabaseRecentTable = {
    name: string;
    lastUpdatedAt: string | null;
};

export type DatabaseSummaryDistribution = {
    smallTablesCount: number | null;
    mediumTablesCount: number | null;
    largeTablesCount: number | null;
};

export type DatabaseSummaryColumnComplexity = {
    averageColumnsPerTable: number | null;
    maxColumns: number | null;
    maxColumnsTable: string | null;
};

export type DatabaseSummaryRelationshipPath = {
    path: string;
};

export type DatabaseSummaryPattern = {
    label: string;
    kind: 'domain' | 'partition';
};

export type DatabaseSummaryRecommendation = {
    name: string;
    reason: 'centralAndHighRowVolume' | 'centralAndHighStorage' | 'centralInRelationships' | 'highRowVolume' | 'largeStorageFootprint' | 'recentlyUpdated' | 'goodStartingPoint';
    bytes: number | null;
    rowsEstimate: number | null;
};

export type DatabaseSummaryEngine = 'clickhouse' | 'doris' | 'duckdb' | 'mariadb' | 'mysql' | 'oracle' | 'postgres' | 'sqlite' | 'sqlserver' | 'unknown';

export type DatabaseSummary = {
    databaseName: string;
    catalogName: string | null;
    schemaName: string | null;
    engine: DatabaseSummaryEngine;
    cluster: string | null;
    owner: string | null;
    tablesCount: number | null;
    viewsCount: number | null;
    materializedViewsCount: number | null;
    functionsCount: number | null;
    totalBytes: number | null;
    totalRowsEstimate: number | null;
    lastUpdatedAt: string | null;
    lastQueriedAt: string | null;
    tableSizeDistribution: DatabaseSummaryDistribution;
    columnComplexity: DatabaseSummaryColumnComplexity;
    foreignKeyLinksCount: number | null;
    relationshipPaths: DatabaseSummaryRelationshipPath[];
    detectedPatterns: DatabaseSummaryPattern[];
    coreTables: DatabaseSummaryRecommendation[];
    topTablesByBytes: DatabaseSummaryTable[];
    topTablesByRows: DatabaseSummaryTable[];
    recentTables: DatabaseRecentTable[];
    startHere: DatabaseSummaryRecommendation[];
    oneLineSummary: string | null;
};

export type DatabaseSummaryOptions = {
    database: string;
    catalogName?: string | null;
    schemaName?: string | null;
    engine?: DatabaseSummaryEngine;
    cluster?: string | null;
    timeoutMs?: number;
};

export type Pagination = {
    pageIndex: number;
    pageSize: number;
};

export type TablePreviewOptions = {
    limit?: number;
    offset?: number;
};

export type QueryInsightsImpl = {
    summary: (filters: QueryInsightsFilters) => Promise<QueryInsightsSummary>;
    timeline: (filters: QueryInsightsFilters) => Promise<QueryTimelinePoint[]>;
    queryLogs: (filters: QueryInsightsFilters, pagination?: Pagination) => Promise<{ rows: QueryInsightsRow[]; total: number }>;
    recentQueries: (filters: QueryInsightsFilters, options?: { limit?: number }) => Promise<QueryInsightsRow[]>;
    slowQueries: (filters: QueryInsightsFilters, pagination?: Pagination) => Promise<{ rows: QueryInsightsRow[]; total: number }>;
    errorQueries: (filters: QueryInsightsFilters, pagination?: Pagination) => Promise<{ rows: QueryInsightsRow[]; total: number }>;
};

export type QueryInsightsAPI = QueryInsightsImpl;
export type GetTableInfoAPI = {
    properties: (database: string, table: string) => Promise<TablePropertiesRow | null>;
    ddl: (database: string, table: string) => Promise<string | null>;
    stats: (database: string, table: string) => Promise<TableStats | null>;
    preview: (database: string, table: string, options?: TablePreviewOptions) => Promise<QueryResult<Record<string, unknown>>>;
    indexes?: (database: string, table: string) => Promise<TableIndexInfo[]>;
};

export type ConnectionMetadataAPI = {
    getDatabases: () => Promise<DatabaseMeta[]>;
    getTables: (database?: string) => Promise<TableMeta[]>;
    getSchemas?: (database: string) => Promise<DatabaseMeta[]>;
    getSchema?: (database?: string) => Promise<ConnectionSchemaMap>;
    getTableColumns?: (database: string, table: string) => Promise<TableColumnInfo[]>;
    getTablesOnly?: (database: string) => Promise<DatabaseObjectRow[]>;
    getViews?: (database: string) => Promise<DatabaseObjectRow[]>;
    getMaterializedViews?: (database: string) => Promise<DatabaseObjectRow[]>;
    getFunctions?: (database?: string) => Promise<DatabaseFunctionMeta[]>;
    getFunctionDetail?: (database: string, functionName: string, schema?: string | null) => Promise<DatabaseFunctionDetail | null>;
    getSequences?: (database?: string) => Promise<DatabaseObjectRow[]>;
    getExtensions?: (database?: string) => Promise<DatabaseExtensionMeta[]>;
    getDatabaseSummary?: (options: DatabaseSummaryOptions) => Promise<DatabaseSummary>;
    getDatabaseTablesDetail?: (database: string) => Promise<DatabaseObjectRow[]>;
};

export type ConnectionCapabilities = {
    metadata?: ConnectionMetadataAPI;
    queryInsights?: QueryInsightsAPI;
    tableInfo?: GetTableInfoAPI;
    privileges?: Record<string, unknown>;
};
export type DriverCapabilities = ConnectionCapabilities;

export function hasMetadataCapability<K extends keyof ConnectionMetadataAPI>(
    metadata: ConnectionMetadataAPI | undefined,
    capability: K,
): metadata is ConnectionMetadataAPI & Required<Pick<ConnectionMetadataAPI, K>> {
    return Boolean(metadata && typeof metadata[capability] === 'function');
}

export function hasTableInfoCapability<K extends keyof GetTableInfoAPI>(
    tableInfo: GetTableInfoAPI | undefined,
    capability: K,
): tableInfo is GetTableInfoAPI & Required<Pick<GetTableInfoAPI, K>> {
    return Boolean(tableInfo && typeof tableInfo[capability] === 'function');
}
