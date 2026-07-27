import { finalizeSchemaSnapshot, type SchemaConstraint, type SchemaSnapshot, type SchemaSnapshotInput, type SchemaTable } from '@dory/schema-compare';

import type { SqlServerDatasource } from '../datasource';

type ColumnRow = {
    schemaName?: string;
    tableName?: string;
    columnName?: string;
    dataType?: string | null;
    nullable?: boolean | number | null;
    defaultExpression?: string | null;
    ordinal?: number | string | null;
    identityColumn?: boolean | number | null;
    identitySeed?: number | string | null;
    identityIncrement?: number | string | null;
    computedExpression?: string | null;
    computedPersisted?: boolean | number | null;
};

type IndexRow = {
    schemaName?: string;
    tableName?: string;
    indexName?: string;
    uniqueIndex?: boolean | number | null;
    primaryIndex?: boolean | number | null;
    indexType?: string | null;
    filterDefinition?: string | null;
    columnName?: string | null;
    includedColumn?: boolean | number | null;
    keyOrdinal?: number | string | null;
    indexColumnId?: number | string | null;
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

type StatisticRow = {
    schemaName?: string;
    tableName?: string;
    estimatedRows?: number | string | null;
    totalBytes?: number | string | null;
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
        case 'PK':
            return 'primary_key';
        case 'UQ':
            return 'unique';
        case 'F':
            return 'foreign_key';
        case 'C':
            return 'check';
        default:
            return null;
    }
}

function schemaScope(schemas: string[]) {
    if (!schemas.length) return { clause: '', params: {} };
    const params = Object.fromEntries(schemas.map((schema, index) => [`schema${index}`, schema]));
    return {
        clause: ` AND s.name IN (${schemas.map((_, index) => `@schema${index}`).join(', ')})`,
        params,
    };
}

async function safeQuery<Row>(datasource: SqlServerDatasource, sql: string, database: string, params: Record<string, unknown>) {
    try {
        const result = await datasource.queryWithContext<Row>(sql, { database, params });
        return { available: true, rows: result.rows };
    } catch {
        return { available: false, rows: [] as Row[] };
    }
}

