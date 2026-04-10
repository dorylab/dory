import type { GetTableInfoAPI } from '@/lib/connection/base/types';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';
import type { TableIndexInfo, TablePropertiesRow, TableStats } from '@/types/table-info';
import type { PostgresDatasource } from '../PostgresDatasource';

type TableIdentityRow = {
    oid?: number;
    schemaName?: string;
    tableName?: string;
    relkind?: string;
    accessMethod?: string | null;
    comment?: string | null;
    totalRows?: number | string | null;
    totalBytes?: number | string | null;
    primaryKey?: string | null;
    partitionKey?: string | null;
};

type TableColumnRow = {
    columnName?: string;
    dataType?: string;
    isNullable?: string;
    columnDefault?: string | null;
};

type ViewDefRow = {
    definition?: string | null;
};

type PartitionRow = {
    name?: string;
    rowCount?: number | string | null;
    compressedBytes?: number | string | null;
};

type TableIndexRow = {
    indexName?: string;
    method?: string | null;
    isPrimary?: boolean | null;
    isUnique?: boolean | null;
    sizeBytes?: number | string | null;
    definition?: string | null;
};

type IndexUsageRow = {
    indexName?: string;
    indexScans?: number | string | null;
    tupleReads?: number | string | null;
    tupleFetches?: number | string | null;
    sizeBytes?: number | string | null;
};

type VacuumStatRow = {
    lastVacuum?: string | null;
    lastAutovacuum?: string | null;
    lastAnalyze?: string | null;
    lastAutoanalyze?: string | null;
    deadTuples?: number | string | null;
    liveTuples?: number | string | null;
    modsSinceAnalyze?: number | string | null;
};

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseTableName(table: string): { schema: string | null; name: string } {
    const trimmed = table.trim();
    const [schema, ...rest] = trimmed.split('.');
    if (!rest.length) {
        return { schema: null, name: schema };
    }
    return { schema, name: rest.join('.') };
}

function quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

function normalizePreviewLimit(limit?: number): number {
    if (!Number.isFinite(limit) || !limit || limit <= 0) {
        return DEFAULT_TABLE_PREVIEW_LIMIT;
    }
    return Math.floor(limit);
}

async function getTableIdentity(datasource: PostgresDatasource, database: string, table: string) {
    const parsed = parseTableName(table);
    const result = await datasource.queryWithContext<TableIdentityRow>(
        `
            SELECT
                c.oid,
                n.nspname AS "schemaName",
                c.relname AS "tableName",
                c.relkind AS relkind,
                am.amname AS "accessMethod",
                obj_description(c.oid, 'pg_class') AS comment,
                COALESCE(s.n_live_tup, c.reltuples) AS "totalRows",
                pg_total_relation_size(c.oid) AS "totalBytes",
                (
                    SELECT string_agg(a.attname, ', ' ORDER BY a.attnum)
                    FROM pg_index i
                    JOIN pg_attribute a
                      ON a.attrelid = i.indrelid
                     AND a.attnum = ANY(i.indkey)
                    WHERE i.indrelid = c.oid
                      AND i.indisprimary
                ) AS "primaryKey",
                CASE
                    WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid)
                    ELSE NULL
                END AS "partitionKey"
            FROM pg_class c
            JOIN pg_namespace n
              ON n.oid = c.relnamespace
            LEFT JOIN pg_am am
              ON am.oid = c.relam
            LEFT JOIN pg_stat_user_tables s
              ON s.relid = c.oid
            WHERE n.nspname = COALESCE($1, current_schema())
              AND c.relname = $2
              AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            LIMIT 1
        `,
        {
            database,
            params: [parsed.schema, parsed.name],
        },
    );

    return result.rows[0] ?? null;
}

async function getTableProperties(datasource: PostgresDatasource, database: string, table: string): Promise<TablePropertiesRow | null> {
    const identity = await getTableIdentity(datasource, database, table);
    if (!identity) {
        return null;
    }

    return {
        engine: identity.accessMethod ?? identity.relkind ?? null,
        comment: identity.comment ?? null,
        primaryKey: identity.primaryKey ?? null,
        sortingKey: null,
        partitionKey: identity.partitionKey ?? null,
        samplingKey: null,
        storagePolicy: null,
        totalRows: toNumberOrNull(identity.totalRows),
        totalBytes: toNumberOrNull(identity.totalBytes),
    };
}

