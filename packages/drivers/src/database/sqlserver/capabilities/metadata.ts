import type {
    ConnectionMetadataAPI,
    ConnectionSchemaMap,
    DatabaseObjectRow,
    DatabaseSummary,
    DatabaseSummaryOptions,
    DatabaseSummaryRecommendation,
    DatabaseSummaryTable,
    TableColumnInfo,
} from '@dory/drivers/types';
import type { SqlServerDatasource } from '../SqlServerDatasource';
import { parseSqlServerTableReference } from '../sqlserver-driver';

export type SqlServerMetadataAPI = ConnectionMetadataAPI & {
    getSchemas: (database: string) => Promise<Array<{ label: string; value: string }>>;
    getTableColumns: (database: string, table: string) => Promise<TableColumnInfo[]>;
    getTablesOnly: (database: string) => Promise<DatabaseObjectRow[]>;
    getViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getFunctions: (database?: string) => Promise<Array<{ label: string; value: string }>>;
    getSequences: (database?: string) => Promise<DatabaseObjectRow[]>;
    getDatabaseSummary: (options: DatabaseSummaryOptions) => Promise<DatabaseSummary>;
    getDatabaseTablesDetail: (database: string) => Promise<DatabaseObjectRow[]>;
};

type ObjectRow = {
    schemaName?: string;
    name?: string;
    type?: string | null;
    totalRows?: number | string | null;
    totalBytes?: number | string | null;
    comment?: string | null;
    lastModified?: string | Date | null;
};

type ColumnCountRow = {
    name?: string;
    columnCount?: number | string | null;
};

type RelationshipRow = {
    sourceTableName?: string;
    targetTableName?: string;
};

const USER_OBJECTS_SQL = `
    SELECT
        s.name AS schemaName,
        o.name AS name,
        o.type_desc AS type,
        SUM(p.rows) AS totalRows,
        SUM(a.total_pages) * 8 * 1024 AS totalBytes,
        CAST(ep.value AS nvarchar(max)) AS comment,
        o.modify_date AS lastModified
    FROM sys.objects o
    JOIN sys.schemas s ON s.schema_id = o.schema_id
    LEFT JOIN sys.partitions p ON p.object_id = o.object_id AND p.index_id IN (0, 1)
    LEFT JOIN sys.allocation_units a ON a.container_id = p.partition_id
    LEFT JOIN sys.extended_properties ep
      ON ep.major_id = o.object_id
     AND ep.minor_id = 0
     AND ep.name = 'MS_Description'
    WHERE o.type IN ('U', 'V')
      AND o.is_ms_shipped = 0
    GROUP BY s.name, o.name, o.type_desc, CAST(ep.value AS nvarchar(max)), o.modify_date
    ORDER BY s.name, o.name
`;

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toIsoString(value: unknown): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function qualify(schemaName?: string | null, name?: string | null) {
    const schema = schemaName?.trim();
    const object = name?.trim();
    if (!object) return null;
    return schema && schema !== 'dbo' ? `${schema}.${object}` : object;
}

function normalizeObjectRow(row: ObjectRow): DatabaseObjectRow | null {
    const name = qualify(row.schemaName, row.name);
    if (!name) return null;

    return {
        name,
        schema: row.schemaName ?? undefined,
        engine: row.type ?? null,
        totalBytes: toNumberOrNull(row.totalBytes),
        totalRows: toNumberOrNull(row.totalRows),
        comment: row.comment ?? null,
        lastModified: toIsoString(row.lastModified),
    };
}

function detectNamingPatterns(tables: DatabaseObjectRow[]) {
    const domainCounts = new Map<string, number>();
    for (const table of tables) {
        const unqualified = table.name.split('.').pop() ?? table.name;
        const domainPrefix = unqualified.split('_')[0]?.trim();
        if (domainPrefix && domainPrefix.length > 1 && unqualified.includes('_')) {
            domainCounts.set(domainPrefix, (domainCounts.get(domainPrefix) ?? 0) + 1);
        }
    }

    return Array.from(domainCounts.entries())
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([prefix]) => ({
            kind: 'domain' as const,
            label: `${prefix}_*`,
        }));
}

function buildRelationshipPaths(rows: RelationshipRow[]) {
    return rows
        .map(row => {
            const source = row.sourceTableName?.trim();
            const target = row.targetTableName?.trim();
            return source && target && source !== target ? { path: `${source} -> ${target}` } : null;
        })
        .filter((row): row is { path: string } => Boolean(row))
        .slice(0, 3);
}

