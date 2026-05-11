import type {
    ConnectionMetadataAPI,
    ConnectionSchemaMap,
    DatabaseFunctionMeta,
    DatabaseObjectRow,
    DatabaseSummary,
    DatabaseSummaryOptions,
    DatabaseSummaryTable,
    DatabaseRecentTable,
    TableColumnInfo,
} from '@dory/drivers/types';
import type { ClickhouseDatasource } from '../ClickhouseDatasource';

export type ClickhouseMetadataAPI = ConnectionMetadataAPI & {
    getTableColumns: (database: string, table: string) => Promise<TableColumnInfo[]>;
    getTablesOnly: (database: string) => Promise<DatabaseObjectRow[]>;
    getViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getMaterializedViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getFunctions: (database?: string) => Promise<DatabaseFunctionMeta[]>;
    getDatabaseSummary: (options: DatabaseSummaryOptions) => Promise<DatabaseSummary>;
    getDatabaseTablesDetail: (database: string) => Promise<DatabaseObjectRow[]>;
};

const VIEW_ENGINES = new Set(['VIEW', 'LIVEVIEW', 'LAZYVIEW', 'WINDOWVIEW']);
const MATERIALIZED_VIEW_ENGINES = new Set(['MATERIALIZEDVIEW']);
const DEFAULT_SUMMARY_TIMEOUT_MS = 8000;

const normalizeEngine = (value?: string | null) => (value ?? '').toString().toUpperCase();

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
}

function toIsoString(value: unknown): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

async function getDatabases(datasource: ClickhouseDatasource) {
    const result = await datasource.query<{ name: string }>('SELECT name FROM system.databases ORDER BY name');
    return result.rows.map(row => ({ value: row.name, label: row.name }));
}

async function getTables(datasource: ClickhouseDatasource, database?: string) {
    if (database) {
        const rows = await datasource.query<{ table: string; db: string }>('SELECT name AS table, database AS db FROM system.tables WHERE database = {db:String} ORDER BY name', {
            db: database,
        });
        return rows.rows.map(row => ({ value: row.table, label: row.table, database: row.db }));
    }

    const rows = await datasource.query<{ table: string; db: string }>('SELECT name AS table, database AS db FROM system.tables ORDER BY database, name');
    return rows.rows.map(row => ({ value: row.table, label: `${row.db}.${row.table}`, database: row.db }));
}

async function getSchema(datasource: ClickhouseDatasource, database?: string): Promise<ConnectionSchemaMap> {
    const targetDatabase = database?.trim();
    const schemaSql = targetDatabase
        ? `
            SELECT
                table AS tableName,
                name AS columnName
            FROM system.columns
            WHERE database = {db:String}
            ORDER BY table, position
        `
        : `
            SELECT
                table AS tableName,
                name AS columnName
            FROM system.columns
            ORDER BY table, position
        `;

    const result = await datasource.query<{ tableName?: string; columnName?: string }>(schemaSql, targetDatabase ? { db: targetDatabase } : undefined);
    const rows = Array.isArray(result.rows) ? result.rows : [];

    return rows.reduce<ConnectionSchemaMap>((schema, row) => {
        const tableName = row?.tableName?.trim();
        const columnName = row?.columnName?.trim();
        if (!tableName || !columnName) {
            return schema;
        }
        if (!schema[tableName]) {
            schema[tableName] = [];
        }
        schema[tableName].push(columnName);
        return schema;
    }, {});
}

async function getTableColumns(datasource: ClickhouseDatasource, database: string, table: string): Promise<TableColumnInfo[]> {
    const columnsQuery = `
        SELECT
            name AS columnName,
            type AS columnType,
            default_kind AS defaultKind,
            default_expression AS defaultExpression,
            is_in_primary_key AS isPrimaryKey,
            comment
        FROM system.columns
        WHERE database = {db:String}
          AND table = {tbl:String}
        ORDER BY position
    `;

    const result = await datasource.query<TableColumnInfo>(columnsQuery, { db: database, tbl: table });
    return Array.isArray(result.rows) ? result.rows : [];
}

