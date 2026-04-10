import type { GetTableInfoAPI } from '@/lib/connection/base/types';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';
import type { TableIndexInfo, TablePropertiesRow, TableStats } from '@/types/table-info';
import type { MySqlDatasource } from '../MySqlDatasource';
import { parseMysqlTableReference, quoteMysqlQualifiedTable } from '../mysql-driver';

type TableIdentityRow = {
    name?: string;
    tableType?: string | null;
    engine?: string | null;
    comment?: string | null;
    totalRows?: number | string | null;
    dataBytes?: number | string | null;
    indexBytes?: number | string | null;
};

type PrimaryKeyRow = {
    primaryKey?: string | null;
};

type PartitionRow = {
    name?: string | null;
    rowCount?: number | string | null;
    dataBytes?: number | string | null;
    indexBytes?: number | string | null;
};

type CreateStatementRow = Record<string, unknown>;

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

function resolveTableInput(database: string, table: string) {
    const parsed = parseMysqlTableReference(table);

    return {
        database: parsed.database ?? database,
        table: parsed.table,
    };
}

function toTotalBytes(row: { dataBytes?: unknown; indexBytes?: unknown }) {
    const dataBytes = toNumberOrNull(row.dataBytes);
    const indexBytes = toNumberOrNull(row.indexBytes);

    if (dataBytes === null && indexBytes === null) {
        return null;
    }

    return (dataBytes ?? 0) + (indexBytes ?? 0);
}

async function getTableIdentity(datasource: MySqlDatasource, database: string, table: string) {
    const target = resolveTableInput(database, table);

    const result = await datasource.queryWithContext<TableIdentityRow>(
        `
            SELECT
                table_name AS name,
                table_type AS tableType,
                CASE
                    WHEN table_type = 'VIEW' THEN 'VIEW'
                    ELSE engine
                END AS engine,
                table_comment AS comment,
                table_rows AS totalRows,
                data_length AS dataBytes,
                index_length AS indexBytes
            FROM information_schema.tables
            WHERE table_schema = ?
              AND table_name = ?
            LIMIT 1
        `,
        {
            database: target.database,
            params: [target.database, target.table],
        },
    );

    return {
        target,
        row: result.rows[0] ?? null,
    };
}

async function getPrimaryKey(datasource: MySqlDatasource, database: string, table: string) {
    const target = resolveTableInput(database, table);

    const result = await datasource.queryWithContext<PrimaryKeyRow>(
        `
            SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ', ') AS primaryKey
            FROM information_schema.statistics
            WHERE table_schema = ?
              AND table_name = ?
              AND index_name = 'PRIMARY'
        `,
        {
            database: target.database,
            params: [target.database, target.table],
        },
    );

    return result.rows[0]?.primaryKey ?? null;
}

async function getTableProperties(datasource: MySqlDatasource, database: string, table: string): Promise<TablePropertiesRow | null> {
    const [{ row }, primaryKey] = await Promise.all([getTableIdentity(datasource, database, table), getPrimaryKey(datasource, database, table)]);

    if (!row) {
        return null;
    }

    return {
        engine: row.engine ?? null,
        comment: row.comment ?? null,
        primaryKey,
        sortingKey: null,
        partitionKey: null,
        samplingKey: null,
        storagePolicy: null,
        totalRows: toNumberOrNull(row.totalRows),
        totalBytes: toTotalBytes(row),
    };
}

function extractCreateStatement(row?: CreateStatementRow | null): string | null {
    if (!row) return null;

    for (const [key, value] of Object.entries(row)) {
        if (/^create\s+/i.test(key) && typeof value === 'string') {
            return value;
        }
    }

    return null;
}

async function getTableDDL(datasource: MySqlDatasource, database: string, table: string): Promise<string | null> {
    const { target, row } = await getTableIdentity(datasource, database, table);
    if (!row) {
        return null;
    }

    const qualifiedTable = quoteMysqlQualifiedTable(target.database, target.table);
    const statementType = row.tableType === 'VIEW' ? 'VIEW' : 'TABLE';
    const result = await datasource.queryWithContext<CreateStatementRow>(`SHOW CREATE ${statementType} ${qualifiedTable}`, {
        database: target.database,
    });

    return extractCreateStatement(result.rows[0] ?? null);
}