export async function getSqlServerSchemaSnapshot(datasource: SqlServerDatasource, input: SchemaSnapshotInput): Promise<SchemaSnapshot> {
    const schemas = [...new Set((input.schemas ?? []).map(schema => schema.trim()).filter(Boolean))].sort();
    const scope = schemaScope(schemas);

    const [columnResult, indexResult, constraintResult, viewResult, statisticResult] = await Promise.all([
        safeQuery<ColumnRow>(
            datasource,
            `
                SELECT
                    s.name AS schemaName,
                    t.name AS tableName,
                    c.name AS columnName,
                    CASE
                        WHEN ty.name IN ('varchar', 'char', 'varbinary', 'binary')
                            THEN CONCAT(ty.name, '(', CASE WHEN c.max_length = -1 THEN 'max' ELSE CONVERT(varchar(10), c.max_length) END, ')')
                        WHEN ty.name IN ('nvarchar', 'nchar')
                            THEN CONCAT(ty.name, '(', CASE WHEN c.max_length = -1 THEN 'max' ELSE CONVERT(varchar(10), c.max_length / 2) END, ')')
                        WHEN ty.name IN ('decimal', 'numeric')
                            THEN CONCAT(ty.name, '(', c.precision, ',', c.scale, ')')
                        WHEN ty.name IN ('datetime2', 'datetimeoffset', 'time')
                            THEN CONCAT(ty.name, '(', c.scale, ')')
                        ELSE ty.name
                    END AS dataType,
                    c.is_nullable AS nullable,
                    dc.definition AS defaultExpression,
                    c.column_id AS ordinal,
                    c.is_identity AS identityColumn,
                    ic.seed_value AS identitySeed,
                    ic.increment_value AS identityIncrement,
                    cc.definition AS computedExpression,
                    cc.is_persisted AS computedPersisted
                FROM sys.tables t
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                JOIN sys.columns c ON c.object_id = t.object_id
                JOIN sys.types ty ON ty.user_type_id = c.user_type_id
                LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
                LEFT JOIN sys.identity_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
                WHERE t.is_ms_shipped = 0
                  ${scope.clause}
                ORDER BY s.name, t.name, c.column_id
            `,
            input.database,
            scope.params,
        ),
        safeQuery<IndexRow>(
            datasource,
            `
                SELECT
                    s.name AS schemaName,
                    t.name AS tableName,
                    i.name AS indexName,
                    i.is_unique AS uniqueIndex,
                    i.is_primary_key AS primaryIndex,
                    i.type_desc AS indexType,
                    i.filter_definition AS filterDefinition,
                    c.name AS columnName,
                    ic.is_included_column AS includedColumn,
                    ic.key_ordinal AS keyOrdinal,
                    ic.index_column_id AS indexColumnId
                FROM sys.indexes i
                JOIN sys.tables t ON t.object_id = i.object_id
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                WHERE t.is_ms_shipped = 0
                  AND i.name IS NOT NULL
                  AND i.is_hypothetical = 0
                  ${scope.clause}
                ORDER BY s.name, t.name, i.name, ic.is_included_column, ic.key_ordinal, ic.index_column_id
            `,
            input.database,
            scope.params,
        ),
        safeQuery<ConstraintRow>(
            datasource,
            `
                SELECT
                    s.name AS schemaName,
                    t.name AS tableName,
                    kc.name AS constraintName,
                    kc.type AS constraintType,
                    c.name AS columnName,
                    ic.key_ordinal AS ordinal,
                    NULL AS referencedSchema,
                    NULL AS referencedTable,
                    NULL AS referencedColumn,
                    NULL AS expression,
                    NULL AS onUpdate,
                    NULL AS onDelete
                FROM sys.key_constraints kc
                JOIN sys.tables t ON t.object_id = kc.parent_object_id
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
                JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                WHERE t.is_ms_shipped = 0 ${scope.clause}
                UNION ALL
                SELECT
                    s.name,
                    t.name,
                    fk.name,
                    'F',
                    source_column.name,
                    fkc.constraint_column_id,
                    referenced_schema.name,
                    referenced_table.name,
                    referenced_column.name,
                    NULL,
                    fk.update_referential_action_desc,
                    fk.delete_referential_action_desc
                FROM sys.foreign_keys fk
                JOIN sys.tables t ON t.object_id = fk.parent_object_id
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
                JOIN sys.columns source_column ON source_column.object_id = fkc.parent_object_id AND source_column.column_id = fkc.parent_column_id
                JOIN sys.tables referenced_table ON referenced_table.object_id = fkc.referenced_object_id
                JOIN sys.schemas referenced_schema ON referenced_schema.schema_id = referenced_table.schema_id
                JOIN sys.columns referenced_column ON referenced_column.object_id = fkc.referenced_object_id AND referenced_column.column_id = fkc.referenced_column_id
                WHERE t.is_ms_shipped = 0 ${scope.clause}
                UNION ALL
                SELECT
                    s.name,
                    t.name,
                    cc.name,
                    'C',
                    NULL,
                    0,
                    NULL,
                    NULL,
                    NULL,
                    cc.definition,
                    NULL,
                    NULL
                FROM sys.check_constraints cc
                JOIN sys.tables t ON t.object_id = cc.parent_object_id
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                WHERE t.is_ms_shipped = 0 ${scope.clause}
                ORDER BY schemaName, tableName, constraintName, ordinal
            `,
            input.database,
            scope.params,
        ),
        safeQuery<ViewRow>(
            datasource,
            `
                SELECT s.name AS schemaName, v.name AS viewName, m.definition
                FROM sys.views v
                JOIN sys.schemas s ON s.schema_id = v.schema_id
                LEFT JOIN sys.sql_modules m ON m.object_id = v.object_id
                WHERE v.is_ms_shipped = 0
                  ${scope.clause}
                ORDER BY s.name, v.name
            `,
            input.database,
            scope.params,
        ),
        safeQuery<StatisticRow>(
            datasource,
            `
                SELECT
                    s.name AS schemaName,
                    t.name AS tableName,
                    SUM(CASE WHEN p.index_id IN (0, 1) THEN p.rows ELSE 0 END) AS estimatedRows,
                    SUM(a.total_pages) * 8192 AS totalBytes
                FROM sys.tables t
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                LEFT JOIN sys.partitions p ON p.object_id = t.object_id
                LEFT JOIN sys.allocation_units a ON a.container_id = p.partition_id
                WHERE t.is_ms_shipped = 0
                  ${scope.clause}
                GROUP BY s.name, t.name
                ORDER BY s.name, t.name
            `,
            input.database,
            scope.params,
        ),
    ]);
    if (![columnResult, indexResult, constraintResult, viewResult, statisticResult].some(result => result.available)) {
        throw new Error('SQL Server schema catalogs are unavailable.');
    }

    const statistics = new Map(
        statisticResult.rows.flatMap(row =>
            row.schemaName && row.tableName
                ? [
                      [
                          tableKey(row.schemaName, row.tableName),
                          {
                              estimatedRows: numberValue(row.estimatedRows),
                              totalBytes: numberValue(row.totalBytes),
                              source: 'catalog_estimate' as const,
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
        const table: SchemaTable = tables.get(key) ?? {
            schema,
            name: tableName,
            columns: [],
            indexes: [],
            constraints: [],
            statistics: statistics.get(key) ?? null,
        };
        const attributes: NonNullable<SchemaTable['columns'][number]['attributes']> = {};
        if (Boolean(row.identityColumn)) {
            attributes.identity = true;
            attributes.identity_seed = numberValue(row.identitySeed);
            attributes.identity_increment = numberValue(row.identityIncrement);
        }
        if (row.computedExpression) {
            attributes.computed_expression = row.computedExpression;
            attributes.computed_persisted = Boolean(row.computedPersisted);
        }
        table.columns.push({
            name: columnName,
            dataType: row.dataType ?? null,
            nullable: row.nullable == null ? null : Boolean(row.nullable),
            defaultExpression: row.defaultExpression ?? null,
            ordinal: numberValue(row.ordinal),
            attributes: Object.keys(attributes).length ? attributes : undefined,
        });
        tables.set(key, table);
    }

    const indexGroups = new Map<string, { table: SchemaTable; rows: IndexRow[] }>();
    for (const row of indexResult.rows) {
        if (!row.schemaName || !row.tableName || !row.indexName) continue;
        const table = tables.get(tableKey(row.schemaName, row.tableName));
        if (!table) continue;
        const key = `${tableKey(row.schemaName, row.tableName)}\u0000${row.indexName}`;
        const group = indexGroups.get(key) ?? { table, rows: [] };
        group.rows.push(row);
        indexGroups.set(key, group);
    }
    for (const { table, rows } of indexGroups.values()) {
        const first = rows[0]!;
        table.indexes.push({
            name: first.indexName!,
            columns: rows.filter(row => !row.includedColumn && row.columnName).map(row => row.columnName!),
            includedColumns: rows.filter(row => row.includedColumn && row.columnName).map(row => row.columnName!),
            unique: Boolean(first.uniqueIndex),
            primary: Boolean(first.primaryIndex),
            method: first.indexType ?? null,
            predicate: first.filterDefinition ?? null,
            scans: null,
        });
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
            expression: first.expression ?? null,
            onUpdate: first.onUpdate ?? null,
            onDelete: first.onDelete ?? null,
            enforced: true,
        });
    }

    const warnings: string[] = [];
    if (!columnResult.available) warnings.push('SQL Server table and column catalogs were unavailable.');
    if (!indexResult.available) warnings.push('SQL Server index catalogs were unavailable.');
    if (!constraintResult.available) warnings.push('SQL Server constraint catalogs were unavailable.');
    if (!viewResult.available) warnings.push('SQL Server view definitions were unavailable.');
    if (!statisticResult.available) warnings.push('SQL Server table statistics were unavailable.');

    return finalizeSchemaSnapshot({
        family: 'sqlserver',
        engine: 'sqlserver',
        database: input.database,
        schemas,
        capturedAt: new Date().toISOString(),
        coverage: {
            tables: columnResult.available ? 'complete' : 'unavailable',
            columns: columnResult.available ? 'complete' : 'unavailable',
            indexes: indexResult.available ? 'complete' : 'unavailable',
            constraints: constraintResult.available ? 'complete' : 'unavailable',
            views: viewResult.available ? 'complete' : 'unavailable',
            statistics: statisticResult.available ? 'complete' : 'unavailable',
        },
        tables: [...tables.values()],
        views: viewResult.rows.flatMap(row =>
            row.schemaName && row.viewName ? [{ schema: row.schemaName, name: row.viewName, kind: 'view' as const, definition: row.definition ?? null }] : [],
        ),
        warnings,
    });
}
