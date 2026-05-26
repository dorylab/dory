import type { GetTableInfoAPI } from '@dory/drivers/types';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@dory/drivers/types';
import type { TableIndexInfo, TablePropertiesRow, TableStats } from '@dory/drivers/types';
import type { SqlServerDatasource } from '../datasource';
import { parseSqlServerTableReference, quoteSqlServerQualifiedName } from '../runtime';

type TableIdentityRow = {
    objectId?: number;
    schemaName?: string;
    tableName?: string;
    objectType?: string | null;
    comment?: string | null;
    totalRows?: number | string | null;
    totalBytes?: number | string | null;
    primaryKey?: string | null;
};

type ColumnRow = {
    columnName?: string;
    dataType?: string | null;
    maxLength?: number | string | null;
    precision?: number | string | null;
    scale?: number | string | null;
    isNullable?: boolean | number | string | null;
    defaultExpression?: string | null;
};

type DefinitionRow = {
    definition?: string | null;
};

type IndexRow = {
    name?: string;
    method?: string | null;
    isPrimary?: boolean | number | null;
    isUnique?: boolean | number | null;
    sizeBytes?: number | string | null;
    definition?: string | null;
};

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizePreviewLimit(limit?: number): number {
    if (!Number.isFinite(limit) || !limit || limit <= 0) {
        return DEFAULT_TABLE_PREVIEW_LIMIT;
    }
    return Math.floor(limit);
}

function resolveTableInput(table: string) {
    const parsed = parseSqlServerTableReference(table);
    return {
        schema: parsed.schema ?? 'dbo',
        table: parsed.table,
    };
}

function formatDataType(row: ColumnRow) {
    const type = row.dataType ?? 'unknown';
    const maxLength = toNumberOrNull(row.maxLength);
    const precision = toNumberOrNull(row.precision);
    const scale = toNumberOrNull(row.scale);
    if (['varchar', 'nvarchar', 'char', 'nchar', 'binary', 'varbinary'].includes(type) && maxLength) {
        return `${type}(${maxLength === -1 ? 'max' : maxLength})`;
    }
    if (['decimal', 'numeric'].includes(type) && precision) {
        return `${type}(${precision}, ${scale ?? 0})`;
    }
    return type;
}

async function getTableIdentity(datasource: SqlServerDatasource, database: string, table: string) {
    const target = resolveTableInput(table);
    const result = await datasource.queryWithContext<TableIdentityRow>(
        `
            SELECT
                o.object_id AS objectId,
                s.name AS schemaName,
                o.name AS tableName,
                o.type_desc AS objectType,
                CAST(ep.value AS nvarchar(max)) AS comment,
                SUM(p.rows) AS totalRows,
                SUM(a.total_pages) * 8 * 1024 AS totalBytes,
                STRING_AGG(CASE WHEN kc.type = 'PK' THEN c.name END, ', ') AS primaryKey
            FROM sys.objects o
            JOIN sys.schemas s ON s.schema_id = o.schema_id
            LEFT JOIN sys.partitions p ON p.object_id = o.object_id AND p.index_id IN (0, 1)
            LEFT JOIN sys.allocation_units a ON a.container_id = p.partition_id
            LEFT JOIN sys.extended_properties ep
              ON ep.major_id = o.object_id
             AND ep.minor_id = 0
             AND ep.name = 'MS_Description'
            LEFT JOIN sys.indexes i ON i.object_id = o.object_id AND i.is_primary_key = 1
            LEFT JOIN sys.key_constraints kc ON kc.parent_object_id = o.object_id AND kc.unique_index_id = i.index_id
            LEFT JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
            LEFT JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
            WHERE s.name = @schemaName
              AND o.name = @tableName
              AND o.type IN ('U', 'V')
            GROUP BY o.object_id, s.name, o.name, o.type_desc, CAST(ep.value AS nvarchar(max))
        `,
        {
            database,
            params: { schemaName: target.schema, tableName: target.table },
        },
    );

    return {
        target,
        row: result.rows[0] ?? null,
    };
}

async function getTableProperties(datasource: SqlServerDatasource, database: string, table: string): Promise<TablePropertiesRow | null> {
    const { row } = await getTableIdentity(datasource, database, table);
    if (!row) return null;

    return {
        engine: row.objectType ?? null,
        comment: row.comment ?? null,
        primaryKey: row.primaryKey ?? null,
        sortingKey: null,
        partitionKey: null,
        samplingKey: null,
        storagePolicy: null,
        totalRows: toNumberOrNull(row.totalRows),
        totalBytes: toNumberOrNull(row.totalBytes),
    };
}

