import type {
    ConnectionMetadataAPI,
    ConnectionSchemaMap,
    DatabaseObjectRow,
    DatabaseSummary,
    DatabaseSummaryOptions,
    DatabaseSummaryRecommendation,
    DatabaseSummaryTable,
    SchemaGraphOptions,
    SchemaGraphResult,
    TableColumnInfo,
} from '@dory/drivers/types';
import { buildSchemaGraphResult, type SchemaGraphRelationshipInput, type SchemaGraphTableInput } from '@dory/drivers/core';
import type { MySqlDatasource } from '../datasource';
import { getMysqlSchemaSnapshot } from './schema-snapshot';

export type MysqlMetadataAPI = ConnectionMetadataAPI & {
    getTableColumns: (database: string, table: string) => Promise<TableColumnInfo[]>;
    getTablesOnly: (database: string) => Promise<DatabaseObjectRow[]>;
    getViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getDatabaseSummary: (options: DatabaseSummaryOptions) => Promise<DatabaseSummary>;
    getDatabaseTablesDetail: (database: string) => Promise<DatabaseObjectRow[]>;
    getSchemaGraph: (options: SchemaGraphOptions) => Promise<SchemaGraphResult>;
    getSchemaSnapshot: NonNullable<ConnectionMetadataAPI['getSchemaSnapshot']>;
};

type TableMetaRow = {
    name?: string;
    tableType?: string | null;
    engine?: string | null;
    totalRows?: number | string | null;
    dataBytes?: number | string | null;
    indexBytes?: number | string | null;
    comment?: string | null;
    lastModified?: string | null;
    createdAt?: string | null;
};

type ColumnCountRow = {
    name?: string;
    columnCount?: number | string | null;
};

type RelationshipRow = {
    sourceTableName?: string;
    targetTableName?: string;
};

type SchemaGraphColumnRow = {
    tableName?: string;
    columnName?: string;
    dataType?: string | null;
    ordinal?: number | string | null;
    nullable?: string | null;
    columnKey?: string | null;
};

type SchemaGraphRelationshipRow = {
    constraintName?: string | null;
    sourceTableName?: string;
    sourceColumnName?: string;
    targetTableName?: string;
    targetColumnName?: string;
    sourceNullable?: string | null;
    sourceColumnKey?: string | null;
    updateAction?: string | null;
    deleteAction?: string | null;
};