async function getTableDDL(datasource: PostgresDatasource, database: string, table: string): Promise<string | null> {
    const identity = await getTableIdentity(datasource, database, table);
    if (!identity) {
        return null;
    }

    const schemaName = identity.schemaName ?? 'public';
    const tableName = identity.tableName ?? table;
    const qualifiedName = `"${schemaName.replace(/"/g, '""')}"."${tableName.replace(/"/g, '""')}"`;

    if (identity.relkind === 'v' || identity.relkind === 'm') {
        const viewDefinition = await datasource.queryWithContext<ViewDefRow>('SELECT pg_get_viewdef($1::regclass, true) AS definition', {
            database,
            params: [qualifiedName],
        });

        const definition = viewDefinition.rows[0]?.definition?.trim();
        if (!definition) {
            return null;
        }

        return `${identity.relkind === 'm' ? 'CREATE MATERIALIZED VIEW' : 'CREATE VIEW'} ${qualifiedName} AS\n${definition}`;
    }

    const columns = await datasource.queryWithContext<TableColumnRow>(
        `
            SELECT
                column_name AS "columnName",
                udt_name AS "dataType",
                is_nullable AS "isNullable",
                column_default AS "columnDefault"
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = $2
            ORDER BY ordinal_position
        `,
        {
            database,
            params: [schemaName, tableName],
        },
    );

    const columnLines = columns.rows.map(column => {
        const nullable = column.isNullable === 'NO' ? ' NOT NULL' : '';
        const defaultClause = column.columnDefault ? ` DEFAULT ${column.columnDefault}` : '';
        return `    "${(column.columnName ?? '').replace(/"/g, '""')}" ${column.dataType}${defaultClause}${nullable}`;
    });

    if (identity.primaryKey) {
        const primaryKey = identity.primaryKey
            .split(',')
            .map(part => `"${part.trim().replace(/"/g, '""')}"`)
            .join(', ');
        columnLines.push(`    PRIMARY KEY (${primaryKey})`);
    }

    if (!columnLines.length) {
        return `CREATE TABLE ${qualifiedName} ();`;
    }

    return `CREATE TABLE ${qualifiedName} (\n${columnLines.join(',\n')}\n);`;
}

async function getTableStats(datasource: PostgresDatasource, database: string, table: string): Promise<TableStats | null> {
    const identity = await getTableIdentity(datasource, database, table);
    if (!identity?.oid) {
        return null;
    }

    const partitionResult = await datasource.queryWithContext<PartitionRow>(
        `
            SELECT
                child.relname AS name,
                COALESCE(stats.n_live_tup, child.reltuples) AS "rowCount",
                pg_total_relation_size(child.oid) AS "compressedBytes"
            FROM pg_inherits inh
            JOIN pg_class parent
              ON parent.oid = inh.inhparent
            JOIN pg_class child
              ON child.oid = inh.inhrelid
            LEFT JOIN pg_stat_user_tables stats
              ON stats.relid = child.oid
            WHERE parent.oid = $1
            ORDER BY child.relname
        `,
        {
            database,
            params: [identity.oid],
        },
    );

    const partitions = partitionResult.rows
        .filter(row => row.name)
        .map(row => ({
            name: row.name as string,
            rowCount: toNumberOrNull(row.rowCount) ?? 0,
            compressedBytes: toNumberOrNull(row.compressedBytes) ?? 0,
            uncompressedBytes: toNumberOrNull(row.compressedBytes) ?? 0,
        }));

    const totalBytes = toNumberOrNull(identity.totalBytes);

    const [indexUsageResult, vacuumResult] = await Promise.all([
        datasource.queryWithContext<IndexUsageRow>(
            `
                SELECT
                    idx.relname AS "indexName",
                    s.idx_scan AS "indexScans",
                    s.idx_tup_read AS "tupleReads",
                    s.idx_tup_fetch AS "tupleFetches",
                    pg_relation_size(idx.oid) AS "sizeBytes"
                FROM pg_index i
                JOIN pg_class idx ON idx.oid = i.indexrelid
                LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = idx.oid
                WHERE i.indrelid = $1
                ORDER BY COALESCE(s.idx_scan, 0) DESC
            `,
            { database, params: [identity.oid] },
        ),
        datasource.queryWithContext<VacuumStatRow>(
            `
                SELECT
                    last_vacuum AS "lastVacuum",
                    last_autovacuum AS "lastAutovacuum",
                    last_analyze AS "lastAnalyze",
                    last_autoanalyze AS "lastAutoanalyze",
                    n_dead_tup AS "deadTuples",
                    n_live_tup AS "liveTuples",
                    n_mod_since_analyze AS "modsSinceAnalyze"
                FROM pg_stat_user_tables
                WHERE relid = $1
                LIMIT 1
            `,
            { database, params: [identity.oid] },
        ),
    ]);

    const vacuumRow = vacuumResult.rows[0] ?? null;

    return {
        rowCount: toNumberOrNull(identity.totalRows),
        compressedBytes: totalBytes,
        uncompressedBytes: totalBytes,
        compressionRatio: null,
        partitionCount: partitions.length,
        partitions,
        partCount: partitions.length,
        avgPartSize: partitions.length && totalBytes ? totalBytes / partitions.length : totalBytes,
        maxPartSize: partitions.length ? Math.max(...partitions.map(partition => partition.compressedBytes)) : totalBytes,
        activeMutations: [],
        ttlExpression: null,
        totalBytes,
        rowEstimate: toNumberOrNull(identity.totalRows),
        indexUsage: indexUsageResult.rows
            .filter(row => row.indexName)
            .map(row => ({
                indexName: row.indexName as string,
                indexScans: toNumberOrNull(row.indexScans) ?? 0,
                tupleReads: toNumberOrNull(row.tupleReads) ?? 0,
                tupleFetches: toNumberOrNull(row.tupleFetches) ?? 0,
                sizeBytes: toNumberOrNull(row.sizeBytes),
            })),
        vacuumHealth: vacuumRow
            ? {
                  lastVacuum: vacuumRow.lastVacuum ?? null,
                  lastAutovacuum: vacuumRow.lastAutovacuum ?? null,
                  lastAnalyze: vacuumRow.lastAnalyze ?? null,
                  lastAutoanalyze: vacuumRow.lastAutoanalyze ?? null,
                  deadTuples: toNumberOrNull(vacuumRow.deadTuples),
                  liveTuples: toNumberOrNull(vacuumRow.liveTuples),
                  modsSinceAnalyze: toNumberOrNull(vacuumRow.modsSinceAnalyze),
              }
            : null,
    };
}