async function getDatabaseSummary(datasource: ClickhouseDatasource, options: DatabaseSummaryOptions): Promise<DatabaseSummary> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_SUMMARY_TIMEOUT_MS;
    const baseSummary: DatabaseSummary = {
        databaseName: options.database,
        catalogName: options.catalogName ?? null,
        schemaName: options.schemaName ?? null,
        engine: options.engine ?? 'clickhouse',
        cluster: options.cluster ?? null,
        owner: null,
        tablesCount: null,
        viewsCount: null,
        materializedViewsCount: null,
        functionsCount: null,
        totalBytes: null,
        totalRowsEstimate: null,
        lastUpdatedAt: null,
        lastQueriedAt: null,
        tableSizeDistribution: {
            smallTablesCount: null,
            mediumTablesCount: null,
            largeTablesCount: null,
        },
        columnComplexity: {
            averageColumnsPerTable: null,
            maxColumns: null,
            maxColumnsTable: null,
        },
        foreignKeyLinksCount: null,
        relationshipPaths: [],
        detectedPatterns: [],
        coreTables: [],
        topTablesByBytes: [],
        topTablesByRows: [],
        recentTables: [],
        startHere: [],
        oneLineSummary: null,
    };

    const summarySql = `
        SELECT
            sum(total_bytes) AS totalBytes,
            sum(total_rows) AS totalRows,
            sumIf(1, NOT has([${Array.from(VIEW_ENGINES)
                .map(engine => `'${engine}'`)
                .join(',')}], upper(engine))) AS tablesCount,
            sumIf(1, has([${Array.from(VIEW_ENGINES)
                .map(engine => `'${engine}'`)
                .join(',')}], upper(engine))) AS viewsCount,
            sumIf(1, has([${Array.from(MATERIALIZED_VIEW_ENGINES)
                .map(engine => `'${engine}'`)
                .join(',')}], upper(engine))) AS materializedViewsCount,
            max(metadata_modification_time) AS lastUpdatedAt
        FROM system.tables
        WHERE database = {db:String}
    `;

    const topTablesSql = `
        SELECT
            name,
            total_bytes AS bytes,
            total_rows AS rowsEstimate,
            comment
        FROM system.tables
        WHERE database = {db:String}
          AND NOT has([${Array.from(VIEW_ENGINES)
              .map(engine => `'${engine}'`)
              .join(',')}], upper(engine))
          AND NOT has([${Array.from(MATERIALIZED_VIEW_ENGINES)
              .map(engine => `'${engine}'`)
              .join(',')}], upper(engine))
        ORDER BY total_bytes DESC
        LIMIT 5
    `;

    const topRowsSql = `
        SELECT
            name,
            total_bytes AS bytes,
            total_rows AS rowsEstimate,
            comment
        FROM system.tables
        WHERE database = {db:String}
          AND NOT has([${Array.from(VIEW_ENGINES)
              .map(engine => `'${engine}'`)
              .join(',')}], upper(engine))
          AND NOT has([${Array.from(MATERIALIZED_VIEW_ENGINES)
              .map(engine => `'${engine}'`)
              .join(',')}], upper(engine))
        ORDER BY total_rows DESC
        LIMIT 5
    `;

    const recentTablesSql = `
        SELECT
            name,
            metadata_modification_time AS lastUpdatedAt
        FROM system.tables
        WHERE database = {db:String}
        ORDER BY metadata_modification_time DESC
        LIMIT 5
    `;

    const lastQueriedSql = `
        SELECT max(event_time) AS lastQueriedAt
        FROM system.query_log
        WHERE current_database = {db:String}
          AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
    `;

    const [summaryResult, topBytesResult, topRowsResult, recentResult, lastQueriedResult] = await Promise.allSettled([
        withTimeout(datasource.query(summarySql, { db: options.database }), timeoutMs, 'clickhouse summary'),
        withTimeout(datasource.query<DatabaseSummaryTable>(topTablesSql, { db: options.database }), timeoutMs, 'clickhouse top tables by bytes'),
        withTimeout(datasource.query<DatabaseSummaryTable>(topRowsSql, { db: options.database }), timeoutMs, 'clickhouse top tables by rows'),
        withTimeout(datasource.query<{ name?: string; lastUpdatedAt?: string | null }>(recentTablesSql, { db: options.database }), timeoutMs, 'clickhouse recent tables'),
        withTimeout(datasource.query<{ lastQueriedAt?: string | null }>(lastQueriedSql, { db: options.database }), timeoutMs, 'clickhouse last queried'),
    ]);

    const summaryRow = summaryResult.status === 'fulfilled' ? (summaryResult.value.rows?.[0] ?? {}) : {};
    const topTablesByBytes =
        topBytesResult.status === 'fulfilled'
            ? (topBytesResult.value.rows ?? []).map(row => ({
                  name: row.name,
                  bytes: toNumberOrNull((row as any).bytes),
                  rowsEstimate: toNumberOrNull((row as any).rowsEstimate),
                  comment: row.comment ?? null,
              }))
            : [];
    const topTablesByRows =
        topRowsResult.status === 'fulfilled'
            ? (topRowsResult.value.rows ?? []).map(row => ({
                  name: row.name,
                  bytes: toNumberOrNull((row as any).bytes),
                  rowsEstimate: toNumberOrNull((row as any).rowsEstimate),
                  comment: row.comment ?? null,
              }))
            : [];
    const recentTables =
        recentResult.status === 'fulfilled'
            ? (recentResult.value.rows ?? [])
                  .map(row => ({
                      name: row?.name ?? '',
                      lastUpdatedAt: toIsoString((row as any)?.lastUpdatedAt),
                  }))
                  .filter(row => row.name)
            : [];
    const lastQueriedAt = lastQueriedResult.status === 'fulfilled' ? toIsoString(lastQueriedResult.value.rows?.[0]?.lastQueriedAt) : null;

    return {
        ...baseSummary,
        tablesCount: toNumberOrNull((summaryRow as any)?.tablesCount),
        viewsCount: toNumberOrNull((summaryRow as any)?.viewsCount),
        materializedViewsCount: toNumberOrNull((summaryRow as any)?.materializedViewsCount),
        totalBytes: toNumberOrNull((summaryRow as any)?.totalBytes),
        totalRowsEstimate: toNumberOrNull((summaryRow as any)?.totalRows),
        lastUpdatedAt: toIsoString((summaryRow as any)?.lastUpdatedAt),
        lastQueriedAt,
        topTablesByBytes,
        topTablesByRows,
        recentTables,
    };
}

