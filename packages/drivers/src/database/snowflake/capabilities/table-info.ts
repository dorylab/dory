import type { GetTableInfoAPI, TablePreviewOptions, TablePropertiesRow, TableStats } from '@dory/drivers/types';
import { buildTablePreviewClauses, buildTableProjection, normalizeTablePreviewLimit, normalizeTablePreviewOffset } from '../../shared/table-preview-query';
import type { SnowflakeDatasource } from '../datasource';
import { parseSnowflakeTableReference, quoteSnowflakeIdentifier, quoteSnowflakeQualifiedTable } from '../runtime';

type CountRow = {
    totalRows?: number | string | null;
};

type TableIdentityRow = {
    kind?: string | null;
    totalRows?: number | string | null;
    bytes?: number | string | null;
    comment?: string | null;
};

type DdlRow = {
    ddl?: string | null;
};

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function resolveTableInput(datasource: SnowflakeDatasource, database: string, table: string) {
    const parsed = parseSnowflakeTableReference(table);
    return {
        database: parsed.database ?? database,
        schema: parsed.schema ?? (datasource.config.options?.schema as string | undefined) ?? 'PUBLIC',
        table: parsed.table,
    };
}

async function properties(datasource: SnowflakeDatasource, database: string, table: string): Promise<TablePropertiesRow | null> {
    const target = resolveTableInput(datasource, database, table);
    const informationSchema = `${quoteSnowflakeIdentifier(target.database)}.INFORMATION_SCHEMA.TABLES`;
    const result = await datasource.queryWithContext<TableIdentityRow>(
        `
            SELECT
                TABLE_TYPE AS "kind",
                ROW_COUNT AS "totalRows",
                BYTES AS "bytes",
                COMMENT AS "comment"
            FROM ${informationSchema}
            WHERE TABLE_CATALOG = ?
              AND TABLE_SCHEMA = ?
              AND TABLE_NAME = ?
            LIMIT 1
        `,
        {
            database: target.database,
            params: [target.database, target.schema, target.table],
        },
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
        engine: row.kind ?? null,
        comment: row.comment ?? null,
        primaryKey: null,
        sortingKey: null,
        partitionKey: null,
        samplingKey: null,
        storagePolicy: null,
        totalRows: toNumberOrNull(row.totalRows),
        totalBytes: toNumberOrNull(row.bytes),
    };
}

async function ddl(datasource: SnowflakeDatasource, database: string, table: string): Promise<string | null> {
    const target = resolveTableInput(datasource, database, table);
    const qualifiedName = quoteSnowflakeQualifiedTable(target.database, target.schema, target.table);
    const result = await datasource.queryWithContext<DdlRow>(`SELECT GET_DDL('TABLE', ?) AS "ddl"`, {
        database: target.database,
        params: [qualifiedName],
    });
    return result.rows[0]?.ddl ?? null;
}

async function stats(_datasource: SnowflakeDatasource, _database: string, _table: string): Promise<TableStats | null> {
    return null;
}

async function preview(datasource: SnowflakeDatasource, database: string, table: string, options?: TablePreviewOptions) {
    const target = resolveTableInput(datasource, database, table);
    const limit = normalizeTablePreviewLimit(options?.limit);
    const offset = normalizeTablePreviewOffset(options?.offset);
    const previewClauses = buildTablePreviewClauses({
        ...options,
        dialect: 'snowflake',
        quoteIdentifier: quoteSnowflakeIdentifier,
    });
    const previewParams = previewClauses.params as unknown[];
    const qualifiedName = quoteSnowflakeQualifiedTable(target.database, target.schema, target.table);
    const shouldCount = options?.countMode !== 'none';
    const countResult = shouldCount
        ? await datasource.queryWithContext<CountRow>(`SELECT COUNT(*) AS "totalRows" FROM ${qualifiedName}${previewClauses.whereSql}`, {
              database: target.database,
              params: previewParams,
          })
        : null;
    const unfilteredCountResult =
        shouldCount && previewClauses.whereSql.length > 0
            ? await datasource.queryWithContext<CountRow>(`SELECT COUNT(*) AS "totalRows" FROM ${qualifiedName}`, {
                  database: target.database,
                  params: [],
              })
            : countResult;
    const params = [...previewParams, limit, offset];
    const result = await datasource.queryWithContext<Record<string, unknown>>(
        `SELECT * FROM ${qualifiedName}${previewClauses.whereSql}${previewClauses.orderBySql} LIMIT ? OFFSET ?`,
        {
            database: target.database,
            params,
        },
    );

    return {
        ...result,
        totalRows: toNumberOrNull(countResult?.rows[0]?.totalRows),
        unfilteredTotalRows: toNumberOrNull(unfilteredCountResult?.rows[0]?.totalRows),
        limited: true,
        limit,
    };
}

async function openRows(datasource: SnowflakeDatasource, database: string, table: string, options: Parameters<NonNullable<GetTableInfoAPI['openRows']>>[2]) {
    const target = resolveTableInput(datasource, database, table);
    const clauses = buildTablePreviewClauses({ ...options, dialect: 'snowflake', quoteIdentifier: quoteSnowflakeIdentifier });
    const projection = buildTableProjection(options.columns, quoteSnowflakeIdentifier);
    return datasource.openRowCursorWithContext<Record<string, unknown>>(
        `SELECT ${projection} FROM ${quoteSnowflakeQualifiedTable(target.database, target.schema, target.table)}${clauses.whereSql}${clauses.orderBySql}`,
        { database: target.database, params: clauses.params },
    );
}

export function createSnowflakeTableInfoCapability(datasource: SnowflakeDatasource): GetTableInfoAPI {
    return {
        properties: (database, table) => properties(datasource, database, table),
        ddl: (database, table) => ddl(datasource, database, table),
        stats: (database, table) => stats(datasource, database, table),
        preview: (database, table, options) => preview(datasource, database, table, options),
        openRows: (database, table, options) => openRows(datasource, database, table, options),
    };
}