function summarizeReason(input: { hasRelationships: boolean; isLargestByRows: boolean; isLargestByBytes: boolean; isRecent: boolean }) {
    if (input.hasRelationships && input.isLargestByRows) return 'centralAndHighRowVolume' as const;
    if (input.hasRelationships && input.isLargestByBytes) return 'centralAndHighStorage' as const;
    if (input.hasRelationships) return 'centralInRelationships' as const;
    if (input.isLargestByRows) return 'highRowVolume' as const;
    if (input.isLargestByBytes) return 'largeStorageFootprint' as const;
    if (input.isRecent) return 'recentlyUpdated' as const;
    return 'goodStartingPoint' as const;
}

function buildRecommendations(tables: DatabaseObjectRow[], relationshipRows: RelationshipRow[]): DatabaseSummaryRecommendation[] {
    const related = new Set<string>();
    for (const row of relationshipRows) {
        if (row.sourceTableName) related.add(row.sourceTableName);
        if (row.targetTableName) related.add(row.targetTableName);
    }
    const topByRows = new Set(
        [...tables]
            .sort((a, b) => (b.totalRows ?? 0) - (a.totalRows ?? 0))
            .slice(0, 3)
            .map(table => table.name),
    );
    const topByBytes = new Set(
        [...tables]
            .sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
            .slice(0, 3)
            .map(table => table.name),
    );
    const recent = new Set(
        [...tables]
            .filter(table => table.lastModified)
            .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)))
            .slice(0, 3)
            .map(table => table.name),
    );

    return tables
        .map(table => ({
            name: table.name,
            reason: summarizeReason({
                hasRelationships: related.has(table.name),
                isLargestByRows: topByRows.has(table.name),
                isLargestByBytes: topByBytes.has(table.name),
                isRecent: recent.has(table.name),
            }),
            bytes: table.totalBytes ?? null,
            rowsEstimate: table.totalRows ?? null,
            score: (related.has(table.name) ? 10 : 0) + (topByRows.has(table.name) ? 5 : 0) + (topByBytes.has(table.name) ? 5 : 0) + (recent.has(table.name) ? 1 : 0),
        }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 3)
        .map(({ score: _score, ...rest }) => rest);
}

async function getDatabases(datasource: SqlServerDatasource) {
    const result = await datasource.query<{ name: string }>(`
        SELECT name
        FROM sys.databases
        WHERE state = 0
        ORDER BY name
    `);

    return result.rows
        .map(row => row.name?.trim())
        .filter((name): name is string => Boolean(name))
        .map(name => ({ value: name, label: name }));
}

async function getSchemas(datasource: SqlServerDatasource, database: string) {
    const result = await datasource.queryWithContext<{ name?: string }>(
        `
            SELECT name
            FROM sys.schemas
            WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA')
            ORDER BY name
        `,
        { database },
    );

    return result.rows
        .map(row => row.name?.trim())
        .filter((name): name is string => Boolean(name))
        .map(name => ({ value: name, label: name }));
}