async function getTableDDL(datasource: SqlServerDatasource, database: string, table: string): Promise<string | null> {
    const { target, row } = await getTableIdentity(datasource, database, table);
    if (!row) return null;

    const qualifiedName = quoteSqlServerQualifiedName(target.schema, target.table);
    if (row.objectType === 'VIEW') {
        const definition = await datasource.queryWithContext<DefinitionRow>('SELECT OBJECT_DEFINITION(OBJECT_ID(@qualifiedName)) AS definition', {
            database,
            params: { qualifiedName: `${target.schema}.${target.table}` },
        });
        return definition.rows[0]?.definition?.trim() ?? null;
    }

    const columns = await datasource.queryWithContext<ColumnRow>(
        `
            SELECT
                c.name AS columnName,
                t.name AS dataType,
                c.max_length AS maxLength,
                c.precision AS precision,
                c.scale AS scale,
                c.is_nullable AS isNullable,
                dc.definition AS defaultExpression
            FROM sys.columns c
            JOIN sys.types t ON t.user_type_id = c.user_type_id
            LEFT JOIN sys.default_constraints dc
              ON dc.parent_object_id = c.object_id
             AND dc.parent_column_id = c.column_id
            WHERE c.object_id = OBJECT_ID(@qualifiedName)
            ORDER BY c.column_id
        `,
        {
            database,
            params: { qualifiedName: `${target.schema}.${target.table}` },
        },
    );

    const columnLines = columns.rows.map(column => {
        const nullable = column.isNullable ? ' NULL' : ' NOT NULL';
        const defaultClause = column.defaultExpression ? ` DEFAULT ${column.defaultExpression}` : '';
        return `    [${(column.columnName ?? '').replace(/]/g, ']]')}] ${formatDataType(column)}${nullable}${defaultClause}`;
    });

    if (row.primaryKey) {
        const primaryKey = row.primaryKey
            .split(',')
            .map(part => `[${part.trim().replace(/]/g, ']]')}]`)
            .join(', ');
        columnLines.push(`    PRIMARY KEY (${primaryKey})`);
    }

    return columnLines.length ? `CREATE TABLE ${qualifiedName} (\n${columnLines.join(',\n')}\n);` : `CREATE TABLE ${qualifiedName} ();`;
}

async function getTableStats(datasource: SqlServerDatasource, database: string, table: string): Promise<TableStats | null> {
    const { row } = await getTableIdentity(datasource, database, table);
    if (!row) return null;
    const totalBytes = toNumberOrNull(row.totalBytes);

    return {
        rowCount: toNumberOrNull(row.totalRows),
        compressedBytes: totalBytes,
        uncompressedBytes: totalBytes,
        compressionRatio: null,
        partitionCount: 0,
        partitions: [],
        partCount: 0,
        avgPartSize: null,
        maxPartSize: null,
        activeMutations: [],
        ttlExpression: null,
        totalBytes,
        rowEstimate: toNumberOrNull(row.totalRows),
    };
}

async function getTablePreview(datasource: SqlServerDatasource, database: string, table: string, options?: { limit?: number; offset?: number }) {
    const target = resolveTableInput(table);
    const limit = normalizePreviewLimit(options?.limit);
    const offset = options?.offset ?? 0;
    const qualifiedName = quoteSqlServerQualifiedName(target.schema, target.table);
    const sql =
        offset > 0 ? `SELECT * FROM ${qualifiedName} ORDER BY (SELECT NULL) OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY` : `SELECT TOP (@limit) * FROM ${qualifiedName}`;
    const result = await datasource.queryWithContext<Record<string, unknown>>(sql, {
        database,
        params: { limit, offset },
    });

    return {
        ...result,
        limited: true,
        limit,
    };
}

async function getTableIndexes(datasource: SqlServerDatasource, database: string, table: string): Promise<TableIndexInfo[]> {
    const target = resolveTableInput(table);
    const result = await datasource.queryWithContext<IndexRow>(
        `
            SELECT
                i.name AS name,
                i.type_desc AS method,
                i.is_primary_key AS isPrimary,
                i.is_unique AS isUnique,
                SUM(a.total_pages) * 8 * 1024 AS sizeBytes,
                NULL AS definition
            FROM sys.indexes i
            JOIN sys.objects o ON o.object_id = i.object_id
            JOIN sys.schemas s ON s.schema_id = o.schema_id
            LEFT JOIN sys.partitions p ON p.object_id = i.object_id AND p.index_id = i.index_id
            LEFT JOIN sys.allocation_units a ON a.container_id = p.partition_id
            WHERE s.name = @schemaName
              AND o.name = @tableName
              AND i.name IS NOT NULL
            GROUP BY i.name, i.type_desc, i.is_primary_key, i.is_unique
            ORDER BY i.is_primary_key DESC, i.name
        `,
        {
            database,
            params: { schemaName: target.schema, tableName: target.table },
        },
    );

    return (result.rows ?? []).map(row => ({
        name: row.name ?? 'index',
        method: row.method ?? null,
        isPrimary: Boolean(row.isPrimary),
        isUnique: Boolean(row.isUnique),
        sizeBytes: toNumberOrNull(row.sizeBytes),
        definition: row.definition ?? null,
    }));
}

export function createSqlServerTableInfoCapability(datasource: SqlServerDatasource): GetTableInfoAPI {
    return {
        properties: (database: string, table: string) => getTableProperties(datasource, database, table),
        ddl: (database: string, table: string) => getTableDDL(datasource, database, table),
        stats: (database: string, table: string) => getTableStats(datasource, database, table),
        preview: (database: string, table: string, options) => getTablePreview(datasource, database, table, options),
        indexes: (database: string, table: string) => getTableIndexes(datasource, database, table),
    };
}
