import { finalizeSchemaSnapshot, schemaDialectFamily, type SchemaSnapshot, type SchemaSnapshotInput, type SchemaTable } from '@dory/schema-compare';
import type { DriverQueryResult } from '@dory/drivers/types';

type Queryable = {
    queryWithContext<Row = unknown>(sql: string, context?: { database?: string }): Promise<DriverQueryResult<Row>>;
};

type ColumnRow = {
    tableName?: string;
    tableSql?: string | null;
    columnName?: string;
    dataType?: string | null;
    notNull?: number | string | null;
    defaultExpression?: string | null;
    ordinal?: number | string | null;
    primaryKeyPosition?: number | string | null;
    hidden?: number | string | null;
};

type IndexRow = {
    tableName?: string;
    indexName?: string;
    uniqueIndex?: number | string | null;
    origin?: string | null;
    partial?: number | string | null;
    columnName?: string | null;
    sequence?: number | string | null;
    indexSql?: string | null;
};

type ForeignKeyRow = {
    tableName?: string;
    foreignKeyId?: number | string | null;
    sequence?: number | string | null;
    referencedTable?: string | null;
    sourceColumn?: string | null;
    referencedColumn?: string | null;
    onUpdate?: string | null;
    onDelete?: string | null;
};

type ViewRow = {
    viewName?: string;
    definition?: string | null;
};

function quoteIdentifier(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
}

function numberValue(value: number | string | null | undefined) {
    if (value == null) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}

async function safeQuery<Row>(driver: Queryable, sql: string, database: string) {
    try {
        const result = await driver.queryWithContext<Row>(sql, { database });
        return { available: true, rows: result.rows };
    } catch {
        return { available: false, rows: [] as Row[] };
    }
}