async function getTablePreview(datasource: PostgresDatasource, database: string, table: string, options?: { limit?: number; offset?: number }) {
    const parsed = parseTableName(table);
    const schemaName = parsed.schema?.trim() || 'public';
    const tableName = parsed.name.trim();
    const limit = normalizePreviewLimit(options?.limit);
    const offset = options?.offset ?? 0;
    const qualifiedName = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
    const result = await datasource.queryWithContext<Record<string, unknown>>(`SELECT * FROM ${qualifiedName} LIMIT $1 OFFSET $2`, {
        database,
        params: [limit, offset],
    });

    return {
        ...result,
        limited: true,
        limit,
    };
}

async function getTableIndexes(datasource: PostgresDatasource, database: string, table: string): Promise<TableIndexInfo[]> {
    const identity = await getTableIdentity(datasource, database, table);
    if (!identity?.oid) {
        return [];
    }

    const result = await datasource.queryWithContext<TableIndexRow>(
        `
            SELECT
                idx.relname AS "indexName",
                am.amname AS method,
                i.indisprimary AS "isPrimary",
                i.indisunique AS "isUnique",
                pg_relation_size(idx.oid) AS "sizeBytes",
                pg_get_indexdef(idx.oid) AS definition
            FROM pg_index i
            JOIN pg_class idx
              ON idx.oid = i.indexrelid
            LEFT JOIN pg_am am
              ON am.oid = idx.relam
            WHERE i.indrelid = $1
            ORDER BY i.indisprimary DESC, idx.relname
        `,
        {
            database,
            params: [identity.oid],
        },
    );

    return result.rows
        .filter(row => row.indexName)
        .map(row => ({
            name: row.indexName as string,
            method: row.method ?? null,
            isPrimary: row.isPrimary ?? null,
            isUnique: row.isUnique ?? null,
            sizeBytes: toNumberOrNull(row.sizeBytes),
            definition: row.definition ?? null,
        }));
}

export function createPostgresTableInfoCapability(datasource: PostgresDatasource): GetTableInfoAPI {
    return {
        properties: (database, table) => getTableProperties(datasource, database, table),
        ddl: (database, table) => getTableDDL(datasource, database, table),
        stats: (database, table) => getTableStats(datasource, database, table),
        preview: (database, table, options) => getTablePreview(datasource, database, table, options),
        indexes: (database, table) => getTableIndexes(datasource, database, table),
    };
}