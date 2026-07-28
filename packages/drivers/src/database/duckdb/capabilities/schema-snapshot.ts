import { finalizeSchemaSnapshot, type SchemaConstraint, type SchemaSnapshot, type SchemaSnapshotInput, type SchemaTable } from '@dory/schema-compare';

import type { DuckDbDatasource } from '../datasource';

type ColumnRow = {
    schemaName?: string;
    tableName?: string;
    columnName?: string;
    dataType?: string | null;
    nullable?: string | null;
    defaultExpression?: string | null;
    ordinal?: number | string | null;
    generated?: string | null;
    generationExpression?: string | null;
};

type IndexRow = {
    schemaName?: string;
    tableName?: string;
    indexName?: string;
    uniqueIndex?: boolean | number | string | null;
    primaryIndex?: boolean | number | string | null;
    expressions?: string[] | string | null;
    sql?: string | null;
};

type ConstraintRow = {
    schemaName?: string;
    tableName?: string;
    constraintName?: string;
    constraintType?: string;
    columns?: string[] | string | null;
    referencedSchema?: string | null;
    referencedTable?: string | null;
    referencedColumns?: string[] | string | null;
    expression?: string | null;
};

type ViewRow = {
    schemaName?: string;
    viewName?: string;
    definition?: string | null;
};

function numberValue(value: unknown) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'YES';
}

function stringArray(value: string[] | string | null | undefined) {
    if (Array.isArray(value)) return value.map(item => String(item));
    if (!value) return [];
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
            if (Array.isArray(parsed)) return parsed.map(item => String(item));
        } catch {
            // Fall back to a comma-separated representation returned by older DuckDB clients.
        }
        return trimmed
            .slice(1, -1)
            .split(',')
            .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
    }
    return [trimmed];
}