async function getTableStats(datasource: MySqlDatasource, database: string, table: string): Promise<TableStats | null> {
    const { target, row } = await getTableIdentity(datasource, database, table);
    if (!row) {
        return null;
    }

    const partitionsResult = await datasource.queryWithContext<PartitionRow>(
        `
            SELECT
                partition_name AS name,
                table_rows AS rowCount,
                data_length AS dataBytes,
                index_length AS indexBytes
            FROM information_schema.partitions
            WHERE table_schema = ?
              AND table_name = ?
              AND partition_name IS NOT NULL
            ORDER BY partition_ordinal_position
        `,
        {
            database: target.database,
            params: [target.database, target.table],
        },
    );

    const partitions = (partitionsResult.rows ?? []).map(partition => {
        const totalBytes = toTotalBytes(partition);
        return {
            name: partition.name ?? 'partition',
            rowCount: toNumberOrNull(partition.rowCount) ?? 0,
            compressedBytes: totalBytes ?? 0,
            uncompressedBytes: totalBytes ?? 0,
        };
    });
    const totalBytes = toTotalBytes(row);

    return {
        rowCount: toNumberOrNull(row.totalRows),
        compressedBytes: totalBytes,
        uncompressedBytes: totalBytes,
        compressionRatio: null,
        partitionCount: partitions.length,
        partitions,
        partCount: partitions.length,
        avgPartSize: partitions.length > 0 ? Number((partitions.reduce((sum, partition) => sum + partition.compressedBytes, 0) / partitions.length).toFixed(2)) : null,
        maxPartSize: partitions.length > 0 ? Math.max(...partitions.map(partition => partition.compressedBytes)) : null,
        activeMutations: [],
        ttlExpression: null,
        totalBytes,
        rowEstimate: toNumberOrNull(row.totalRows),
    };
}

async function getTablePreview(datasource: MySqlDatasource, database: string, table: string, options?: { limit?: number; offset?: number }) {
    const target = resolveTableInput(database, table);
    const limit = normalizePreviewLimit(options?.limit);
    const offset = options?.offset ?? 0;
    const result = await datasource.queryWithContext<Record<string, unknown>>(`SELECT * FROM ${quoteMysqlQualifiedTable(target.database, target.table)} LIMIT ? OFFSET ?`, {
        database: target.database,
        params: [limit, offset],
    });

    return {
        ...result,
        limited: true,
        limit,
    };
}

async function getTableIndexes(datasource: MySqlDatasource, database: string, table: string): Promise<TableIndexInfo[]> {
    const target = resolveTableInput(database, table);
    const result = await datasource.queryWithContext<TableIndexInfo>(
        `
            SELECT
                index_name AS name,
                index_type AS method,
                CASE WHEN index_name = 'PRIMARY' THEN true ELSE false END AS isPrimary,
                CASE WHEN non_unique = 0 THEN true ELSE false END AS isUnique,
                NULL AS sizeBytes,
                NULL AS definition
            FROM information_schema.statistics
            WHERE table_schema = ?
              AND table_name = ?
            GROUP BY index_name, index_type, non_unique
            ORDER BY
                CASE WHEN index_name = 'PRIMARY' THEN 0 ELSE 1 END,
                index_name
        `,
        {
            database: target.database,
            params: [target.database, target.table],
        },
    );

    return Array.isArray(result.rows) ? result.rows : [];
}

export function createMysqlTableInfoCapability(datasource: MySqlDatasource): GetTableInfoAPI {
    return {
        properties: (database: string, table: string) => getTableProperties(datasource, database, table),
        ddl: (database: string, table: string) => getTableDDL(datasource, database, table),
        stats: (database: string, table: string) => getTableStats(datasource, database, table),
        preview: (database: string, table: string, options) => getTablePreview(datasource, database, table, options),
        indexes: (database: string, table: string) => getTableIndexes(datasource, database, table),
    };
}
