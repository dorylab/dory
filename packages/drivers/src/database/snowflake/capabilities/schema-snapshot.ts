import { finalizeSchemaSnapshot, type SchemaConstraint, type SchemaSnapshot, type SchemaSnapshotInput, type SchemaTable } from '@dory/schema-compare';

import type { SnowflakeDatasource } from '../datasource';
import { quoteSnowflakeIdentifier } from '../runtime';

type ColumnRow = {
    schemaName?: string;
    tableName?: string;
    columnName?: string;
    dataType?: string | null;
    nullable?: string | null;
    defaultExpression?: string | null;
    ordinal?: number | string | null;
};

type TableRow = {
    schemaName?: string;
    tableName?: string;
    clusteringKey?: string | null;
    estimatedRows?: number | string | null;
    totalBytes?: number | string | null;
};

type ConstraintRow = {
    schemaName?: string;
    tableName?: string;
    constraintName?: string;
    constraintType?: string;
    columnName?: string | null;
    ordinal?: number | string | null;
    referencedSchema?: string | null;
    referencedTable?: string | null;
    referencedColumn?: string | null;
    onUpdate?: string | null;
    onDelete?: string | null;
};

type ViewRow = {
    schemaName?: string;
    viewName?: string;
    definition?: string | null;
};

type MaterializedViewRow = {
    schema_name?: string;
    name?: string;
    text?: string | null;
};

function numberValue(value: unknown) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function tableKey(schema: string, table: string) {
    return `${schema}\u0000${table}`;
}

function constraintKind(value?: string): SchemaConstraint['kind'] | null {
    switch (value) {
        case 'PRIMARY KEY':
            return 'primary_key';
        case 'FOREIGN KEY':
            return 'foreign_key';
        case 'UNIQUE':
            return 'unique';
        case 'CHECK':
            return 'check';
        default:
            return null;
    }
}

async function safeQuery<Row>(datasource: SnowflakeDatasource, sql: string, database: string, params: unknown[] = []) {
    try {
        const result = await datasource.queryWithContext<Row>(sql, { database, params });
        return { available: true, rows: result.rows };
    } catch {
        return { available: false, rows: [] as Row[] };
    }
}