function constraintKind(value?: string): SchemaConstraint['kind'] | null {
    switch (value?.toUpperCase()) {
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

function tableKey(schema: string, table: string) {
    return `${schema}\u0000${table}`;
}

async function safeQuery<Row>(datasource: DuckDbDatasource, sql: string, database: string, params: unknown[]) {
    try {
        const result = await datasource.queryWithContext<Row>(sql, { database, params });
        return { available: true, rows: result.rows };
    } catch {
        return { available: false, rows: [] as Row[] };
    }
}

export async function getDuckDbSchemaSnapshot(datasource: DuckDbDatasource, input: SchemaSnapshotInput): Promise<SchemaSnapshot> {
    const schemas = [...new Set((input.schemas ?? []).map(schema => schema.trim()).filter(Boolean))].sort();
    const schemaClause = schemas.length ? ` AND table_schema IN (${schemas.map(() => '?').join(', ')})` : '';
    const catalogParams = [input.database, ...schemas];

    const [columnResult, indexResult, constraintResult, viewResult] = await Promise.all([
        safeQuery<ColumnRow>(
            datasource,
            `
                SELECT
                    columns.table_schema AS schemaName,
                    columns.table_name AS tableName,
                    columns.column_name AS columnName,
                    columns.data_type AS dataType,
                    columns.is_nullable AS nullable,
                    columns.column_default AS defaultExpression,
                    columns.ordinal_position AS ordinal,
                    columns.is_generated AS generated,
                    columns.generation_expression AS generationExpression
                FROM information_schema.columns columns
                JOIN information_schema.tables tables
                  ON tables.table_catalog = columns.table_catalog
                 AND tables.table_schema = columns.table_schema
                 AND tables.table_name = columns.table_name
                WHERE columns.table_catalog = ?
                  AND tables.table_type = 'BASE TABLE'
                  ${schemaClause}
                ORDER BY columns.table_schema, columns.table_name, columns.ordinal_position
            `,
            input.database,
            catalogParams,
        ),
        safeQuery<IndexRow>(
            datasource,
            `
                SELECT
                    schema_name AS schemaName,
                    table_name AS tableName,
                    index_name AS indexName,
                    is_unique AS uniqueIndex,
                    is_primary AS primaryIndex,
                    expressions,
                    sql
                FROM duckdb_indexes()
                WHERE database_name = ?
                  ${schemas.length ? `AND schema_name IN (${schemas.map(() => '?').join(', ')})` : ''}
                ORDER BY schema_name, table_name, index_name
            `,
            input.database,
            catalogParams,
        ),
        safeQuery<ConstraintRow>(
            datasource,
            `
                SELECT
                    schema_name AS schemaName,
                    table_name AS tableName,
                    constraint_name AS constraintName,
                    constraint_type AS constraintType,
                    constraint_column_names AS columns,
                    referenced_table AS referencedTable,
                    referenced_column_names AS referencedColumns,
                    expression
                FROM duckdb_constraints()
                WHERE database_name = ?
                  ${schemas.length ? `AND schema_name IN (${schemas.map(() => '?').join(', ')})` : ''}
                ORDER BY schema_name, table_name, constraint_name
            `,
            input.database,
            catalogParams,
        ),
        safeQuery<ViewRow>(
            datasource,
            `
                SELECT table_schema AS schemaName, table_name AS viewName, view_definition AS definition
                FROM information_schema.views
                WHERE table_catalog = ?
                  ${schemaClause}
                ORDER BY table_schema, table_name
            `,
            input.database,
            catalogParams,
        ),
    ]);
    if (![columnResult, indexResult, constraintResult, viewResult].some(result => result.available)) {
        throw new Error('DuckDB schema catalogs are unavailable.');
    }

    const tables = new Map<string, SchemaTable>();
    for (const row of columnResult.rows) {
        const schema = row.schemaName?.trim();
        const tableName = row.tableName?.trim();
        const columnName = row.columnName?.trim();
        if (!schema || !tableName || !columnName) continue;
        const key = tableKey(schema, tableName);
        const table = tables.get(key) ?? { schema, name: tableName, columns: [], indexes: [], constraints: [], statistics: null };
        table.columns.push({
            name: columnName,
            dataType: row.dataType ?? null,
            nullable: row.nullable == null ? null : row.nullable.toUpperCase() === 'YES',
            defaultExpression: row.defaultExpression ?? null,
            ordinal: numberValue(row.ordinal),
            attributes:
                row.generated && row.generated.toUpperCase() !== 'NEVER'
                    ? {
                          computed_expression: row.generationExpression ?? null,
                      }
                    : undefined,
        });
        tables.set(key, table);
    }

    for (const row of indexResult.rows) {
        const table = row.schemaName && row.tableName ? tables.get(tableKey(row.schemaName, row.tableName)) : null;
        if (!table || !row.indexName) continue;
        const expressions = stringArray(row.expressions);
        table.indexes.push({
            name: row.indexName,
            columns: expressions,
            unique: booleanValue(row.uniqueIndex),
            primary: booleanValue(row.primaryIndex),
            expression: row.sql ?? null,
            scans: null,
        });
    }

    for (const row of constraintResult.rows) {
        const table = row.schemaName && row.tableName ? tables.get(tableKey(row.schemaName, row.tableName)) : null;
        const kind = constraintKind(row.constraintType);
        if (!table || !row.constraintName || !kind) continue;
        table.constraints.push({
            name: row.constraintName,
            kind,
            columns: stringArray(row.columns),
            referencedSchema: row.referencedSchema ?? null,
            referencedTable: row.referencedTable ?? null,
            referencedColumns: stringArray(row.referencedColumns),
            expression: row.expression ?? null,
            enforced: true,
        });
    }

    const warnings: string[] = [];
    if (!columnResult.available) warnings.push('DuckDB table and column catalogs were unavailable.');
    if (!indexResult.available) warnings.push('DuckDB index catalogs were unavailable.');
    if (!constraintResult.available) warnings.push('DuckDB constraint catalogs were unavailable.');
    if (!viewResult.available) warnings.push('DuckDB view catalogs were unavailable.');

    return finalizeSchemaSnapshot({
        family: 'duckdb',
        engine: 'duckdb',
        database: input.database,
        schemas,
        capturedAt: new Date().toISOString(),
        coverage: {
            tables: columnResult.available ? 'complete' : 'unavailable',
            columns: columnResult.available ? 'complete' : 'unavailable',
            indexes: indexResult.available ? 'complete' : 'unavailable',
            constraints: constraintResult.available ? 'complete' : 'unavailable',
            views: viewResult.available ? 'complete' : 'unavailable',
            statistics: 'unavailable',
        },
        tables: [...tables.values()],
        views: viewResult.rows.flatMap(row =>
            row.schemaName && row.viewName ? [{ schema: row.schemaName, name: row.viewName, kind: 'view' as const, definition: row.definition ?? null }] : [],
        ),
        warnings,
    });
}