const TABLE_DETAIL_SQL = `
    SELECT
        table_name AS name,
        table_type AS tableType,
        CASE
            WHEN table_type = 'VIEW' THEN 'VIEW'
            ELSE engine
        END AS engine,
        table_rows AS totalRows,
        data_length AS dataBytes,
        index_length AS indexBytes,
        table_comment AS comment,
        update_time AS lastModified,
        create_time AS createdAt
    FROM information_schema.tables
    WHERE table_schema = ?
    ORDER BY
        CASE WHEN table_type = 'BASE TABLE' THEN 0 ELSE 1 END,
        table_name
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

function toTotalBytes(row: { dataBytes?: unknown; indexBytes?: unknown }) {
    const dataBytes = toNumberOrNull(row.dataBytes);
    const indexBytes = toNumberOrNull(row.indexBytes);

    if (dataBytes === null && indexBytes === null) {
        return null;
    }

    return (dataBytes ?? 0) + (indexBytes ?? 0);
}

function normalizeObjectRow(row: TableMetaRow): DatabaseObjectRow | null {
    const name = row.name?.trim();
    if (!name) return null;

    return {
        name,
        engine: row.engine ?? null,
        totalBytes: toTotalBytes(row),
        totalRows: toNumberOrNull(row.totalRows),
        comment: row.comment ?? null,
        lastModified: toIsoString(row.lastModified ?? row.createdAt),
    };
}

function detectNamingPatterns(tables: DatabaseObjectRow[]) {
    const domainCounts = new Map<string, number>();
    const partitionCounts = new Map<string, number>();

    for (const table of tables) {
        const domainPrefix = table.name.split('_')[0]?.trim();
        if (domainPrefix && domainPrefix.length > 1 && table.name.includes('_')) {
            domainCounts.set(domainPrefix, (domainCounts.get(domainPrefix) ?? 0) + 1);
        }

        const partitionMatch = table.name.match(/^(.+)_p\d{4}.*$/i);
        if (partitionMatch?.[1]) {
            partitionCounts.set(partitionMatch[1], (partitionCounts.get(partitionMatch[1]) ?? 0) + 1);
        }
    }

    return [
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
    ].slice(0, 4);
}

function buildRelationshipPaths(rows: RelationshipRow[]) {
    const edges = rows
        .map(row => {
            const source = row.sourceTableName?.trim();
            const target = row.targetTableName?.trim();
            if (!source || !target || source === target) return null;
            return { source, target };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const outgoing = new Map<string, Set<string>>();
    const incoming = new Map<string, Set<string>>();
    const degree = new Map<string, number>();

    for (const edge of edges) {
        if (!outgoing.has(edge.source)) outgoing.set(edge.source, new Set());
        if (!incoming.has(edge.target)) incoming.set(edge.target, new Set());
        outgoing.get(edge.source)?.add(edge.target);
        incoming.get(edge.target)?.add(edge.source);
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }

    const candidates = new Map<string, number>();

    for (const edge of edges) {
        const path = `${edge.source} -> ${edge.target}`;
        candidates.set(path, (degree.get(edge.source) ?? 0) + (degree.get(edge.target) ?? 0));
    }

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

    return Array.from(candidates.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([path]) => ({ path }));
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
    const degree = new Map<string, number>();
    for (const row of relationshipRows) {
        const source = row.sourceTableName?.trim();
        const target = row.targetTableName?.trim();
        if (!source || !target) continue;
        degree.set(source, (degree.get(source) ?? 0) + 1);
        degree.set(target, (degree.get(target) ?? 0) + 1);
    }

    const topByRows = new Set(
        tables
            .filter(table => typeof table.totalRows === 'number')
            .sort((a, b) => (b.totalRows ?? 0) - (a.totalRows ?? 0))
            .slice(0, 3)
            .map(table => table.name),
    );
    const topByBytes = new Set(
        tables
            .filter(table => typeof table.totalBytes === 'number')
            .sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
            .slice(0, 3)
            .map(table => table.name),
    );
    const recent = new Set(
        tables
            .filter(table => table.lastModified)
            .sort((a, b) => String(b.lastModified ?? '').localeCompare(String(a.lastModified ?? '')))
            .slice(0, 3)
            .map(table => table.name),
    );

    return tables
        .map(table => ({
            name: table.name,
            reason: summarizeReason({
                hasRelationships: (degree.get(table.name) ?? 0) > 0,
                isLargestByRows: topByRows.has(table.name),
                isLargestByBytes: topByBytes.has(table.name),
                isRecent: recent.has(table.name),
            }),
            bytes: table.totalBytes ?? null,
            rowsEstimate: table.totalRows ?? null,
            score: (degree.get(table.name) ?? 0) * 10 + (topByRows.has(table.name) ? 5 : 0) + (topByBytes.has(table.name) ? 5 : 0) + (recent.has(table.name) ? 1 : 0),
        }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 3)
        .map(({ score: _score, ...rest }) => rest);
}

async function getDatabases(datasource: MySqlDatasource) {
    const result = await datasource.query<{ name: string }>(
        `
            SELECT schema_name AS name
            FROM information_schema.schemata
            ORDER BY schema_name
        `,
    );

    return result.rows
        .map(row => row.name?.trim())
        .filter((name): name is string => Boolean(name))
        .map(name => ({
            value: name,
            label: name,
        }));
}

async function getTables(datasource: MySqlDatasource, database?: string) {
    if (!database) {
        const rows = await datasource.query<{ databaseName?: string; tableName?: string }>(
            `
                SELECT
                    table_schema AS databaseName,
                    table_name AS tableName
                FROM information_schema.tables
                WHERE table_type = 'BASE TABLE'
                ORDER BY table_schema, table_name
            `,
        );

        return rows.rows
            .filter(row => row.databaseName && row.tableName)
            .map(row => ({
                value: `${row.databaseName}.${row.tableName}`,
                label: `${row.databaseName}.${row.tableName}`,
                database: row.databaseName as string,
            }));
    }

    const rows = await datasource.queryWithContext<{ tableName?: string }>(
        `
            SELECT table_name AS tableName
            FROM information_schema.tables
            WHERE table_schema = ?
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `,
        {
            database,
            params: [database],
        },
    );

    return rows.rows
        .map(row => row.tableName?.trim())
        .filter((tableName): tableName is string => Boolean(tableName))
        .map(tableName => ({
            value: tableName,
            label: tableName,
            database,
        }));
}

async function getSchema(datasource: MySqlDatasource, database?: string): Promise<ConnectionSchemaMap> {
    const result = database
        ? await datasource.queryWithContext<{ tableName?: string; columnName?: string }>(
              `
                  SELECT
                      table_name AS tableName,
                      column_name AS columnName
                  FROM information_schema.columns
                  WHERE table_schema = ?
                  ORDER BY table_name, ordinal_position
              `,
              {
                  database,
                  params: [database],
              },
          )
        : await datasource.query<{ tableName?: string; columnName?: string }>(
              `
                  SELECT
                      CONCAT(table_schema, '.', table_name) AS tableName,
                      column_name AS columnName
                  FROM information_schema.columns
                  ORDER BY table_schema, table_name, ordinal_position
              `,
          );

    return (result.rows ?? []).reduce<ConnectionSchemaMap>((schema, row) => {
        const tableName = row.tableName?.trim();
        const columnName = row.columnName?.trim();
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

async function getTableColumns(datasource: MySqlDatasource, database: string, table: string): Promise<TableColumnInfo[]> {
    const result = await datasource.queryWithContext<TableColumnInfo>(
        `
            SELECT
                column_name AS columnName,
                column_type AS columnType,
                CASE
                    WHEN extra LIKE '%auto_increment%' THEN 'AUTO_INCREMENT'
                    WHEN column_default IS NOT NULL THEN 'DEFAULT'
                    ELSE NULL
                END AS defaultKind,
                column_default AS defaultExpression,
                CASE WHEN is_nullable = 'YES' THEN 1 ELSE 0 END AS nullable,
                CASE WHEN column_key = 'PRI' THEN 1 ELSE 0 END AS isPrimaryKey,
                column_comment AS comment
            FROM information_schema.columns
            WHERE table_schema = ?
              AND table_name = ?
            ORDER BY ordinal_position
        `,
        {
            database,
            params: [database, table],
        },
    );

    return Array.isArray(result.rows) ? result.rows : [];
}

async function getSchemaGraph(datasource: MySqlDatasource, options: SchemaGraphOptions): Promise<SchemaGraphResult> {
    const [columnResult, relationshipResult] = await Promise.all([
        datasource.queryWithContext<SchemaGraphColumnRow>(
            `
                SELECT
                    table_name AS tableName,
                    column_name AS columnName,
                    column_type AS dataType,
                    ordinal_position AS ordinal,
                    is_nullable AS nullable,
                    column_key AS columnKey
                FROM information_schema.columns
                WHERE table_schema = ?
                ORDER BY table_name, ordinal_position
            `,
            { database: options.database, params: [options.database] },
        ),
        datasource.queryWithContext<SchemaGraphRelationshipRow>(
            `
                SELECT
                    kcu.constraint_name AS constraintName,
                    kcu.table_name AS sourceTableName,
                    kcu.column_name AS sourceColumnName,
                    kcu.referenced_table_name AS targetTableName,
                    kcu.referenced_column_name AS targetColumnName,
                    cols.is_nullable AS sourceNullable,
                    cols.column_key AS sourceColumnKey,
                    rc.update_rule AS updateAction,
                    rc.delete_rule AS deleteAction
                FROM information_schema.key_column_usage kcu
                JOIN information_schema.columns cols
                  ON cols.table_schema = kcu.table_schema
                 AND cols.table_name = kcu.table_name
                 AND cols.column_name = kcu.column_name
                LEFT JOIN information_schema.referential_constraints rc
                  ON rc.constraint_schema = kcu.constraint_schema
                 AND rc.constraint_name = kcu.constraint_name
                 AND rc.table_name = kcu.table_name
                WHERE kcu.table_schema = ?
                  AND kcu.referenced_table_schema = ?
                  AND kcu.referenced_table_name IS NOT NULL
                ORDER BY kcu.table_name, kcu.constraint_name, kcu.ordinal_position
            `,
            { database: options.database, params: [options.database, options.database] },
        ),
    ]);

    const tablesByName = new Map<string, SchemaGraphTableInput>();
    for (const row of columnResult.rows) {
        const tableName = row.tableName?.trim();
        const columnName = row.columnName?.trim();
        if (!tableName || !columnName) continue;
        const table = tablesByName.get(tableName) ?? { database: options.database, schema: null, name: tableName, columns: [] };
        table.columns.push({
            name: columnName,
            dataType: row.dataType ?? null,
            ordinal: toNumberOrNull(row.ordinal) ?? table.columns.length + 1,
            nullable: row.nullable ? row.nullable.toUpperCase() === 'YES' : null,
            isPrimaryKey: row.columnKey?.toUpperCase() === 'PRI',
            isForeignKey: false,
        });
        tablesByName.set(tableName, table);
    }

    const relationshipsByKey = new Map<string, SchemaGraphRelationshipInput & { uniqueCandidate: boolean }>();
    for (const row of relationshipResult.rows) {
        const sourceTable = row.sourceTableName?.trim();
        const sourceColumn = row.sourceColumnName?.trim();
        const targetTable = row.targetTableName?.trim();
        const targetColumn = row.targetColumnName?.trim();
        if (!sourceTable || !sourceColumn || !targetTable || !targetColumn) continue;
        const key = `${sourceTable}\u0000${row.constraintName ?? ''}`;
        const relationship = relationshipsByKey.get(key) ?? {
            constraintName: row.constraintName ?? null,
            sourceSchema: null,
            sourceTable,
            sourceColumns: [],
            targetSchema: null,
            targetTable,
            targetColumns: [],
            sourceUnique: null,
            sourceOptional: false,
            onUpdate: row.updateAction ?? null,
            onDelete: row.deleteAction ?? null,
            uniqueCandidate: true,
        };
        relationship.sourceColumns.push(sourceColumn);
        relationship.targetColumns.push(targetColumn);
        relationship.sourceOptional = Boolean(relationship.sourceOptional) || row.sourceNullable?.toUpperCase() === 'YES';
        relationship.uniqueCandidate = relationship.uniqueCandidate && ['PRI', 'UNI'].includes(row.sourceColumnKey?.toUpperCase() ?? '');
        relationshipsByKey.set(key, relationship);
    }
    const relationships = Array.from(relationshipsByKey.values()).map(({ uniqueCandidate, ...relationship }) => ({
        ...relationship,
        sourceUnique: relationship.sourceColumns.length === 1 ? uniqueCandidate : null,
    }));

    return buildSchemaGraphResult(options, Array.from(tablesByName.values()), relationships, {
        relationships: true,
        compositeForeignKeys: true,
        cardinality: true,
        referentialActions: true,
        constraintsEnforced: true,
    });
}

async function getDatabaseTablesDetail(datasource: MySqlDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const result = await datasource.queryWithContext<TableMetaRow>(TABLE_DETAIL_SQL, {
        database,
        params: [database],
    });

    return result.rows.map(normalizeObjectRow).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function getTablesOnly(datasource: MySqlDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => row.engine?.toUpperCase() !== 'VIEW');
}

async function getViews(datasource: MySqlDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => row.engine?.toUpperCase() === 'VIEW');
}

async function getDatabaseSummary(datasource: MySqlDatasource, options: DatabaseSummaryOptions): Promise<DatabaseSummary> {
    const rows = await getDatabaseTablesDetail(datasource, options.database);
    const tables = rows.filter(row => row.engine?.toUpperCase() !== 'VIEW');
    const views = rows.filter(row => row.engine?.toUpperCase() === 'VIEW');

    const [columnCounts, relationshipResult] = await Promise.all([
        datasource.queryWithContext<ColumnCountRow>(
            `
                SELECT
                    table_name AS name,
                    COUNT(*) AS columnCount
                FROM information_schema.columns
                WHERE table_schema = ?
                GROUP BY table_name
            `,
            {
                database: options.database,
                params: [options.database],
            },
        ),
        datasource.queryWithContext<RelationshipRow>(
            `
                SELECT DISTINCT
                    table_name AS sourceTableName,
                    referenced_table_name AS targetTableName
                FROM information_schema.key_column_usage
                WHERE table_schema = ?
                  AND referenced_table_schema = ?
                  AND referenced_table_name IS NOT NULL
            `,
            {
                database: options.database,
                params: [options.database, options.database],
            },
        ),
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
        .map(row => ({
            name: row.name ?? null,
            columnCount: toNumberOrNull(row.columnCount),
        }))
        .sort((a, b) => (b.columnCount ?? 0) - (a.columnCount ?? 0))[0];

    const topTablesByBytes: DatabaseSummaryTable[] = [...tables]
        .sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
        .slice(0, 5)
        .map(table => ({
            name: table.name,
            bytes: table.totalBytes ?? null,
            rowsEstimate: table.totalRows ?? null,
            comment: table.comment ?? null,
        }));

    const topTablesByRows: DatabaseSummaryTable[] = [...tables]
        .sort((a, b) => (b.totalRows ?? 0) - (a.totalRows ?? 0))
        .slice(0, 5)
        .map(table => ({
            name: table.name,
            bytes: table.totalBytes ?? null,
            rowsEstimate: table.totalRows ?? null,
            comment: table.comment ?? null,
        }));

    const recentTables = [...rows]
        .filter(row => row.lastModified)
        .sort((a, b) => String(b.lastModified ?? '').localeCompare(String(a.lastModified ?? '')))
        .slice(0, 5)
        .map(row => ({
            name: row.name,
            lastUpdatedAt: row.lastModified ?? null,
        }));

    const recommendations = buildRecommendations(tables, relationshipRows);

    return {
        databaseName: options.database,
        catalogName: options.catalogName ?? null,
        schemaName: null,
        engine: options.engine ?? 'mysql',
        cluster: options.cluster ?? null,
        owner: null,
        tablesCount: tables.length,
        viewsCount: views.length,
        materializedViewsCount: null,
        functionsCount: null,
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
        recentTables,
        startHere: recommendations,
        oneLineSummary:
            tables.length > 0 ? `${options.database} has ${tables.length} tables and ${views.length} views.` : `${options.database} is available but does not expose user tables.`,
    };
}

export function createMysqlMetadataCapability(datasource: MySqlDatasource): MysqlMetadataAPI {
    return {
        getDatabases: () => getDatabases(datasource),
        getTables: database => getTables(datasource, database),
        getSchema: database => getSchema(datasource, database),
        getTableColumns: (database, table) => getTableColumns(datasource, database, table),
        getTablesOnly: database => getTablesOnly(datasource, database),
        getViews: database => getViews(datasource, database),
        getDatabaseSummary: options => getDatabaseSummary(datasource, options),
        getDatabaseTablesDetail: database => getDatabaseTablesDetail(datasource, database),
        getSchemaGraph: options => getSchemaGraph(datasource, options),
        getSchemaSnapshot: input => getMysqlSchemaSnapshot(datasource, datasource.config.type, input),
    };
}
