import { finalizeSchemaSnapshot, schemaDialectFamily, type SchemaConstraint, type SchemaSnapshot, type SchemaSnapshotInput, type SchemaTable } from '@dory/schema-compare';

import type { MySqlDatasource } from '../datasource';

type ColumnRow = {
    schemaName?: string;
    tableName?: string;
    engine?: string | null;
    columnName?: string;
    dataType?: string | null;
    nullable?: string | null;
    defaultExpression?: string | null;
    ordinal?: number | string | null;
    estimatedRows?: number | string | null;
    totalBytes?: number | string | null;
};

type IndexRow = {
    schemaName?: string;
    tableName?: string;
    indexName?: string;
    nonUnique?: number | string | null;
    indexType?: string | null;
    columnName?: string | null;
    sequence?: number | string | null;
    prefixLength?: number | string | null;
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
    expression?: string | null;
    onUpdate?: string | null;
    onDelete?: string | null;
};

type ViewRow = {
    schemaName?: string;
    viewName?: string;
    definition?: string | null;
};

function numberValue(value: number | string | null | undefined) {
    if (value == null) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}

function tableKey(schema: string, table: string) {
    return `${schema}\u0000${table}`;
}

async function safeQuery<Row>(datasource: MySqlDatasource, sql: string, database: string, schemas: string[]): Promise<{ available: boolean; rows: Row[] }> {
    try {
        const result = await datasource.queryWithContext<Row>(sql, {
            database,
            params: schemas,
        });
        return { available: true, rows: result.rows };
    } catch {
        return { available: false, rows: [] };
    }
}

