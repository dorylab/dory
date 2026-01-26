import { ClickhouseDatasource } from '../ClickhouseDatasource';

type DatabaseTableRow = {
    name: string;
    engine?: string | null;
    totalBytes?: number | null;
    totalRows?: number | null;
    comment?: string | null;
    lastModified?: string | null;
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

export type DatabaseSummary = {
    databaseName: string;
    catalogName: string | null;
    schemaName: string | null;
    engine: 'clickhouse' | 'doris' | 'mysql' | 'unknown';
    cluster: string | null;
    tablesCount: number | null;
    viewsCount: number | null;
    materializedViewsCount: number | null;
    totalBytes: number | null;
    totalRowsEstimate: number | null;
    lastUpdatedAt: string | null;
    lastQueriedAt: string | null;
    topTablesByBytes: DatabaseSummaryTable[];
    topTablesByRows: DatabaseSummaryTable[];
    recentTables: DatabaseRecentTable[];
    oneLineSummary: string | null;
};

type CatalogItem = {
    label: string;
    value: string;
};

const VIEW_ENGINES = new Set(['VIEW', 'LIVEVIEW', 'LAZYVIEW', 'WINDOWVIEW']);
const MATERIALIZED_VIEW_ENGINES = new Set(['MATERIALIZEDVIEW']);

const normalizeEngine = (value?: string | null) => (value ?? '').toString().toUpperCase();
const DEFAULT_SUMMARY_TIMEOUT_MS = 8000;

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

export async function getDatabaseSummary(
    datasource: ClickhouseDatasource,
    options: {
        database: string;
        catalogName?: string | null;
        schemaName?: string | null;
        engine?: DatabaseSummary['engine'];
        cluster?: string | null;
        timeoutMs?: number;
    },
): Promise<DatabaseSummary> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_SUMMARY_TIMEOUT_MS;
    const baseSummary: DatabaseSummary = {
        databaseName: options.database,
        catalogName: options.catalogName ?? null,
        schemaName: options.schemaName ?? null,
        engine: options.engine ?? 'clickhouse',
        cluster: options.cluster ?? null,
        tablesCount: null,
        viewsCount: null,
        materializedViewsCount: null,
        totalBytes: null,
        totalRowsEstimate: null,
        lastUpdatedAt: null,
        lastQueriedAt: null,
        topTablesByBytes: [],
        topTablesByRows: [],
        recentTables: [],
        oneLineSummary: null,
    };

    const summarySql = `
        SELECT
            sum(total_bytes) AS totalBytes,
            sum(total_rows) AS totalRows,
            sumIf(1, NOT has([${Array.from(VIEW_ENGINES).map(engine => `'${engine}'`).join(',')}], upper(engine))) AS tablesCount,
            sumIf(1, has([${Array.from(VIEW_ENGINES).map(engine => `'${engine}'`).join(',')}], upper(engine))) AS viewsCount,
            sumIf(1, has([${Array.from(MATERIALIZED_VIEW_ENGINES).map(engine => `'${engine}'`).join(',')}], upper(engine))) AS materializedViewsCount,
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
          AND NOT has([${Array.from(VIEW_ENGINES).map(engine => `'${engine}'`).join(',')}], upper(engine))
          AND NOT has([${Array.from(MATERIALIZED_VIEW_ENGINES).map(engine => `'${engine}'`).join(',')}], upper(engine))
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
          AND NOT has([${Array.from(VIEW_ENGINES).map(engine => `'${engine}'`).join(',')}], upper(engine))
          AND NOT has([${Array.from(MATERIALIZED_VIEW_ENGINES).map(engine => `'${engine}'`).join(',')}], upper(engine))
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
        withTimeout(
            datasource.query<{ name?: string; lastUpdatedAt?: string | null }>(recentTablesSql, { db: options.database }),
            timeoutMs,
            'clickhouse recent tables',
        ),
        withTimeout(
            datasource.query<{ lastQueriedAt?: string | null }>(lastQueriedSql, { db: options.database }),
            timeoutMs,
            'clickhouse last queried',
        ),
    ]);

    const summaryRow = summaryResult.status === 'fulfilled' ? summaryResult.value.rows?.[0] ?? {} : {};
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
    const lastQueriedAt =
        lastQueriedResult.status === 'fulfilled'
            ? toIsoString(lastQueriedResult.value.rows?.[0]?.lastQueriedAt)
            : null;

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

function toCatalogItems(names: string[]): CatalogItem[] {
    return names.map(name => ({ label: name, value: name }));
}

export async function getTablesOnly(datasource: ClickhouseDatasource, database: string): Promise<DatabaseTableRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => {
        const engine = normalizeEngine(row.engine);
        return !VIEW_ENGINES.has(engine) && !MATERIALIZED_VIEW_ENGINES.has(engine);
    });
}

export async function getViews(datasource: ClickhouseDatasource, database: string): Promise<DatabaseTableRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => VIEW_ENGINES.has(normalizeEngine(row.engine)));
}

export async function getMaterializedViews(datasource: ClickhouseDatasource, database: string): Promise<DatabaseTableRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => MATERIALIZED_VIEW_ENGINES.has(normalizeEngine(row.engine)));
}

export async function getFunctions(datasource: ClickhouseDatasource, database?: string): Promise<CatalogItem[]> {
    const sql = database
        ? 'SELECT name FROM system.user_defined_functions WHERE database = {db:String} ORDER BY name'
        : 'SELECT name FROM system.functions ORDER BY name';
    const result = await datasource.query<{ name?: string }>(sql, database ? { db: database } : undefined);
    const names = (Array.isArray(result.rows) ? result.rows : [])
        .map(row => row?.name)
        .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

    return toCatalogItems(names);
}

export async function getDatabaseTablesDetail(
    datasource: ClickhouseDatasource,
    database: string,
): Promise<DatabaseTableRow[]> {
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

    const result = await datasource.query<DatabaseTableRow>(sql, { db: database });
    return Array.isArray(result.rows) ? result.rows : [];
}
