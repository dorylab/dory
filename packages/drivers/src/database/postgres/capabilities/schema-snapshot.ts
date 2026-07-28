import {
    finalizeSchemaSnapshot,
    schemaDialectFamily,
    type SchemaConstraint,
    type SchemaIndex,
    type SchemaSnapshot,
    type SchemaSnapshotInput,
    type SchemaTable,
} from '@dory/schema-compare';

import type { PostgresDatasource } from '../datasource';

type ColumnRow = {
    schemaName?: string;
    tableName?: string;
    tableKind?: string;
    columnName?: string;
    dataType?: string | null;
    nullable?: boolean | string | number | null;
    defaultExpression?: string | null;
    ordinal?: number | string;
    estimatedRows?: number | string | null;
    totalBytes?: number | string | null;
};

type IndexRow = {
    schemaName?: string;
    tableName?: string;
    indexName?: string;
    unique?: boolean | string | number;
    primary?: boolean | string | number;
    method?: string | null;
    columns?: string[] | string | null;
    includedColumns?: string[] | string | null;
    predicate?: string | null;
    expression?: string | null;
    scans?: number | string | null;
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
    onUpdate?: string | null;
    onDelete?: string | null;
};

type ViewRow = {
    schemaName?: string;
    viewName?: string;
    viewKind?: 'view' | 'materialized_view';
    definition?: string | null;
};

function numberValue(value: number | string | null | undefined) {
    if (value == null) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}

function booleanValue(value: boolean | string | number | null | undefined) {
    return value === true || value === 1 || value === '1' || value === 't' || value === 'true';
}

function stringArray(value: string[] | string | null | undefined) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (value.startsWith('{') && value.endsWith('}')) {
        return value
            .slice(1, -1)
            .split(',')
            .map(item => item.replace(/^"|"$/g, '').trim())
            .filter(Boolean);
    }
    return [value];
}

function tableKey(schema: string, table: string) {
    return `${schema}\u0000${table}`;
}

async function safelyQuery<Row>(datasource: PostgresDatasource, sql: string, database: string, schemas: string[]): Promise<{ available: boolean; rows: Row[] }> {
    try {
        const result = await datasource.queryWithContext<Row>(sql, {
            database,
            params: [schemas.length > 0 ? schemas : null],
        });
        return { available: true, rows: result.rows };
    } catch {
        return { available: false, rows: [] };
    }
}

function constraintKind(value: string | undefined): SchemaConstraint['kind'] | null {
    switch (value) {
        case 'p':
            return 'primary_key';
        case 'f':
            return 'foreign_key';
        case 'u':
            return 'unique';
        case 'c':
            return 'check';
        default:
            return null;
    }
}