function constraintKind(value: string | undefined): SchemaConstraint['kind'] | null {
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

export async function getMysqlSchemaSnapshot(datasource: MySqlDatasource, engine: string, input: SchemaSnapshotInput): Promise<SchemaSnapshot> {
    const family = schemaDialectFamily(engine);
    if (family !== 'mysql') throw new Error(`Expected a MySQL-family engine, received ${engine}`);
    const schemas = [...new Set((input.schemas?.length ? input.schemas : [input.database]).map(schema => schema.trim()).filter(Boolean))].sort();
    const placeholders = schemas.map(() => '?').join(', ');

    const [columnResult, indexResult, constraintResult, viewResult] = await Promise.all([
        safeQuery<ColumnRow>(
            datasource,
            `
                SELECT
                    columns.table_schema AS schemaName,
                    columns.table_name AS tableName,
                    tables.engine AS engine,
                    columns.column_name AS columnName,
                    columns.column_type AS dataType,
                    columns.is_nullable AS nullable,
                    columns.column_default AS defaultExpression,
                    columns.ordinal_position AS ordinal,
                    tables.table_rows AS estimatedRows,
                    COALESCE(tables.data_length, 0) + COALESCE(tables.index_length, 0) AS totalBytes
                FROM information_schema.columns
                JOIN information_schema.tables
                  ON tables.table_schema = columns.table_schema
                 AND tables.table_name = columns.table_name
                WHERE columns.table_schema IN (${placeholders})
                  AND tables.table_type = 'BASE TABLE'
                ORDER BY columns.table_schema, columns.table_name, columns.ordinal_position
            `,
            input.database,
            schemas,
        ),
        safeQuery<IndexRow>(
            datasource,
            `
                SELECT
                    table_schema AS schemaName,
                    table_name AS tableName,
                    index_name AS indexName,
                    non_unique AS nonUnique,
                    index_type AS indexType,
                    column_name AS columnName,
                    seq_in_index AS sequence,
                    sub_part AS prefixLength
                FROM information_schema.statistics
                WHERE table_schema IN (${placeholders})
                ORDER BY table_schema, table_name, index_name, seq_in_index
            `,
            input.database,
            schemas,
        ),
        safeQuery<ConstraintRow>(
            datasource,
            `
                SELECT
                    constraints.constraint_schema AS schemaName,
                    constraints.table_name AS tableName,
                    constraints.constraint_name AS constraintName,
                    constraints.constraint_type AS constraintType,
                    columns.column_name AS columnName,
                    columns.ordinal_position AS ordinal,
                    columns.referenced_table_schema AS referencedSchema,
                    columns.referenced_table_name AS referencedTable,
                    columns.referenced_column_name AS referencedColumn,
                    checks.check_clause AS expression,
                    referential.update_rule AS onUpdate,
                    referential.delete_rule AS onDelete
                FROM information_schema.table_constraints constraints
                LEFT JOIN information_schema.key_column_usage columns
                  ON columns.constraint_schema = constraints.constraint_schema
                 AND columns.table_name = constraints.table_name
                 AND columns.constraint_name = constraints.constraint_name
                LEFT JOIN information_schema.referential_constraints referential
                  ON referential.constraint_schema = constraints.constraint_schema
                 AND referential.table_name = constraints.table_name
                 AND referential.constraint_name = constraints.constraint_name
                LEFT JOIN information_schema.check_constraints checks
                  ON checks.constraint_schema = constraints.constraint_schema
                 AND checks.constraint_name = constraints.constraint_name
                WHERE constraints.constraint_schema IN (${placeholders})
                  AND constraints.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
                ORDER BY constraints.constraint_schema, constraints.table_name, constraints.constraint_name, columns.ordinal_position
            `,
            input.database,
            schemas,
        ),
        safeQuery<ViewRow>(
            datasource,
            `
                SELECT table_schema AS schemaName, table_name AS viewName, view_definition AS definition
                FROM information_schema.views
                WHERE table_schema IN (${placeholders})
                ORDER BY table_schema, table_name
            `,
            input.database,
            schemas,
        ),
    ]);

    const tables = new Map<string, SchemaTable>();
    for (const row of columnResult.rows) {
        if (!row.schemaName || !row.tableName || !row.columnName) continue;
        const key = tableKey(row.schemaName, row.tableName);
        const table = tables.get(key) ?? {
            schema: row.schemaName,
            name: row.tableName,
            columns: [],
            indexes: [],
            constraints: [],
            statistics: {
                estimatedRows: numberValue(row.estimatedRows),
                totalBytes: numberValue(row.totalBytes),
                source: 'catalog_estimate',
            },
            attributes: { engine: row.engine ?? null },
        };
        table.columns.push({
            name: row.columnName,
            dataType: row.dataType ?? null,
            nullable: row.nullable == null ? null : row.nullable === 'YES',
            defaultExpression: row.defaultExpression ?? null,
            ordinal: numberValue(row.ordinal),
        });
        tables.set(key, table);
    }

    const indexes = new Map<string, { table: SchemaTable; rows: IndexRow[] }>();
    for (const row of indexResult.rows) {
        if (!row.schemaName || !row.tableName || !row.indexName) continue;
        const table = tables.get(tableKey(row.schemaName, row.tableName));
        if (!table) continue;
        const key = `${tableKey(row.schemaName, row.tableName)}\u0000${row.indexName}`;
        const group = indexes.get(key) ?? { table, rows: [] };
        group.rows.push(row);
        indexes.set(key, group);
    }
    for (const { table, rows } of indexes.values()) {
        const first = rows[0]!;
        table.indexes.push({
            name: first.indexName!,
            columns: rows.map(row => `${row.columnName ?? '(expression)'}${row.prefixLength ? `(${row.prefixLength})` : ''}`),
            unique: numberValue(first.nonUnique) === 0,
            primary: first.indexName === 'PRIMARY',
            method: first.indexType ?? null,
            scans: null,
        });
    }

    const constraints = new Map<string, { table: SchemaTable; rows: ConstraintRow[] }>();
    for (const row of constraintResult.rows) {
        if (!row.schemaName || !row.tableName || !row.constraintName) continue;
        const table = tables.get(tableKey(row.schemaName, row.tableName));
        if (!table) continue;
        const key = `${tableKey(row.schemaName, row.tableName)}\u0000${row.constraintName}`;
        const group = constraints.get(key) ?? { table, rows: [] };
        group.rows.push(row);
        constraints.set(key, group);
    }
    for (const { table, rows } of constraints.values()) {
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
            expression: first.expression ?? null,
            onUpdate: first.onUpdate ?? null,
            onDelete: first.onDelete ?? null,
            enforced: true,
        });
    }

    const warnings: string[] = [];
    if (!columnResult.available) warnings.push('MySQL table and column metadata was unavailable.');
    if (!indexResult.available) warnings.push('MySQL index metadata was unavailable.');
    if (!constraintResult.available) warnings.push('MySQL constraint metadata was unavailable.');
    if (!viewResult.available) warnings.push('MySQL view metadata was unavailable.');

    return finalizeSchemaSnapshot({
        family,
        engine,
        database: input.database,
        schemas,
        capturedAt: new Date().toISOString(),
        coverage: {
            tables: columnResult.available ? 'complete' : 'unavailable',
            columns: columnResult.available ? 'complete' : 'unavailable',
            indexes: indexResult.available ? 'complete' : 'unavailable',
            constraints: constraintResult.available ? 'complete' : 'unavailable',
            views: viewResult.available ? 'complete' : 'unavailable',
            statistics: columnResult.available ? 'complete' : 'unavailable',
        },
        tables: [...tables.values()],
        views: viewResult.rows.flatMap(row =>
            row.schemaName && row.viewName ? [{ schema: row.schemaName, name: row.viewName, kind: 'view' as const, definition: row.definition ?? null }] : [],
        ),
        warnings,
    });
}