export async function getSnowflakeSchemaSnapshot(datasource: SnowflakeDatasource, input: SchemaSnapshotInput): Promise<SchemaSnapshot> {
    const schemas = [...new Set((input.schemas ?? []).map(schema => schema.trim()).filter(Boolean))].sort();
    const informationSchema = `${quoteSnowflakeIdentifier(input.database)}.INFORMATION_SCHEMA`;
    const schemaClause = schemas.length ? ` AND TABLE_SCHEMA IN (${schemas.map(() => '?').join(', ')})` : '';
    const params = [input.database, ...schemas];

    const [columnResult, tableResult, constraintResult, viewResult, materializedViewResult] = await Promise.all([
        safeQuery<ColumnRow>(
            datasource,
            `
                SELECT
                    TABLE_SCHEMA AS "schemaName",
                    TABLE_NAME AS "tableName",
                    COLUMN_NAME AS "columnName",
                    CASE
                        WHEN DATA_TYPE IN ('TEXT', 'VARCHAR') AND CHARACTER_MAXIMUM_LENGTH IS NOT NULL
                            THEN CONCAT('VARCHAR(', CHARACTER_MAXIMUM_LENGTH, ')')
                        WHEN DATA_TYPE = 'NUMBER' AND NUMERIC_PRECISION IS NOT NULL
                            THEN CONCAT('NUMBER(', NUMERIC_PRECISION, ',', COALESCE(NUMERIC_SCALE, 0), ')')
                        WHEN DATA_TYPE IN ('TIME', 'TIMESTAMP_LTZ', 'TIMESTAMP_NTZ', 'TIMESTAMP_TZ') AND DATETIME_PRECISION IS NOT NULL
                            THEN CONCAT(DATA_TYPE, '(', DATETIME_PRECISION, ')')
                        ELSE DATA_TYPE
                    END AS "dataType",
                    IS_NULLABLE AS "nullable",
                    COLUMN_DEFAULT AS "defaultExpression",
                    ORDINAL_POSITION AS "ordinal"
                FROM ${informationSchema}.COLUMNS
                WHERE TABLE_CATALOG = ?
                  AND TABLE_SCHEMA <> 'INFORMATION_SCHEMA'
                  ${schemaClause}
                ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
            `,
            input.database,
            params,
        ),
        safeQuery<TableRow>(
            datasource,
            `
                SELECT
                    TABLE_SCHEMA AS "schemaName",
                    TABLE_NAME AS "tableName",
                    CLUSTERING_KEY AS "clusteringKey",
                    ROW_COUNT AS "estimatedRows",
                    BYTES AS "totalBytes"
                FROM ${informationSchema}.TABLES
                WHERE TABLE_CATALOG = ?
                  AND TABLE_SCHEMA <> 'INFORMATION_SCHEMA'
                  AND TABLE_TYPE IN ('BASE TABLE', 'TEMPORARY TABLE')
                  ${schemaClause}
                ORDER BY TABLE_SCHEMA, TABLE_NAME
            `,
            input.database,
            params,
        ),
        safeQuery<ConstraintRow>(
            datasource,
            `
                SELECT
                    constraints.TABLE_SCHEMA AS "schemaName",
                    constraints.TABLE_NAME AS "tableName",
                    constraints.CONSTRAINT_NAME AS "constraintName",
                    constraints.CONSTRAINT_TYPE AS "constraintType",
                    columns.COLUMN_NAME AS "columnName",
                    columns.ORDINAL_POSITION AS "ordinal",
                    referenced.TABLE_SCHEMA AS "referencedSchema",
                    referenced.TABLE_NAME AS "referencedTable",
                    referenced.COLUMN_NAME AS "referencedColumn",
                    referential.UPDATE_RULE AS "onUpdate",
                    referential.DELETE_RULE AS "onDelete"
                FROM ${informationSchema}.TABLE_CONSTRAINTS constraints
                LEFT JOIN ${informationSchema}.KEY_COLUMN_USAGE columns
                  ON columns.CONSTRAINT_CATALOG = constraints.CONSTRAINT_CATALOG
                 AND columns.CONSTRAINT_SCHEMA = constraints.CONSTRAINT_SCHEMA
                 AND columns.CONSTRAINT_NAME = constraints.CONSTRAINT_NAME
                LEFT JOIN ${informationSchema}.REFERENTIAL_CONSTRAINTS referential
                  ON referential.CONSTRAINT_CATALOG = constraints.CONSTRAINT_CATALOG
                 AND referential.CONSTRAINT_SCHEMA = constraints.CONSTRAINT_SCHEMA
                 AND referential.CONSTRAINT_NAME = constraints.CONSTRAINT_NAME
                LEFT JOIN ${informationSchema}.KEY_COLUMN_USAGE referenced
                  ON referenced.CONSTRAINT_CATALOG = referential.UNIQUE_CONSTRAINT_CATALOG
                 AND referenced.CONSTRAINT_SCHEMA = referential.UNIQUE_CONSTRAINT_SCHEMA
                 AND referenced.CONSTRAINT_NAME = referential.UNIQUE_CONSTRAINT_NAME
                 AND referenced.ORDINAL_POSITION = columns.POSITION_IN_UNIQUE_CONSTRAINT
                WHERE constraints.CONSTRAINT_CATALOG = ?
                  AND constraints.TABLE_SCHEMA <> 'INFORMATION_SCHEMA'
                  AND constraints.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
                  ${schemas.length ? `AND constraints.TABLE_SCHEMA IN (${schemas.map(() => '?').join(', ')})` : ''}
                ORDER BY constraints.TABLE_SCHEMA, constraints.TABLE_NAME, constraints.CONSTRAINT_NAME, columns.ORDINAL_POSITION
            `,
            input.database,
            params,
        ),
        safeQuery<ViewRow>(
            datasource,
            `
                SELECT TABLE_SCHEMA AS "schemaName", TABLE_NAME AS "viewName", VIEW_DEFINITION AS "definition"
                FROM ${informationSchema}.VIEWS
                WHERE TABLE_CATALOG = ?
                  AND TABLE_SCHEMA <> 'INFORMATION_SCHEMA'
                  ${schemaClause}
                ORDER BY TABLE_SCHEMA, TABLE_NAME
            `,
            input.database,
            params,
        ),
        safeQuery<MaterializedViewRow>(datasource, `SHOW MATERIALIZED VIEWS IN DATABASE ${quoteSnowflakeIdentifier(input.database)}`, input.database),
    ]);
    if (![columnResult, tableResult, constraintResult, viewResult, materializedViewResult].some(result => result.available)) {
        throw new Error('Snowflake schema catalogs are unavailable.');
    }

    const tableMetadata = new Map(
        tableResult.rows.flatMap(row =>
            row.schemaName && row.tableName
                ? [
                      [
                          tableKey(row.schemaName, row.tableName),
                          {
                              attributes: { clustering_key: row.clusteringKey ?? null },
                              statistics: {
                                  estimatedRows: numberValue(row.estimatedRows),
                                  totalBytes: numberValue(row.totalBytes),
                                  source: 'catalog_estimate' as const,
                              },
                          },
                      ] as const,
                  ]
                : [],
        ),
    );
    const tables = new Map<string, SchemaTable>();
    for (const row of columnResult.rows) {
        const schema = row.schemaName?.trim();
        const tableName = row.tableName?.trim();
        const columnName = row.columnName?.trim();
        if (!schema || !tableName || !columnName) continue;
        const key = tableKey(schema, tableName);
        const metadata = tableMetadata.get(key);
        const table: SchemaTable = tables.get(key) ?? {
            schema,
            name: tableName,
            columns: [],
            indexes: [],
            constraints: [],
            attributes: metadata?.attributes,
            statistics: metadata?.statistics ?? null,
        };
        table.columns.push({
            name: columnName,
            dataType: row.dataType ?? null,
            nullable: row.nullable == null ? null : row.nullable.toUpperCase() === 'YES',
            defaultExpression: row.defaultExpression ?? null,
            ordinal: numberValue(row.ordinal),
        });
        tables.set(key, table);
    }

    const constraintGroups = new Map<string, { table: SchemaTable; rows: ConstraintRow[] }>();
    for (const row of constraintResult.rows) {
        if (!row.schemaName || !row.tableName || !row.constraintName) continue;
        const table = tables.get(tableKey(row.schemaName, row.tableName));
        if (!table) continue;
        const key = `${tableKey(row.schemaName, row.tableName)}\u0000${row.constraintName}`;
        const group = constraintGroups.get(key) ?? { table, rows: [] };
        group.rows.push(row);
        constraintGroups.set(key, group);
    }
    for (const { table, rows } of constraintGroups.values()) {
        const first = rows[0]!;
        const kind = constraintKind(first.constraintType);
        if (!kind) continue;
        table.constraints.push({
            name: first.constraintName!,
            kind,
            columns: rows.flatMap(row => (row.columnName ? [row.columnName] : [])),
            referencedSchema: first.referencedSchema ?? null,
            referencedTable: first.referencedTable ?? null,
            referencedColumns: rows.flatMap(row => (row.referencedColumn ? [row.referencedColumn] : [])),
            onUpdate: first.onUpdate ?? null,
            onDelete: first.onDelete ?? null,
            enforced: false,
        });
    }

    const warnings: string[] = ['Snowflake constraints are informational and are recorded as not enforced.'];
    if (!columnResult.available) warnings.push('Snowflake table and column catalogs were unavailable.');
    if (!tableResult.available) warnings.push('Snowflake table attributes and statistics were unavailable.');
    if (!constraintResult.available) warnings.push('Snowflake constraint catalogs were unavailable.');
    if (!viewResult.available) warnings.push('Snowflake view definitions were unavailable.');
    if (!materializedViewResult.available) warnings.push('Snowflake materialized view definitions were unavailable.');

    return finalizeSchemaSnapshot({
        family: 'snowflake',
        engine: 'snowflake',
        database: input.database,
        schemas,
        capturedAt: new Date().toISOString(),
        coverage: {
            tables: columnResult.available && tableResult.available ? 'complete' : columnResult.available ? 'partial' : 'unavailable',
            columns: columnResult.available ? 'complete' : 'unavailable',
            indexes: 'not_applicable',
            constraints: constraintResult.available ? 'complete' : 'unavailable',
            views: viewResult.available && materializedViewResult.available ? 'complete' : viewResult.available || materializedViewResult.available ? 'partial' : 'unavailable',
            statistics: tableResult.available ? 'complete' : 'unavailable',
        },
        tables: [...tables.values()],
        views: [
            ...viewResult.rows.flatMap(row =>
                row.schemaName && row.viewName ? [{ schema: row.schemaName, name: row.viewName, kind: 'view' as const, definition: row.definition ?? null }] : [],
            ),
            ...materializedViewResult.rows.flatMap(row =>
                row.schema_name && row.name && (!schemas.length || schemas.includes(row.schema_name))
                    ? [{ schema: row.schema_name, name: row.name, kind: 'materialized_view' as const, definition: row.text ?? null }]
                    : [],
            ),
        ],
        warnings,
    });
}
