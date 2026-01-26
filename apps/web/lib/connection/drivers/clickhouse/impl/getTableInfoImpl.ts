import { GetTableInfoAPI } from '@/lib/connection/base/types';
import { TableMutationInfo, TablePartitionStat, TablePropertiesRow, TableStats } from '@/types/table-info';
import { ClickhouseDatasource } from '../ClickhouseDatasource';

type SizeRow = {
    rowCount?: number;
    compressedBytes?: number;
    uncompressedBytes?: number;
    compressionRatio?: number;
};

type PartitionRow = {
    name?: string;
    rowCount?: number;
    compressedBytes?: number;
    uncompressedBytes?: number;
};

type PartAggRow = {
    partCount?: number;
    avgPartSize?: number;
    maxPartSize?: number;
};

type MutationRow = {
    id?: string;
    command?: string;
    partsToDo?: number;
    partsDone?: number;
    isDone?: number;
    createTime?: string;
};

type TTLRow = {
    ttlExpression?: string | null;
};

const toNumberOrNull = (value: unknown): number | null => {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
};

const toStringOrNull = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const str = String(value);
    return str.length ? str : null;
};

export async function getTableProperties(datasource: ClickhouseDatasource, database: string, table: string): Promise<TablePropertiesRow | null> {
    const tablePropsQuery = `
        SELECT
            engine,
            comment,
            primary_key   AS primaryKey,
            sorting_key   AS sortingKey,
            partition_key AS partitionKey,
            sampling_key  AS samplingKey,
            storage_policy AS storagePolicy
        FROM system.tables
        WHERE database = {db:String}
        AND name = {tbl:String}
        LIMIT 1;
    `;

    try {
        const result = await datasource.query<TablePropertiesRow>(tablePropsQuery, { db: database, tbl: table });
        const rows = Array.isArray(result.rows) ? (result.rows as TablePropertiesRow[]) : [];
        return rows[0] ?? null;
    } catch (error) {
        console.error('Error fetching table properties:', error);
        throw error;
    }
}

export async function getTableDDL(datasource: ClickhouseDatasource, database: string, table: string): Promise<string | null> {
    const ddlQuery = 'SHOW CREATE TABLE {db:Identifier}.{tbl:Identifier}';

    try {
        const result = await datasource.queryWithContext<{ statement?: string }>(ddlQuery, {
            database,
            params: { db: database, tbl: table },
        });
        const ddl = Array.isArray(result.rows) && typeof result.rows[0]?.statement === 'string' ? result.rows[0].statement : null;
        return ddl ?? null;
    } catch (error) {
        console.error('Error fetching table DDL:', error);
        throw error;
    }
}

export async function getTableStats(datasource: ClickhouseDatasource, database: string, table: string): Promise<TableStats> {
    const params = { db: database, tbl: table };

    const sizeQuery = `
        SELECT
            sum(rows) AS rowCount,
            sum(data_compressed_bytes) AS compressedBytes,
            sum(data_uncompressed_bytes) AS uncompressedBytes,
            if(sum(data_uncompressed_bytes) = 0, null, sum(data_compressed_bytes) / sum(data_uncompressed_bytes)) AS compressionRatio
        FROM system.parts
        WHERE database = {db:String}
        AND table = {tbl:String}
        AND active
    `;

    const partitionsQuery = `
        SELECT
            toString(partition) AS name,
            sum(rows) AS rowCount,
            sum(data_compressed_bytes) AS compressedBytes,
            sum(data_uncompressed_bytes) AS uncompressedBytes
        FROM system.parts
        WHERE database = {db:String}
        AND table = {tbl:String}
        AND active
        GROUP BY partition
        ORDER BY partition
    `;

    const partsAggQuery = `
        SELECT
            count() AS partCount,
            avg(data_compressed_bytes) AS avgPartSize,
            max(data_compressed_bytes) AS maxPartSize
        FROM system.parts
        WHERE database = {db:String}
        AND table = {tbl:String}
        AND active
    `;

    const mutationsQuery = `
        SELECT
            mutation_id AS id,
            command,
            parts_to_do AS partsToDo,
            is_done AS isDone,
            toString(create_time) AS createTime
        FROM system.mutations
        WHERE database = {db:String}
        AND table = {tbl:String}
        AND is_done = 0
        ORDER BY create_time DESC
        LIMIT 20
    `;

    // const ttlQuery = `
    //     SELECT
    //         ttl_expression AS ttlExpression
    //     FROM system.tables
    //     WHERE database = {db:String}
    //     AND name = {tbl:String}
    //     LIMIT 1
    // `;

    const [sizeRes, partitionsRes, partsAggRes, mutationsRes] = await Promise.all([
        datasource.query<SizeRow>(sizeQuery, params),
        datasource.query<PartitionRow>(partitionsQuery, params),
        datasource.query<PartAggRow>(partsAggQuery, params),
        datasource.query<MutationRow>(mutationsQuery, params),
    ]);

    // let ttlExpression: string | null = null;
    // try {
    //     const ttlRes = await datasource.query<TTLRow>(ttlQuery, params);
    //     ttlExpression = toStringOrNull(ttlRes.rows?.[0]?.ttlExpression);
    // } catch (error) {
    //     console.warn('Failed to fetch TTL expression for table', database, table, error);
    // }

    const sizeRow = (sizeRes.rows?.[0] as SizeRow | undefined) ?? {};
    const partsRow = (partsAggRes.rows?.[0] as PartAggRow | undefined) ?? {};

    const partitions: TablePartitionStat[] = (Array.isArray(partitionsRes.rows) ? partitionsRes.rows : []).map(row => ({
        name: row?.name ? String(row.name) : 'partition',
        rowCount: toNumberOrNull(row?.rowCount) ?? 0,
        compressedBytes: toNumberOrNull(row?.compressedBytes) ?? 0,
        uncompressedBytes: toNumberOrNull(row?.uncompressedBytes) ?? 0,
    }));

    const activeMutations: TableMutationInfo[] = (Array.isArray(mutationsRes.rows) ? mutationsRes.rows : [])
        .filter(row => !!row?.id)
        .map(row => {
            const partsToDo = toNumberOrNull(row?.partsToDo);
            const partsDone = toNumberOrNull(row?.partsDone);
            const denominator = partsToDo && partsToDo > 0 ? partsToDo : null;
            const progress = denominator ? Math.min(1, (partsDone ?? 0) / denominator) : null;

            return {
                id: String(row?.id),
                command: row?.command ?? null,
                partsToDo,
                partsDone,
                progress,
                createTime: toStringOrNull(row?.createTime),
            };
        });

    return {
        rowCount: toNumberOrNull(sizeRow.rowCount),
        compressedBytes: toNumberOrNull(sizeRow.compressedBytes),
        uncompressedBytes: toNumberOrNull(sizeRow.uncompressedBytes),
        compressionRatio: toNumberOrNull(sizeRow.compressionRatio),
        partitionCount: partitions.length,
        partitions,
        partCount: toNumberOrNull(partsRow.partCount) ?? 0,
        avgPartSize: toNumberOrNull(partsRow.avgPartSize),
        maxPartSize: toNumberOrNull(partsRow.maxPartSize),
        activeMutations,
        // ttlExpression,
    };
}

export function getTableInfoImpl(datasource: ClickhouseDatasource): GetTableInfoAPI {
    return {
        properties: (database: string, table: string) => getTableProperties(datasource, database, table),
        ddl: (database: string, table: string) => getTableDDL(datasource, database, table),
        stats: (database: string, table: string) => getTableStats(datasource, database, table),
    };
}