export async function getSqliteFamilySchemaSnapshot(driver: Queryable, engine: string, input: SchemaSnapshotInput): Promise<SchemaSnapshot> {
    const family = schemaDialectFamily(engine);
    if (family !== 'sqlite') throw new Error(`Expected a SQLite-family engine, received ${engine}`);
    const database = input.database.trim() || 'main';
    const schema = quoteIdentifier(database);
    const schemaLiteral = database.replace(/'/g, "''");

    const [columnResult, indexResult, foreignKeyResult, viewResult] = await Promise.all([
        safeQuery<ColumnRow>(
            driver,
            `
                SELECT
                    objects.name AS tableName,
                    objects.sql AS tableSql,
                    columns.name AS columnName,
                    columns.type AS dataType,
                    columns."notnull" AS "notNull",
                    columns.dflt_value AS defaultExpression,
                    columns.cid + 1 AS ordinal,
                    columns.pk AS primaryKeyPosition,
                    columns.hidden AS hidden
                FROM ${schema}.sqlite_schema objects
                JOIN pragma_table_xinfo(objects.name, '${schemaLiteral}') columns
                WHERE objects.type = 'table'
                  AND objects.name NOT LIKE 'sqlite_%'
                ORDER BY objects.name, columns.cid
            `,
            database,
        ),
        safeQuery<IndexRow>(
            driver,
            `
                SELECT
                    tables.name AS tableName,
                    indexes.name AS indexName,
                    indexes."unique" AS uniqueIndex,
                    indexes.origin AS origin,
                    indexes.partial AS partial,
                    columns.name AS columnName,
                    columns.seqno AS sequence,
                    definitions.sql AS indexSql
                FROM ${schema}.sqlite_schema tables
                JOIN pragma_index_list(tables.name, '${schemaLiteral}') indexes
                JOIN pragma_index_xinfo(indexes.name, '${schemaLiteral}') columns
                LEFT JOIN ${schema}.sqlite_schema definitions
                  ON definitions.type = 'index'
                 AND definitions.name = indexes.name
                WHERE tables.type = 'table'
                  AND tables.name NOT LIKE 'sqlite_%'
                  AND columns.key = 1
                ORDER BY tables.name, indexes.name, columns.seqno
            `,
            database,
        ),
        safeQuery<ForeignKeyRow>(
            driver,
            `
                SELECT
                    tables.name AS tableName,
                    foreign_keys.id AS foreignKeyId,
                    foreign_keys.seq AS sequence,
                    foreign_keys."table" AS referencedTable,
                    foreign_keys."from" AS sourceColumn,
                    foreign_keys."to" AS referencedColumn,
                    foreign_keys.on_update AS onUpdate,
                    foreign_keys.on_delete AS onDelete
                FROM ${schema}.sqlite_schema tables
                JOIN pragma_foreign_key_list(tables.name, '${schemaLiteral}') foreign_keys
                WHERE tables.type = 'table'
                  AND tables.name NOT LIKE 'sqlite_%'
                ORDER BY tables.name, foreign_keys.id, foreign_keys.seq
            `,
            database,
        ),
        safeQuery<ViewRow>(
            driver,
            `
                SELECT name AS viewName, sql AS definition
                FROM ${schema}.sqlite_schema
                WHERE type = 'view'
                ORDER BY name
            `,
            database,
        ),
    ]);

    const tables = new Map<string, SchemaTable>();
    for (const row of columnResult.rows) {
        if (!row.tableName || !row.columnName || numberValue(row.hidden)) continue;
        const table = tables.get(row.tableName) ?? {
            schema: null,
            name: row.tableName,
            columns: [],
            indexes: [],
            constraints: [],
            statistics: null,
            attributes: {
                withoutRowId: /\bWITHOUT\s+ROWID\b/i.test(row.tableSql ?? ''),
                strict: /\bSTRICT\s*$/i.test(row.tableSql ?? ''),
            },
        };
        table.columns.push({
            name: row.columnName,
            dataType: row.dataType ?? null,
            nullable: numberValue(row.primaryKeyPosition) ? false : !numberValue(row.notNull),
            defaultExpression: row.defaultExpression ?? null,
            ordinal: numberValue(row.ordinal),
        });
        tables.set(row.tableName, table);
    }

    const indexGroups = new Map<string, IndexRow[]>();
    for (const row of indexResult.rows) {
        if (!row.tableName || !row.indexName) continue;
        const key = `${row.tableName}\u0000${row.indexName}`;
        const group = indexGroups.get(key) ?? [];
        group.push(row);
        indexGroups.set(key, group);
    }
    for (const [key, rows] of indexGroups) {
        const [tableName] = key.split('\u0000');
        const table = tables.get(tableName!);
        const first = rows[0];
        if (!table || !first?.indexName) continue;
        const columns = rows.flatMap(row => (row.columnName ? [row.columnName] : []));
        table.indexes.push({
            name: first.indexName,
            columns,
            unique: numberValue(first.uniqueIndex) === 1,
            primary: first.origin === 'pk',
            predicate: numberValue(first.partial) === 1 ? (first.indexSql ?? null) : null,
            expression: rows.some(row => !row.columnName) ? (first.indexSql ?? null) : null,
            scans: null,
        });
        if (first.origin === 'u') {
            table.constraints.push({
                name: first.indexName,
                kind: 'unique',
                columns,
            });
        }
    }

    for (const table of tables.values()) {
        const primaryColumns = table.columns
            .filter(column => column.nullable === false)
            .filter(column => columnResult.rows.some(row => row.tableName === table.name && row.columnName === column.name && Number(row.primaryKeyPosition) > 0))
            .sort((left, right) => (left.ordinal ?? 0) - (right.ordinal ?? 0))
            .map(column => column.name);
        if (primaryColumns.length) {
            table.constraints.push({
                name: `${table.name}_pkey`,
                kind: 'primary_key',
                columns: primaryColumns,
            });
        }
    }

    const foreignKeyGroups = new Map<string, ForeignKeyRow[]>();
    for (const row of foreignKeyResult.rows) {
        if (!row.tableName || row.foreignKeyId == null) continue;
        const key = `${row.tableName}\u0000${row.foreignKeyId}`;
        const group = foreignKeyGroups.get(key) ?? [];
        group.push(row);
        foreignKeyGroups.set(key, group);
    }
    for (const [key, rows] of foreignKeyGroups) {
        const [tableName, foreignKeyId] = key.split('\u0000');
        const table = tables.get(tableName!);
        const first = rows[0];
        if (!table || !first) continue;
        table.constraints.push({
            name: `fk_${tableName}_${foreignKeyId}`,
            kind: 'foreign_key',
            columns: rows.flatMap(row => (row.sourceColumn ? [row.sourceColumn] : [])),
            referencedSchema: null,
            referencedTable: first.referencedTable ?? null,
            referencedColumns: rows.flatMap(row => (row.referencedColumn ? [row.referencedColumn] : [])),
            onUpdate: first.onUpdate ?? null,
            onDelete: first.onDelete ?? null,
            enforced: true,
        });
    }

    const warnings = ['SQLite CHECK constraint definitions are not individually named by the set-based catalog collector.'];
    if (!columnResult.available) warnings.push('SQLite table and column metadata was unavailable.');
    if (!indexResult.available) warnings.push('SQLite index metadata was unavailable.');
    if (!foreignKeyResult.available) warnings.push('SQLite foreign key metadata was unavailable.');
    if (!viewResult.available) warnings.push('SQLite view metadata was unavailable.');

    return finalizeSchemaSnapshot({
        family,
        engine,
        database,
        schemas: [],
        capturedAt: new Date().toISOString(),
        coverage: {
            tables: columnResult.available ? 'complete' : 'unavailable',
            columns: columnResult.available ? 'complete' : 'unavailable',
            indexes: indexResult.available ? 'complete' : 'unavailable',
            constraints: columnResult.available && foreignKeyResult.available && indexResult.available ? 'partial' : 'unavailable',
            views: viewResult.available ? 'complete' : 'unavailable',
            statistics: 'unavailable',
        },
        tables: [...tables.values()],
        views: viewResult.rows.flatMap(row => (row.viewName ? [{ schema: null, name: row.viewName, kind: 'view' as const, definition: row.definition ?? null }] : [])),
        warnings,
    });
}