async function getDatabaseTablesDetail(datasource: ClickhouseDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const sql = `
        SELECT
            name,
            engine,
            total_bytes AS totalBytes,
            total_rows AS totalRows,
            comment,
            toString(metadata_modification_time) AS lastModified
        FROM system.tables
        WHERE database = {db:String}
        ORDER BY name
    `;

    const result = await datasource.query<DatabaseObjectRow>(sql, { db: database });
    return Array.isArray(result.rows) ? result.rows : [];
}

async function getTablesOnly(datasource: ClickhouseDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => {
        const engine = normalizeEngine(row.engine);
        return !VIEW_ENGINES.has(engine) && !MATERIALIZED_VIEW_ENGINES.has(engine);
    });
}

async function getViews(datasource: ClickhouseDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => VIEW_ENGINES.has(normalizeEngine(row.engine)));
}

async function getMaterializedViews(datasource: ClickhouseDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => MATERIALIZED_VIEW_ENGINES.has(normalizeEngine(row.engine)));
}

async function getFunctions(datasource: ClickhouseDatasource, database?: string) {
    const sql = database ? 'SELECT name FROM system.user_defined_functions WHERE database = {db:String} ORDER BY name' : 'SELECT name FROM system.functions ORDER BY name';
    const result = await datasource.query<{ name?: string }>(sql, database ? { db: database } : undefined);
    return (Array.isArray(result.rows) ? result.rows : [])
        .map(row => row?.name)
        .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        .map(name => ({ label: name, value: name }));
}

export function createClickhouseMetadataCapability(datasource: ClickhouseDatasource): ClickhouseMetadataAPI {
    return {
        getDatabases: () => getDatabases(datasource),
        getTables: database => getTables(datasource, database),
        getSchema: database => getSchema(datasource, database),
        getTableColumns: (database, table) => getTableColumns(datasource, database, table),
        getTablesOnly: database => getTablesOnly(datasource, database),
        getViews: database => getViews(datasource, database),
        getMaterializedViews: database => getMaterializedViews(datasource, database),
        getFunctions: database => getFunctions(datasource, database),
        getDatabaseSummary: options => getDatabaseSummary(datasource, options),
        getDatabaseTablesDetail: database => getDatabaseTablesDetail(datasource, database),
    };
}
