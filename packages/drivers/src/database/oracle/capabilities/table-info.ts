import type { GetTableInfoAPI } from '@dory/drivers/types';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@dory/drivers/types';
import type { TableIndexInfo, TablePropertiesRow, TableStats } from '@dory/drivers/types';
import type { OracleDatasource } from '../OracleDatasource';
import { parseOracleTableReference, quoteOracleQualifiedName } from '../oracle-driver';

type TableIdentityRow = {
    schemaName?: string | null;
    tableName?: string | null;
    tableType?: string | null;
    comment?: string | null;
    totalRows?: number | string | null;
    totalBytes?: number | string | null;
    primaryKey?: string | null;
};

type CurrentSchemaRow = {
    currentSchema?: string | null;
};

type DdlRow = {
    ddl?: string | null;
};

type IndexRow = {
    name?: string | null;
    method?: string | null;
    isPrimary?: number | string | null;
    isUnique?: string | null;
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

async function getCurrentSchema(datasource: OracleDatasource, database?: string) {
    const result = await datasource.queryWithContext<CurrentSchemaRow>('SELECT SYS_CONTEXT(:namespace, :parameter) AS "currentSchema" FROM dual', {
        database,
        params: { namespace: 'USERENV', parameter: 'CURRENT_SCHEMA' },
    });
    return result.rows[0]?.currentSchema ?? undefined;
}

async function getTableIdentity(datasource: OracleDatasource, database: string, table: string) {
    const currentSchema = await getCurrentSchema(datasource, database);
    const target = parseOracleTableReference(table, currentSchema);
    const result = await datasource.queryWithContext<TableIdentityRow>(
        `
            SELECT
                t.owner AS "schemaName",
                t.table_name AS "tableName",
                'TABLE' AS "tableType",
                c.comments AS "comment",
                t.num_rows AS "totalRows",
                t.blocks * 8192 AS "totalBytes",
                LISTAGG(pk.column_name, ', ') WITHIN GROUP (ORDER BY pk.position) AS "primaryKey"
            FROM all_tables t
            LEFT JOIN all_tab_comments c
              ON c.owner = t.owner
             AND c.table_name = t.table_name
            LEFT JOIN (
                SELECT cons.owner, cons.table_name, cols.column_name, cols.position
                FROM all_constraints cons
                JOIN all_cons_columns cols
                  ON cols.owner = cons.owner
                 AND cols.constraint_name = cons.constraint_name
                WHERE cons.constraint_type = 'P'
            ) pk
              ON pk.owner = t.owner
             AND pk.table_name = t.table_name
            WHERE t.owner = :owner
              AND t.table_name = :tableName
            GROUP BY t.owner, t.table_name, c.comments, t.num_rows, t.blocks
            UNION ALL
            SELECT
                v.owner AS "schemaName",
                v.view_name AS "tableName",
                'VIEW' AS "tableType",
                c.comments AS "comment",
                NULL AS "totalRows",
                NULL AS "totalBytes",
                NULL AS "primaryKey"
            FROM all_views v
            LEFT JOIN all_tab_comments c
              ON c.owner = v.owner
             AND c.table_name = v.view_name
            WHERE v.owner = :owner
              AND v.view_name = :tableName
        `,
        {
            database,
            params: {
                owner: target.schema ?? currentSchema,
                tableName: target.table,
            },
        },
    );

    return {
        target,
        row: result.rows[0] ?? null,
    };
}

async function getTableProperties(datasource: OracleDatasource, database: string, table: string): Promise<TablePropertiesRow | null> {
    const { row } = await getTableIdentity(datasource, database, table);
    if (!row) return null;

    return {
        engine: row.tableType ?? null,
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

async function getTableDDL(datasource: OracleDatasource, database: string, table: string): Promise<string | null> {
    const { target, row } = await getTableIdentity(datasource, database, table);
    if (!row) return null;

    const result = await datasource.queryWithContext<DdlRow>(
        `
            SELECT DBMS_METADATA.GET_DDL(:objectType, :objectName, :owner) AS "ddl"
            FROM dual
        `,
        {
            database,
            params: {
                objectType: row.tableType === 'VIEW' ? 'VIEW' : 'TABLE',
                objectName: target.table,
                owner: target.schema,
            },
        },
    );

    return result.rows[0]?.ddl?.trim() ?? null;
}

async function getTableStats(datasource: OracleDatasource, database: string, table: string): Promise<TableStats | null> {
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

async function getTablePreview(datasource: OracleDatasource, database: string, table: string, options?: { limit?: number; offset?: number }) {
    const { target } = await getTableIdentity(datasource, database, table);
    const limit = normalizePreviewLimit(options?.limit);
    const offset = Math.max(0, Math.floor(options?.offset ?? 0));
    const qualifiedName = quoteOracleQualifiedName(target.schema, target.table);
    const sql =
        offset > 0
            ? `SELECT * FROM ${qualifiedName} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
            : `SELECT * FROM ${qualifiedName} FETCH FIRST ${limit} ROWS ONLY`;

    return datasource.queryWithContext<Record<string, unknown>>(sql, { database });
}

async function getTableIndexes(datasource: OracleDatasource, database: string, table: string): Promise<TableIndexInfo[]> {
    const currentSchema = await getCurrentSchema(datasource, database);
    const target = parseOracleTableReference(table, currentSchema);
    const result = await datasource.queryWithContext<IndexRow>(
        `
            SELECT
                i.index_name AS "name",
                i.index_type AS "method",
                CASE WHEN cons.constraint_type = 'P' THEN 1 ELSE 0 END AS "isPrimary",
                i.uniqueness AS "isUnique",
                NULL AS "sizeBytes",
                LISTAGG(c.column_name, ', ') WITHIN GROUP (ORDER BY c.column_position) AS "definition"
            FROM all_indexes i
            LEFT JOIN all_ind_columns c
              ON c.index_owner = i.owner
             AND c.index_name = i.index_name
            LEFT JOIN all_constraints cons
              ON cons.owner = i.table_owner
             AND cons.table_name = i.table_name
             AND cons.index_name = i.index_name
            WHERE i.table_owner = :owner
              AND i.table_name = :tableName
            GROUP BY i.index_name, i.index_type, cons.constraint_type, i.uniqueness
            ORDER BY i.index_name
        `,
        {
            database,
            params: {
                owner: target.schema ?? currentSchema,
                tableName: target.table,
            },
        },
    );

    return result.rows.map(row => ({
        name: row.name ?? '',
        method: row.method ?? null,
        isPrimary: row.isPrimary === 1 || row.isPrimary === '1',
        isUnique: row.isUnique === 'UNIQUE',
        sizeBytes: toNumberOrNull(row.sizeBytes),
        definition: row.definition ?? null,
    }));
}

export function createOracleTableInfoCapability(datasource: OracleDatasource): GetTableInfoAPI {
    return {
        async properties(database, table) {
            return getTableProperties(datasource, database, table);
        },
        async ddl(database, table) {
            return getTableDDL(datasource, database, table);
        },
        async stats(database, table) {
            return getTableStats(datasource, database, table);
        },
        async preview(database, table, options) {
            return getTablePreview(datasource, database, table, options);
        },
        async indexes(database, table) {
            return getTableIndexes(datasource, database, table);
        },
    };
}