async function getTables(datasource: SqlServerDatasource, database?: string) {
    if (!database) {
        return [];
    }

    const result = await datasource.queryWithContext<{ schemaName?: string; tableName?: string }>(
        `
            SELECT s.name AS schemaName, t.name AS tableName
            FROM sys.tables t
            JOIN sys.schemas s ON s.schema_id = t.schema_id
            WHERE t.is_ms_shipped = 0
            ORDER BY s.name, t.name
        `,
        { database },
    );

    return result.rows
        .map(row => {
            const value = qualify(row.schemaName, row.tableName);
            return value ? { value, label: value, database, schema: row.schemaName } : null;
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function getSchema(datasource: SqlServerDatasource, database?: string): Promise<ConnectionSchemaMap> {
    if (!database) return {};
    const result = await datasource.queryWithContext<{ schemaName?: string; tableName?: string; columnName?: string }>(
        `
            SELECT
                TABLE_SCHEMA AS schemaName,
                TABLE_NAME AS tableName,
                COLUMN_NAME AS columnName
            FROM INFORMATION_SCHEMA.COLUMNS
            ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
        `,
        { database },
    );

    return result.rows.reduce<ConnectionSchemaMap>((schema, row) => {
        const tableName = qualify(row.schemaName, row.tableName);
        const columnName = row.columnName?.trim();
        if (!tableName || !columnName) return schema;
        if (!schema[tableName]) schema[tableName] = [];
        schema[tableName].push(columnName);
        return schema;
    }, {});
}

async function getTableColumns(datasource: SqlServerDatasource, database: string, table: string): Promise<TableColumnInfo[]> {
    const target = parseSqlServerTableReference(table);
    const schemaName = target.schema ?? 'dbo';
    const tableName = target.table;
    const result = await datasource.queryWithContext<TableColumnInfo>(
        `
            SELECT
                c.COLUMN_NAME AS columnName,
                c.DATA_TYPE AS columnType,
                CASE WHEN c.COLUMN_DEFAULT IS NOT NULL THEN 'DEFAULT' ELSE NULL END AS defaultKind,
                c.COLUMN_DEFAULT AS defaultExpression,
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isPrimaryKey,
                CAST(ep.value AS nvarchar(max)) AS comment
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
                SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                  ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                 AND ku.TABLE_SCHEMA = tc.TABLE_SCHEMA
                 AND ku.TABLE_NAME = tc.TABLE_NAME
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            ) pk
              ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA
             AND pk.TABLE_NAME = c.TABLE_NAME
             AND pk.COLUMN_NAME = c.COLUMN_NAME
            LEFT JOIN sys.objects o ON o.name = c.TABLE_NAME
            LEFT JOIN sys.schemas s ON s.schema_id = o.schema_id AND s.name = c.TABLE_SCHEMA
            LEFT JOIN sys.columns sc ON sc.object_id = o.object_id AND sc.name = c.COLUMN_NAME
            LEFT JOIN sys.extended_properties ep
              ON ep.major_id = o.object_id
             AND ep.minor_id = sc.column_id
             AND ep.name = 'MS_Description'
            WHERE c.TABLE_SCHEMA = @schemaName
              AND c.TABLE_NAME = @tableName
            ORDER BY c.ORDINAL_POSITION
        `,
        {
            database,
            params: { schemaName, tableName },
        },
    );

    return Array.isArray(result.rows) ? result.rows : [];
}

async function getDatabaseTablesDetail(datasource: SqlServerDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const result = await datasource.queryWithContext<ObjectRow>(USER_OBJECTS_SQL, { database });
    return result.rows.map(normalizeObjectRow).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function getTablesOnly(datasource: SqlServerDatasource, database: string): Promise<DatabaseObjectRow[]> {
    return (await getDatabaseTablesDetail(datasource, database)).filter(row => row.engine !== 'VIEW');
}

async function getViews(datasource: SqlServerDatasource, database: string): Promise<DatabaseObjectRow[]> {
    return (await getDatabaseTablesDetail(datasource, database)).filter(row => row.engine === 'VIEW');
}

async function getFunctions(datasource: SqlServerDatasource, database?: string) {
    if (!database) return [];
    const result = await datasource.queryWithContext<{ schemaName?: string; name?: string }>(
        `
            SELECT s.name AS schemaName, o.name AS name
            FROM sys.objects o
            JOIN sys.schemas s ON s.schema_id = o.schema_id
            WHERE o.type IN ('FN', 'IF', 'TF', 'P')
              AND o.is_ms_shipped = 0
            ORDER BY s.name, o.name
        `,
        { database },
    );

    return result.rows
        .map(row => qualify(row.schemaName, row.name))
        .filter((name): name is string => Boolean(name))
        .map(name => ({ value: name, label: name }));
}

async function getSequences(datasource: SqlServerDatasource, database?: string): Promise<DatabaseObjectRow[]> {
    if (!database) return [];
    const result = await datasource.queryWithContext<{ schemaName?: string; name?: string; currentValue?: number | string | null }>(
        `
            SELECT s.name AS schemaName, seq.name AS name, seq.current_value AS currentValue
            FROM sys.sequences seq
            JOIN sys.schemas s ON s.schema_id = seq.schema_id
            ORDER BY s.name, seq.name
        `,
        { database },
    );

    return result.rows
        .map<DatabaseObjectRow | null>(row => {
            const name = qualify(row.schemaName, row.name);
            return name
                ? {
                      name,
                      schema: row.schemaName,
                      engine: 'SEQUENCE',
                      totalBytes: null,
                      totalRows: toNumberOrNull(row.currentValue),
                      comment: null,
                      lastModified: null,
                  }
                : null;
        })
        .filter((row): row is DatabaseObjectRow => Boolean(row));
}

async function getDatabaseSummary(datasource: SqlServerDatasource, options: DatabaseSummaryOptions): Promise<DatabaseSummary> {
    const rows = await getDatabaseTablesDetail(datasource, options.database);
    const tables = rows.filter(row => row.engine !== 'VIEW');
    const views = rows.filter(row => row.engine === 'VIEW');

    const [columnCounts, relationshipResult, functions] = await Promise.all([
        datasource.queryWithContext<ColumnCountRow>(
            `
                SELECT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) AS name, COUNT(*) AS columnCount
                FROM INFORMATION_SCHEMA.COLUMNS
                GROUP BY TABLE_SCHEMA, TABLE_NAME
            `,
            { database: options.database },
        ),
        datasource.queryWithContext<RelationshipRow>(
            `
                SELECT DISTINCT
                    CONCAT(OBJECT_SCHEMA_NAME(fk.parent_object_id), '.', OBJECT_NAME(fk.parent_object_id)) AS sourceTableName,
                    CONCAT(OBJECT_SCHEMA_NAME(fk.referenced_object_id), '.', OBJECT_NAME(fk.referenced_object_id)) AS targetTableName
                FROM sys.foreign_keys fk
            `,
            { database: options.database },
        ),
        getFunctions(datasource, options.database),
    ]);

    const columnCountRows = columnCounts.rows ?? [];
    const relationshipRows = relationshipResult.rows ?? [];
    const totalBytes = tables.reduce((sum, table) => sum + (table.totalBytes ?? 0), 0);
    const totalRowsEstimate = tables.reduce((sum, table) => sum + (table.totalRows ?? 0), 0);
    const lastUpdatedAt =
        rows
            .map(row => row.lastModified)
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => b.localeCompare(a))[0] ?? null;
    const avgColumns = columnCountRows.length > 0 ? columnCountRows.reduce((sum, row) => sum + (toNumberOrNull(row.columnCount) ?? 0), 0) / columnCountRows.length : null;
    const maxColumnRow = columnCountRows
        .map(row => ({ name: row.name ?? null, columnCount: toNumberOrNull(row.columnCount) }))
        .sort((a, b) => (b.columnCount ?? 0) - (a.columnCount ?? 0))[0];
    const recommendations = buildRecommendations(tables, relationshipRows);
    const topTablesByBytes: DatabaseSummaryTable[] = [...tables]
        .sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
        .slice(0, 5)
        .map(table => ({ name: table.name, bytes: table.totalBytes ?? null, rowsEstimate: table.totalRows ?? null, comment: table.comment ?? null }));
    const topTablesByRows: DatabaseSummaryTable[] = [...tables]
        .sort((a, b) => (b.totalRows ?? 0) - (a.totalRows ?? 0))
        .slice(0, 5)
        .map(table => ({ name: table.name, bytes: table.totalBytes ?? null, rowsEstimate: table.totalRows ?? null, comment: table.comment ?? null }));

    return {
        databaseName: options.database,
        catalogName: options.catalogName ?? null,
        schemaName: options.schemaName ?? null,
        engine: options.engine ?? 'sqlserver',
        cluster: options.cluster ?? null,
        owner: null,
        tablesCount: tables.length,
        viewsCount: views.length,
        materializedViewsCount: null,
        functionsCount: functions.length,
        totalBytes,
        totalRowsEstimate,
        lastUpdatedAt,
        lastQueriedAt: null,
        tableSizeDistribution: {
            smallTablesCount: tables.filter(table => (table.totalBytes ?? 0) > 0 && (table.totalBytes ?? 0) < 10 * 1024 * 1024).length,
            mediumTablesCount: tables.filter(table => (table.totalBytes ?? 0) >= 10 * 1024 * 1024 && (table.totalBytes ?? 0) < 100 * 1024 * 1024).length,
            largeTablesCount: tables.filter(table => (table.totalBytes ?? 0) >= 100 * 1024 * 1024).length,
        },
        columnComplexity: {
            averageColumnsPerTable: avgColumns === null ? null : Number(avgColumns.toFixed(2)),
            maxColumns: maxColumnRow?.columnCount ?? null,
            maxColumnsTable: maxColumnRow?.name ?? null,
        },
        foreignKeyLinksCount: relationshipRows.length,
        relationshipPaths: buildRelationshipPaths(relationshipRows),
        detectedPatterns: detectNamingPatterns(tables),
        coreTables: recommendations,
        topTablesByBytes,
        topTablesByRows,
        recentTables: [...rows]
            .filter(row => row.lastModified)
            .sort((a, b) => String(b.lastModified ?? '').localeCompare(String(a.lastModified ?? '')))
            .slice(0, 5)
            .map(row => ({ name: row.name, lastUpdatedAt: row.lastModified ?? null })),
        startHere: recommendations,
        oneLineSummary:
            tables.length > 0 ? `${options.database} has ${tables.length} tables and ${views.length} views.` : `${options.database} is available but does not expose user tables.`,
    };
}

export function createSqlServerMetadataCapability(datasource: SqlServerDatasource): SqlServerMetadataAPI {
    return {
        getDatabases: () => getDatabases(datasource),
        getTables: database => getTables(datasource, database),
        getSchemas: database => getSchemas(datasource, database),
        getSchema: database => getSchema(datasource, database),
        getTableColumns: (database, table) => getTableColumns(datasource, database, table),
        getTablesOnly: database => getTablesOnly(datasource, database),
        getViews: database => getViews(datasource, database),
        getFunctions: database => getFunctions(datasource, database),
        getSequences: database => getSequences(datasource, database),
        getDatabaseSummary: options => getDatabaseSummary(datasource, options),
        getDatabaseTablesDetail: database => getDatabaseTablesDetail(datasource, database),
    };
}
