import type {
    DatabaseExtensionMeta,
    ConnectionMetadataAPI,
    ConnectionSchemaMap,
    DatabaseFunctionMeta,
    DatabaseObjectRow,
    DatabaseSummary,
    DatabaseSummaryRecommendation,
    DatabaseSummaryOptions,
    TableColumnInfo,
} from '@dory/drivers/types';
import { normalizePostgresTableKind } from '../postgres-driver';
import type { PostgresDatasource } from '../PostgresDatasource';

export type PostgresMetadataAPI = ConnectionMetadataAPI & {
    getSchemas: (database: string) => Promise<{ label: string; value: string }[]>;
    getTableColumns: (database: string, table: string) => Promise<TableColumnInfo[]>;
    getTablesOnly: (database: string) => Promise<DatabaseObjectRow[]>;
    getViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getMaterializedViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getFunctions: (database?: string) => Promise<DatabaseFunctionMeta[]>;
    getSequences: (database?: string) => Promise<DatabaseObjectRow[]>;
    getExtensions: (database?: string) => Promise<DatabaseExtensionMeta[]>;
    getDatabaseSummary: (options: DatabaseSummaryOptions) => Promise<DatabaseSummary>;
    getDatabaseTablesDetail: (database: string) => Promise<DatabaseObjectRow[]>;
};

type ObjectRow = {
    schemaName?: string;
    name?: string;
    relkind?: string;
    totalBytes?: number | string | null;
    totalRows?: number | string | null;
    comment?: string | null;
    lastModified?: string | null;
};

type FunctionRow = {
    schemaName?: string;
    name?: string;
};

type ExtensionRow = {
    name?: string;
    schemaName?: string | null;
    version?: string | null;
    relocatable?: boolean | null;
    comment?: string | null;
};

type TableColumnCountRow = {
    schemaName?: string;
    name?: string;
    columnCount?: number | string | null;
};

type RelationshipRow = {
    sourceSchemaName?: string;
    sourceTableName?: string;
    targetSchemaName?: string;
    targetTableName?: string;
};

type OwnerRow = {
    owner?: string | null;
};