export async function getPostgresSchemaSnapshot(datasource: PostgresDatasource, engine: string, input: SchemaSnapshotInput): Promise<SchemaSnapshot> {
    const family = schemaDialectFamily(engine);
    if (family !== 'postgres') throw new Error(`Expected a PostgreSQL-family engine, received ${engine}`);
    const schemas = [...new Set((input.schemas ?? []).map(schema => schema.trim()).filter(Boolean))].sort();

    const [columnResult, indexResult, constraintResult, viewResult] = await Promise.all([
        safelyQuery<ColumnRow>(
            datasource,
            `
                SELECT
                    ns.nspname AS "schemaName",
                    cls.relname AS "tableName",
                    cls.relkind AS "tableKind",
                    att.attname AS "columnName",
                    pg_catalog.format_type(att.atttypid, att.atttypmod) AS "dataType",
                    NOT att.attnotnull AS nullable,
                    pg_get_expr(def.adbin, def.adrelid) AS "defaultExpression",
                    att.attnum AS ordinal,
                    cls.reltuples AS "estimatedRows",
                    pg_total_relation_size(cls.oid) AS "totalBytes"
                FROM pg_class cls
                JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                JOIN pg_attribute att ON att.attrelid = cls.oid
                LEFT JOIN pg_attrdef def ON def.adrelid = cls.oid AND def.adnum = att.attnum
                WHERE ns.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND ns.nspname NOT LIKE 'pg_toast%'
                  AND cls.relkind IN ('r', 'p', 'f')
                  AND att.attnum > 0
                  AND NOT att.attisdropped
                  AND ($1::text[] IS NULL OR ns.nspname = ANY($1::text[]))
                ORDER BY ns.nspname, cls.relname, att.attnum
            `,
            input.database,
            schemas,
        ),
        safelyQuery<IndexRow>(
            datasource,
            `
                SELECT
                    ns.nspname AS "schemaName",
                    tbl.relname AS "tableName",
                    idx_cls.relname AS "indexName",
                    idx.indisunique AS unique,
                    idx.indisprimary AS primary,
                    am.amname AS method,
                    ARRAY(
                        SELECT pg_get_indexdef(idx.indexrelid, position, true)
                        FROM generate_series(1, idx.indnkeyatts) AS position
                        ORDER BY position
                    ) AS columns,
                    ARRAY(
                        SELECT pg_get_indexdef(idx.indexrelid, position, true)
                        FROM generate_series(idx.indnkeyatts + 1, idx.indnatts) AS position
                        ORDER BY position
                    ) AS "includedColumns",
                    pg_get_expr(idx.indpred, idx.indrelid) AS predicate,
                    pg_get_expr(idx.indexprs, idx.indrelid) AS expression,
                    stats.idx_scan AS scans
                FROM pg_index idx
                JOIN pg_class tbl ON tbl.oid = idx.indrelid
                JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
                JOIN pg_class idx_cls ON idx_cls.oid = idx.indexrelid
                JOIN pg_am am ON am.oid = idx_cls.relam
                LEFT JOIN pg_stat_user_indexes stats ON stats.indexrelid = idx.indexrelid
                WHERE ns.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND ns.nspname NOT LIKE 'pg_toast%'
                  AND ($1::text[] IS NULL OR ns.nspname = ANY($1::text[]))
                ORDER BY ns.nspname, tbl.relname, idx_cls.relname
            `,
            input.database,
            schemas,
        ),
        safelyQuery<ConstraintRow>(
            datasource,
            `
                SELECT
                    ns.nspname AS "schemaName",
                    tbl.relname AS "tableName",
                    con.conname AS "constraintName",
                    con.contype AS "constraintType",
                    ARRAY(
                        SELECT att.attname
                        FROM unnest(con.conkey) WITH ORDINALITY AS key(attnum, position)
                        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = key.attnum
                        ORDER BY key.position
                    ) AS columns,
                    ref_ns.nspname AS "referencedSchema",
                    ref_tbl.relname AS "referencedTable",
                    ARRAY(
                        SELECT att.attname
                        FROM unnest(con.confkey) WITH ORDINALITY AS key(attnum, position)
                        JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = key.attnum
                        ORDER BY key.position
                    ) AS "referencedColumns",
                    CASE WHEN con.contype = 'c' THEN pg_get_constraintdef(con.oid, true) ELSE NULL END AS expression,
                    con.confupdtype AS "onUpdate",
                    con.confdeltype AS "onDelete"
                FROM pg_constraint con
                JOIN pg_class tbl ON tbl.oid = con.conrelid
                JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
                LEFT JOIN pg_class ref_tbl ON ref_tbl.oid = con.confrelid
                LEFT JOIN pg_namespace ref_ns ON ref_ns.oid = ref_tbl.relnamespace
                WHERE con.contype IN ('p', 'f', 'u', 'c')
                  AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND ns.nspname NOT LIKE 'pg_toast%'
                  AND ($1::text[] IS NULL OR ns.nspname = ANY($1::text[]))
                ORDER BY ns.nspname, tbl.relname, con.conname
            `,
            input.database,
            schemas,
        ),
        safelyQuery<ViewRow>(
            datasource,
            `
                SELECT schemaname AS "schemaName", viewname AS "viewName", 'view' AS "viewKind", definition
                FROM pg_views
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                  AND schemaname NOT LIKE 'pg_toast%'
                  AND ($1::text[] IS NULL OR schemaname = ANY($1::text[]))
                UNION ALL
                SELECT schemaname AS "schemaName", matviewname AS "viewName", 'materialized_view' AS "viewKind", definition
                FROM pg_matviews
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                  AND schemaname NOT LIKE 'pg_toast%'
                  AND ($1::text[] IS NULL OR schemaname = ANY($1::text[]))
                ORDER BY "schemaName", "viewName"
            `,
            input.database,
            schemas,
        ),
    ]);

    const tablesByKey = new Map<string, SchemaTable>();
    for (const row of columnResult.rows) {
        const schema = row.schemaName?.trim();
        const name = row.tableName?.trim();
        const columnName = row.columnName?.trim();
        if (!schema || !name || !columnName) continue;
        const key = tableKey(schema, name);
        const table = tablesByKey.get(key) ?? {
            schema,
            name,
            columns: [],
            indexes: [],
            constraints: [],
            statistics: {
                estimatedRows: numberValue(row.estimatedRows),
                totalBytes: numberValue(row.totalBytes),
                source: 'catalog_estimate',
            },
            attributes: {
                partitioned: row.tableKind === 'p',
                foreign: row.tableKind === 'f',
            },
        };
        table.columns.push({
            name: columnName,
            dataType: row.dataType ?? null,
            nullable: row.nullable == null ? null : booleanValue(row.nullable),
            defaultExpression: row.defaultExpression ?? null,
            ordinal: numberValue(row.ordinal),
        });
        tablesByKey.set(key, table);
    }

    for (const row of indexResult.rows) {
        const table = row.schemaName && row.tableName ? tablesByKey.get(tableKey(row.schemaName, row.tableName)) : null;
        if (!table || !row.indexName) continue;
        const index: SchemaIndex = {
            name: row.indexName,
            columns: stringArray(row.columns),
            includedColumns: stringArray(row.includedColumns),
            unique: booleanValue(row.unique),
            primary: booleanValue(row.primary),
            method: row.method ?? null,
            predicate: row.predicate ?? null,
            expression: row.expression ?? null,
            scans: numberValue(row.scans),
        };
        table.indexes.push(index);
    }

    for (const row of constraintResult.rows) {
        const table = row.schemaName && row.tableName ? tablesByKey.get(tableKey(row.schemaName, row.tableName)) : null;
        const kind = constraintKind(row.constraintType);
        if (!table || !kind || !row.constraintName) continue;
        table.constraints.push({
            name: row.constraintName,
            kind,
            columns: stringArray(row.columns),
            referencedSchema: row.referencedSchema ?? null,
            referencedTable: row.referencedTable ?? null,
            referencedColumns: stringArray(row.referencedColumns),
            expression: row.expression ?? null,
            onUpdate: row.onUpdate ?? null,
            onDelete: row.onDelete ?? null,
            enforced: true,
        });
    }

    const warnings: string[] = [];
    if (!columnResult.available) warnings.push('PostgreSQL table and column catalogs were unavailable.');
    if (!indexResult.available) warnings.push('PostgreSQL index catalogs were unavailable.');
    if (!constraintResult.available) warnings.push('PostgreSQL constraint catalogs were unavailable.');
    if (!viewResult.available) warnings.push('PostgreSQL view catalogs were unavailable.');

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
        tables: [...tablesByKey.values()],
        views: viewResult.rows.flatMap(row =>
            row.schemaName && row.viewName && row.viewKind
                ? [
                      {
                          schema: row.schemaName,
                          name: row.viewName,
                          kind: row.viewKind,
                          definition: row.definition ?? null,
                      },
                  ]
                : [],
        ),
        warnings,
    });
}
