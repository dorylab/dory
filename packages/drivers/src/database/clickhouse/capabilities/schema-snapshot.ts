import { finalizeSchemaSnapshot, type SchemaSnapshot, type SchemaSnapshotInput, type SchemaTable } from '@dory/schema-compare';

import type { ClickhouseDatasource } from '../datasource';

type ColumnRow = {
    tableName?: string;
    columnName?: string;
    dataType?: string | null;
    ordinal?: number | string | null;
    defaultKind?: string | null;
    defaultExpression?: string | null;
    codecExpression?: string | null;
};

type TableRow = {
    tableName?: string;
    engine?: string | null;
    sortingKey?: string | null;
    primaryKey?: string | null;
    partitionKey?: string | null;
    samplingKey?: string | null;
    createQuery?: string | null;
    estimatedRows?: number | string | null;
    totalBytes?: number | string | null;
};

type IndexRow = {
    tableName?: string;
    indexName?: string;
    indexType?: string | null;
    expression?: string | null;
    granularity?: number | string | null;
};

function numberValue(value: unknown) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function unwrapNullable(type: string | null | undefined) {
    const value = type?.trim() ?? '';
    const match = /^Nullable\((.*)\)$/i.exec(value);
    return {
        dataType: match?.[1] ?? (value || null),
        nullable: Boolean(match),
    };
}

function extractTtl(createQuery: string | null | undefined) {
    if (!createQuery) return null;
    const match = /\bTTL\s+([\s\S]+?)(?=\s+SETTINGS\b|\s+COMMENT\b|$)/i.exec(createQuery);
    return match?.[1]?.trim() ?? null;
}

function normalizedEngine(value: string | null | undefined) {
    return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

function isViewEngine(value: string | null | undefined) {
    return ['VIEW', 'LIVEVIEW', 'LAZYVIEW', 'WINDOWVIEW'].includes(normalizedEngine(value));
}

function isMaterializedViewEngine(value: string | null | undefined) {
    return normalizedEngine(value) === 'MATERIALIZEDVIEW';
}

async function safeQuery<Row>(datasource: ClickhouseDatasource, sql: string, database: string) {
    try {
        const result = await datasource.queryWithContext<Row>(sql, { database, params: { db: database } });
        return { available: true, rows: result.rows };
    } catch {
        return { available: false, rows: [] as Row[] };
    }
}

export async function getClickHouseSchemaSnapshot(datasource: ClickhouseDatasource, input: SchemaSnapshotInput): Promise<SchemaSnapshot> {
    const [columnResult, tableResult, indexResult] = await Promise.all([
        safeQuery<ColumnRow>(
            datasource,
            `
                SELECT
                    table AS tableName,
                    name AS columnName,
                    type AS dataType,
                    position AS ordinal,
                    default_kind AS defaultKind,
                    default_expression AS defaultExpression,
                    compression_codec AS codecExpression
                FROM system.columns
                WHERE database = {db:String}
                ORDER BY table, position
            `,
            input.database,
        ),
        safeQuery<TableRow>(
            datasource,
            `
                SELECT
                    name AS tableName,
                    engine,
                    sorting_key AS sortingKey,
                    primary_key AS primaryKey,
                    partition_key AS partitionKey,
                    sampling_key AS samplingKey,
                    create_table_query AS createQuery,
                    total_rows AS estimatedRows,
                    total_bytes AS totalBytes
                FROM system.tables
                WHERE database = {db:String}
                ORDER BY name
            `,
            input.database,
        ),
        safeQuery<IndexRow>(
            datasource,
            `
                SELECT
                    table AS tableName,
                    name AS indexName,
                    type_full AS indexType,
                    expr AS expression,
                    granularity
                FROM system.data_skipping_indices
                WHERE database = {db:String}
                ORDER BY table, name
            `,
            input.database,
        ),
    ]);
    if (![columnResult, tableResult, indexResult].some(result => result.available)) {
        throw new Error('ClickHouse schema catalogs are unavailable.');
    }

    const tableRows = new Map(tableResult.rows.flatMap(row => (row.tableName ? [[row.tableName, row] as const] : [])));
    const tables = new Map<string, SchemaTable>();
    for (const row of columnResult.rows) {
        const tableName = row.tableName?.trim();
        const columnName = row.columnName?.trim();
        const tableRow = tableName ? tableRows.get(tableName) : null;
        if (!tableName || !columnName || !tableRow || isViewEngine(tableRow.engine) || isMaterializedViewEngine(tableRow.engine)) continue;
        const table = tables.get(tableName) ?? {
            schema: null,
            name: tableName,
            columns: [],
            indexes: [],
            constraints: [],
            attributes: {
                engine: tableRow.engine ?? null,
                sorting_key: tableRow.sortingKey ?? null,
                primary_key: tableRow.primaryKey ?? null,
                partition_key: tableRow.partitionKey ?? null,
                sampling_key: tableRow.samplingKey ?? null,
                ttl: extractTtl(tableRow.createQuery),
            },
            statistics: {
                estimatedRows: numberValue(tableRow.estimatedRows),
                totalBytes: numberValue(tableRow.totalBytes),
                source: 'catalog_estimate' as const,
            },
        };
        const type = unwrapNullable(row.dataType);
        table.columns.push({
            name: columnName,
            dataType: type.dataType,
            nullable: type.nullable,
            defaultExpression: row.defaultExpression ?? null,
            ordinal: numberValue(row.ordinal),
            attributes: {
                default_kind: row.defaultKind ?? null,
                codec: row.codecExpression ?? null,
            },
        });
        tables.set(tableName, table);
    }

    for (const row of indexResult.rows) {
        const table = row.tableName ? tables.get(row.tableName) : null;
        if (!table || !row.indexName) continue;
        table.indexes.push({
            name: row.indexName,
            columns: [],
            unique: false,
            primary: false,
            method: row.indexType ?? null,
            expression: row.expression ?? null,
            predicate: row.granularity == null ? null : `GRANULARITY ${row.granularity}`,
            scans: null,
        });
    }

    const warnings = ['ClickHouse constraint coverage is partial; engine-specific constraints are not compared.'];
    if (input.schemas?.length) warnings.push('ClickHouse uses the database as the comparison scope; schema filters were ignored.');
    if (!columnResult.available) warnings.push('ClickHouse column catalogs were unavailable.');
    if (!tableResult.available) warnings.push('ClickHouse table definitions and statistics were unavailable.');
    if (!indexResult.available) warnings.push('ClickHouse data-skipping index catalogs were unavailable.');

    return finalizeSchemaSnapshot({
        family: 'clickhouse',
        engine: 'clickhouse',
        database: input.database,
        schemas: [],
        capturedAt: new Date().toISOString(),
        coverage: {
            tables: tableResult.available && columnResult.available ? 'complete' : tableResult.available || columnResult.available ? 'partial' : 'unavailable',
            columns: columnResult.available ? 'complete' : 'unavailable',
            indexes: indexResult.available ? 'complete' : 'unavailable',
            constraints: 'partial',
            views: tableResult.available ? 'complete' : 'unavailable',
            statistics: tableResult.available ? 'complete' : 'unavailable',
        },
        tables: [...tables.values()],
        views: tableResult.rows.flatMap(row => {
            if (!row.tableName || (!isViewEngine(row.engine) && !isMaterializedViewEngine(row.engine))) return [];
            return [
                {
                    schema: null,
                    name: row.tableName,
                    kind: isMaterializedViewEngine(row.engine) ? ('materialized_view' as const) : ('view' as const),
                    definition: row.createQuery ?? null,
                },
            ];
        }),
        warnings,
    });
}