const SYSTEM_SCHEMA_FILTER = `
    n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
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

function qualifyName(schemaName: string | undefined, objectName: string | undefined): string | null {
    if (!objectName) return null;
    if (!schemaName || schemaName === 'public') {
        return objectName;
    }
    return `${schemaName}.${objectName}`;
}

function normalizeObjectRow(row: ObjectRow): DatabaseObjectRow | null {
    const name = qualifyName(row.schemaName, row.name);
    if (!name) return null;

    return {
        name,
        engine: normalizePostgresTableKind(row.relkind),
        totalBytes: toNumberOrNull(row.totalBytes),
        totalRows: toNumberOrNull(row.totalRows),
        comment: row.comment ?? null,
        lastModified: toIsoString(row.lastModified),
    };
}

function isTableLike(engine?: string | null) {
    return engine === 'table' || engine === 'partitioned' || engine === 'foreign_table';
}

function parseTableName(table: string): { schema: string | null; name: string } {
    const trimmed = table.trim();
    const [schema, ...rest] = trimmed.split('.');
    if (rest.length === 0) {
        return { schema: null, name: schema };
    }
    return {
        schema,
        name: rest.join('.'),
    };
}

function buildSchemaClause(alias: string) {
    return `AND ($1::text IS NULL OR ${alias} = $1)`;
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

function detectNamingPatterns(tables: DatabaseObjectRow[]) {
    const domainCounts = new Map<string, number>();
    const partitionCounts = new Map<string, number>();

    for (const table of tables) {
        const baseName = table.name.includes('.') ? table.name.split('.').slice(1).join('.') : table.name;
        const domainPrefix = baseName.split('_')[0]?.trim();
        if (domainPrefix && domainPrefix.length > 1 && baseName.includes('_')) {
            domainCounts.set(domainPrefix, (domainCounts.get(domainPrefix) ?? 0) + 1);
        }

        const partitionMatch = baseName.match(/^(.+)_p\d{4}.*$/i);
        if (partitionMatch?.[1]) {
            partitionCounts.set(partitionMatch[1], (partitionCounts.get(partitionMatch[1]) ?? 0) + 1);
        }
    }

    const patterns = [
        ...Array.from(partitionCounts.entries())
            .filter(([, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([prefix]) => ({
                kind: 'partition' as const,
                label: `${prefix}_p*`,
            })),
        ...Array.from(domainCounts.entries())
            .filter(([, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([prefix]) => ({
                kind: 'domain' as const,
                label: `${prefix}_*`,
            })),
    ];

    return patterns.slice(0, 4);
}

function buildRelationshipPaths(rows: RelationshipRow[]) {
    const edges = rows
        .map(row => {
            const source = qualifyName(row.sourceSchemaName, row.sourceTableName);
            const target = qualifyName(row.targetSchemaName, row.targetTableName);
            if (!source || !target) return null;
            return { source, target };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const incoming = new Map<string, Set<string>>();
    const outgoing = new Map<string, Set<string>>();
    const degree = new Map<string, number>();

    for (const edge of edges) {
        if (!incoming.has(edge.target)) incoming.set(edge.target, new Set());
        if (!outgoing.has(edge.source)) outgoing.set(edge.source, new Set());
        incoming.get(edge.target)?.add(edge.source);
        outgoing.get(edge.source)?.add(edge.target);
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }

    const candidates = new Map<string, number>();

    for (const [middle, sources] of incoming.entries()) {
        const targets = outgoing.get(middle);
        if (!targets?.size) continue;
        for (const source of sources) {
            for (const target of targets) {
                if (source === target) continue;
                const path = `${source} -> ${middle} -> ${target}`;
                const score = (degree.get(source) ?? 0) + (degree.get(middle) ?? 0) + (degree.get(target) ?? 0);
                candidates.set(path, Math.max(candidates.get(path) ?? 0, score));
            }
        }
    }

    for (const edge of edges) {
        const path = `${edge.source} -> ${edge.target}`;
        const score = (degree.get(edge.source) ?? 0) + (degree.get(edge.target) ?? 0);
        candidates.set(path, Math.max(candidates.get(path) ?? 0, score));
    }

    return Array.from(candidates.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([path]) => ({ path }));
}

async function getSchemaOwner(datasource: PostgresDatasource, database: string, schemaName?: string | null) {
    if (!schemaName) return null;

    const result = await datasource.queryWithContext<OwnerRow>(
        `
            SELECT pg_get_userbyid(n.nspowner) AS owner
            FROM pg_namespace n
            WHERE n.nspname = $1
            LIMIT 1
        `,
        {
            database,
            params: [schemaName],
        },
    );

    return result.rows[0]?.owner ?? null;
}

async function getColumnCountsByTable(datasource: PostgresDatasource, database: string, schemaName?: string | null) {
    const result = await datasource.queryWithContext<TableColumnCountRow>(
        `
            SELECT
                n.nspname AS "schemaName",
                c.relname AS name,
                COUNT(a.attnum) AS "columnCount"
            FROM pg_class c
            JOIN pg_namespace n
              ON n.oid = c.relnamespace
            JOIN pg_attribute a
              ON a.attrelid = c.oid
            WHERE ${SYSTEM_SCHEMA_FILTER}
              ${buildSchemaClause('n.nspname')}
              AND c.relkind IN ('r', 'p', 'f')
              AND a.attnum > 0
              AND NOT a.attisdropped
            GROUP BY n.nspname, c.relname
            ORDER BY n.nspname, c.relname
        `,
        {
            database,
            params: [schemaName ?? null],
        },
    );

    return result.rows
        .map(row => {
            const name = qualifyName(row.schemaName, row.name);
            if (!name) return null;
            return {
                name,
                columnCount: toNumberOrNull(row.columnCount),
            };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function getForeignKeyRelationships(datasource: PostgresDatasource, database: string, schemaName?: string | null) {
    const result = await datasource.queryWithContext<RelationshipRow>(
        `
            SELECT
                src_ns.nspname AS "sourceSchemaName",
                src.relname AS "sourceTableName",
                tgt_ns.nspname AS "targetSchemaName",
                tgt.relname AS "targetTableName"
            FROM pg_constraint con
            JOIN pg_class src
              ON src.oid = con.conrelid
            JOIN pg_namespace src_ns
              ON src_ns.oid = src.relnamespace
            JOIN pg_class tgt
              ON tgt.oid = con.confrelid
            JOIN pg_namespace tgt_ns
              ON tgt_ns.oid = tgt.relnamespace
            WHERE con.contype = 'f'
              AND ${SYSTEM_SCHEMA_FILTER.replaceAll('n.', 'src_ns.')}
              AND ${SYSTEM_SCHEMA_FILTER.replaceAll('n.', 'tgt_ns.')}
              ${buildSchemaClause('src_ns.nspname')}
              AND ($1::text IS NULL OR tgt_ns.nspname = $1)
            ORDER BY src_ns.nspname, src.relname, tgt_ns.nspname, tgt.relname
        `,
        {
            database,
            params: [schemaName ?? null],
        },
    );

    return result.rows;
}

async function getDatabases(datasource: PostgresDatasource) {
    const result = await datasource.query<{
        databaseName: string;
    }>(
        `
            SELECT datname AS "databaseName"
            FROM pg_database
            WHERE datallowconn
              AND NOT datistemplate
            ORDER BY datname
        `,
    );

    return result.rows.map(row => ({
        value: row.databaseName,
        label: row.databaseName,
    }));
}

async function getTables(datasource: PostgresDatasource, database?: string) {
    const result = await datasource.queryWithContext<{
        schemaName: string;
        tableName: string;
    }>(
        `
            SELECT
                table_schema AS "schemaName",
                table_name AS "tableName"
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
              AND table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name
        `,
        { database },
    );

    return result.rows
        .map(row => {
            const value = qualifyName(row.schemaName, row.tableName);
            if (!value) return null;
            return {
                value,
                label: value,
                database,
                schema: row.schemaName,
            };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function getSchemas(datasource: PostgresDatasource, database: string) {
    const result = await datasource.queryWithContext<{
        schemaName: string;
    }>(
        `
            SELECT schema_name AS "schemaName"
            FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
              AND schema_name NOT LIKE 'pg_toast%'
            ORDER BY schema_name
        `,
        { database },
    );

    return result.rows
        .map(row => row.schemaName?.trim())
        .filter((schemaName): schemaName is string => Boolean(schemaName))
        .map(schemaName => ({
            value: schemaName,
            label: schemaName,
        }));
}

async function getSchema(datasource: PostgresDatasource, database?: string): Promise<ConnectionSchemaMap> {
    const result = await datasource.queryWithContext<{
        schemaName: string;
        tableName: string;
        columnName: string;
    }>(
        `
            SELECT
                table_schema AS "schemaName",
                table_name AS "tableName",
                column_name AS "columnName"
            FROM information_schema.columns
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name, ordinal_position
        `,
        { database },
    );

    return result.rows.reduce<ConnectionSchemaMap>((acc, row) => {
        const tableName = qualifyName(row.schemaName, row.tableName);
        const columnName = row.columnName?.trim();
        if (!tableName || !columnName) {
            return acc;
        }
        if (!acc[tableName]) {
            acc[tableName] = [];
        }
        acc[tableName].push(columnName);
        return acc;
    }, {});
}

async function getTableColumns(datasource: PostgresDatasource, database: string, table: string): Promise<TableColumnInfo[]> {
    const parsed = parseTableName(table);
    const result = await datasource.queryWithContext<TableColumnInfo>(
        `
            SELECT
                cols.column_name AS "columnName",
                cols.udt_name AS "columnType",
                CASE WHEN cols.column_default IS NULL THEN NULL ELSE 'DEFAULT' END AS "defaultKind",
                cols.column_default AS "defaultExpression",
                EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                     AND tc.table_name = kcu.table_name
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                      AND tc.table_schema = cols.table_schema
                      AND tc.table_name = cols.table_name
                      AND kcu.column_name = cols.column_name
                ) AS "isPrimaryKey",
                pgd.description AS comment
            FROM information_schema.columns cols
            JOIN pg_catalog.pg_class cls
              ON cls.relname = cols.table_name
            JOIN pg_catalog.pg_namespace ns
              ON ns.oid = cls.relnamespace
             AND ns.nspname = cols.table_schema
            LEFT JOIN pg_catalog.pg_description pgd
              ON pgd.objoid = cls.oid
             AND pgd.objsubid = cols.ordinal_position
            WHERE cols.table_schema = COALESCE($1, current_schema())
              AND cols.table_name = $2
            ORDER BY cols.ordinal_position
        `,
        {
            database,
            params: [parsed.schema, parsed.name],
        },
    );

    return Array.isArray(result.rows) ? result.rows : [];
}

async function getDatabaseTablesDetail(datasource: PostgresDatasource, database: string, schemaName?: string | null): Promise<DatabaseObjectRow[]> {
    const result = await datasource.queryWithContext<ObjectRow>(
        `
            SELECT
                n.nspname AS "schemaName",
                c.relname AS name,
                c.relkind AS relkind,
                pg_total_relation_size(c.oid) AS "totalBytes",
                COALESCE(s.n_live_tup, c.reltuples) AS "totalRows",
                obj_description(c.oid, 'pg_class') AS comment,
                GREATEST(s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze) AS "lastModified"
            FROM pg_class c
            JOIN pg_namespace n
              ON n.oid = c.relnamespace
            LEFT JOIN pg_stat_user_tables s
              ON s.relid = c.oid
            WHERE ${SYSTEM_SCHEMA_FILTER}
              ${buildSchemaClause('n.nspname')}
              AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            ORDER BY n.nspname, c.relname
        `,
        {
            database,
            params: [schemaName ?? null],
        },
    );

    return result.rows.map(normalizeObjectRow).filter((row): row is DatabaseObjectRow => Boolean(row));
}

async function getTablesOnly(datasource: PostgresDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => isTableLike(row.engine));
}

async function getViews(datasource: PostgresDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => row.engine === 'view');
}

async function getMaterializedViews(datasource: PostgresDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => row.engine === 'materialized_view');
}

async function getFunctions(datasource: PostgresDatasource, database?: string, schemaName?: string | null) {
    const result = await datasource.queryWithContext<FunctionRow>(
        `
            SELECT
                n.nspname AS "schemaName",
                p.proname AS name
            FROM pg_proc p
            JOIN pg_namespace n
              ON n.oid = p.pronamespace
            WHERE ${SYSTEM_SCHEMA_FILTER}
              ${buildSchemaClause('n.nspname')}
            ORDER BY n.nspname, p.proname
        `,
        {
            database,
            params: [schemaName ?? null],
        },
    );

    return result.rows
        .map(row => {
            const name = qualifyName(row.schemaName, row.name);
            if (!name) return null;
            return { label: name, value: name };
        })
        .filter((row): row is DatabaseFunctionMeta => Boolean(row));
}

async function getSequences(datasource: PostgresDatasource, database?: string) {
    const result = await datasource.queryWithContext<ObjectRow>(
        `
            SELECT
                n.nspname AS "schemaName",
                c.relname AS name,
                c.relkind AS relkind,
                obj_description(c.oid, 'pg_class') AS comment
            FROM pg_class c
            JOIN pg_namespace n
              ON n.oid = c.relnamespace
            WHERE ${SYSTEM_SCHEMA_FILTER}
              AND c.relkind = 'S'
            ORDER BY n.nspname, c.relname
        `,
        { database },
    );

    return result.rows.map(normalizeObjectRow).filter((row): row is DatabaseObjectRow => Boolean(row));
}

async function getExtensions(datasource: PostgresDatasource, database?: string): Promise<DatabaseExtensionMeta[]> {
    const result = await datasource.queryWithContext<ExtensionRow>(
        `
            SELECT
                ext.extname AS name,
                ns.nspname AS "schemaName",
                ext.extversion AS version,
                ext.extrelocatable AS relocatable,
                obj_description(ext.oid, 'pg_extension') AS comment
            FROM pg_extension ext
            LEFT JOIN pg_namespace ns
              ON ns.oid = ext.extnamespace
            ORDER BY ext.extname
        `,
        { database },
    );

    return result.rows
        .filter(row => row.name)
        .map(row => ({
            name: row.name as string,
            schema: row.schemaName ?? null,
            version: row.version ?? null,
            relocatable: row.relocatable ?? null,
            comment: row.comment ?? null,
        }));
}

async function getDatabaseSummary(datasource: PostgresDatasource, options: DatabaseSummaryOptions): Promise<DatabaseSummary> {
    const rows = await getDatabaseTablesDetail(datasource, options.database, options.schemaName);
    const tables = rows.filter(row => isTableLike(row.engine));
    const views = rows.filter(row => row.engine === 'view');
    const materializedViews = rows.filter(row => row.engine === 'materialized_view');
    const [functions, columnCounts, relationshipRows, owner] = await Promise.all([
        getFunctions(datasource, options.database, options.schemaName),
        getColumnCountsByTable(datasource, options.database, options.schemaName),
        getForeignKeyRelationships(datasource, options.database, options.schemaName),
        getSchemaOwner(datasource, options.database, options.schemaName),
    ]);
    const recentTables = [...rows]
        .sort((a, b) => {
            const left = a.lastModified ? new Date(a.lastModified).getTime() : 0;
            const right = b.lastModified ? new Date(b.lastModified).getTime() : 0;
            return right - left;
        })
        .slice(0, 5)
        .map(row => ({
            name: row.name,
            lastUpdatedAt: row.lastModified ?? null,
        }));

    const topTablesByBytes = [...tables]
        .sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
        .slice(0, 5)
        .map(row => ({
            name: row.name,
            bytes: row.totalBytes ?? null,
            rowsEstimate: row.totalRows ?? null,
            comment: row.comment ?? null,
        }));

    const topTablesByRows = [...tables]
        .sort((a, b) => (b.totalRows ?? 0) - (a.totalRows ?? 0))
        .slice(0, 5)
        .map(row => ({
            name: row.name,
            bytes: row.totalBytes ?? null,
            rowsEstimate: row.totalRows ?? null,
            comment: row.comment ?? null,
        }));

    const lastUpdatedAt = recentTables[0]?.lastUpdatedAt ?? null;
    const rowsForDistribution = tables.map(row => row.totalRows ?? 0);
    const smallTablesCount = rowsForDistribution.filter(rowCount => rowCount < 1000).length;
    const mediumTablesCount = rowsForDistribution.filter(rowCount => rowCount >= 1000 && rowCount <= 100000).length;
    const largeTablesCount = rowsForDistribution.filter(rowCount => rowCount > 100000).length;
    const averageColumnsPerTable = columnCounts.length > 0 ? Number((columnCounts.reduce((sum, row) => sum + (row.columnCount ?? 0), 0) / columnCounts.length).toFixed(1)) : null;
    const widestTable =
        [...columnCounts]
            .sort((a, b) => (b.columnCount ?? 0) - (a.columnCount ?? 0))
            .map(row => ({
                name: row.name,
                columnCount: row.columnCount ?? null,
            }))[0] ?? null;
    const relationshipPaths = buildRelationshipPaths(relationshipRows);
    const relationshipDegree = new Map<string, number>();

    for (const row of relationshipRows) {
        const source = qualifyName(row.sourceSchemaName, row.sourceTableName);
        const target = qualifyName(row.targetSchemaName, row.targetTableName);
        if (source) relationshipDegree.set(source, (relationshipDegree.get(source) ?? 0) + 1);
        if (target) relationshipDegree.set(target, (relationshipDegree.get(target) ?? 0) + 1);
    }

    const largestByRowsName = topTablesByRows[0]?.name ?? null;
    const largestByBytesName = topTablesByBytes[0]?.name ?? null;
    const recentNames = new Set(recentTables.slice(0, 3).map(row => row.name));
    const recommendationCandidates = [...tables]
        .map(row => {
            const degree = relationshipDegree.get(row.name) ?? 0;
            const rowScore = row.totalRows ?? 0;
            const byteScore = row.totalBytes ?? 0;
            const recentBoost = recentNames.has(row.name) ? 1 : 0;
            return {
                ...row,
                score: degree * 1_000_000_000 + rowScore + byteScore / 1024 + recentBoost * 100_000_000,
                reason: summarizeReason({
                    hasRelationships: degree > 0,
                    isLargestByRows: row.name === largestByRowsName,
                    isLargestByBytes: row.name === largestByBytesName,
                    isRecent: recentNames.has(row.name),
                }),
            };
        })
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const coreTables: DatabaseSummaryRecommendation[] = recommendationCandidates.slice(0, 3).map(row => ({
        name: row.name,
        reason: row.reason,
        bytes: row.totalBytes ?? null,
        rowsEstimate: row.totalRows ?? null,
    }));
    const startHere: DatabaseSummaryRecommendation[] =
        coreTables.length > 0
            ? coreTables
            : topTablesByBytes.slice(0, 3).map(row => ({
                  name: row.name,
                  reason: row.name === largestByBytesName ? 'largeStorageFootprint' : 'goodStartingPoint',
                  bytes: row.bytes,
                  rowsEstimate: row.rowsEstimate,
              }));
    const detectedPatterns = detectNamingPatterns(tables);

    return {
        databaseName: options.database,
        catalogName: options.catalogName ?? null,
        schemaName: options.schemaName ?? null,
        engine: options.engine ?? 'postgres',
        cluster: options.cluster ?? null,
        owner,
        tablesCount: tables.length,
        viewsCount: views.length,
        materializedViewsCount: materializedViews.length,
        functionsCount: functions.length,
        totalBytes: tables.reduce<number>((sum, row) => sum + (row.totalBytes ?? 0), 0),
        totalRowsEstimate: tables.reduce<number>((sum, row) => sum + (row.totalRows ?? 0), 0),
        lastUpdatedAt,
        lastQueriedAt: null,
        tableSizeDistribution: {
            smallTablesCount,
            mediumTablesCount,
            largeTablesCount,
        },
        columnComplexity: {
            averageColumnsPerTable,
            maxColumns: widestTable?.columnCount ?? null,
            maxColumnsTable: widestTable?.name ?? null,
        },
        foreignKeyLinksCount: relationshipRows.length,
        relationshipPaths,
        detectedPatterns,
        coreTables,
        topTablesByBytes,
        topTablesByRows,
        recentTables,
        startHere,
        oneLineSummary: null,
    };
}

export function createPostgresMetadataCapability(datasource: PostgresDatasource): PostgresMetadataAPI {
    return {
        getDatabases: () => getDatabases(datasource),
        getTables: database => getTables(datasource, database),
        getSchemas: database => getSchemas(datasource, database),
        getSchema: database => getSchema(datasource, database),
        getTableColumns: (database, table) => getTableColumns(datasource, database, table),
        getTablesOnly: database => getTablesOnly(datasource, database),
        getViews: database => getViews(datasource, database),
        getMaterializedViews: database => getMaterializedViews(datasource, database),
        getFunctions: database => getFunctions(datasource, database),
        getSequences: database => getSequences(datasource, database),
        getExtensions: database => getExtensions(datasource, database),
        getDatabaseSummary: options => getDatabaseSummary(datasource, options),
        getDatabaseTablesDetail: database => getDatabaseTablesDetail(datasource, database),
    };
}
