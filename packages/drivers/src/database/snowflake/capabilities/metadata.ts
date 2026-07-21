import type { ConnectionMetadataAPI, ConnectionSchemaMap, DatabaseObjectRow, SchemaGraphOptions, SchemaGraphResult, TableColumnInfo } from '@dory/drivers/types';
import { buildSchemaGraphResult, type SchemaGraphRelationshipInput, type SchemaGraphTableInput } from '@dory/drivers/core';
import type { SnowflakeDatasource } from '../datasource';
import { parseSnowflakeTableReference, quoteSnowflakeIdentifier } from '../runtime';

export type SnowflakeMetadataAPI = ConnectionMetadataAPI & {
    getSchemas: (database: string) => Promise<{ label: string; value: string }[]>;
    getTableColumns: (database: string, table: string) => Promise<TableColumnInfo[]>;
    getTablesOnly: (database: string) => Promise<DatabaseObjectRow[]>;
    getViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getSchemaGraph: (options: SchemaGraphOptions) => Promise<SchemaGraphResult>;
};

type NameRow = {
    name?: string;
    databaseName?: string;
    schemaName?: string;
};

type ObjectRow = {
    name?: string;
    schemaName?: string;
    kind?: string | null;
    totalRows?: number | string | null;
    bytes?: number | string | null;
    comment?: string | null;
    lastModified?: string | null;
};

type ColumnRow = {
    columnName?: string;
    columnType?: string | null;
    defaultExpression?: string | null;
    nullable?: string | null;
    comment?: string | null;
};

type SchemaGraphColumnRow = {
    schemaName?: string;
    tableName?: string;
    columnName?: string;
    dataType?: string | null;
    ordinal?: number | string | null;
    nullable?: string | null;
    primaryKey?: boolean | number | string | null;
};

type SchemaGraphRelationshipRow = {
    constraintName?: string | null;
    sourceSchemaName?: string;
    sourceTableName?: string;
    sourceColumnName?: string;
    targetSchemaName?: string;
    targetTableName?: string;
    targetColumnName?: string;
    sourceNullable?: string | null;
    updateAction?: string | null;
    deleteAction?: string | null;
};

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toIsoString(value: unknown): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function objectName(row: ObjectRow) {
    const schema = row.schemaName?.trim();
    const name = row.name?.trim();
    if (!name) return null;
    return schema ? `${schema}.${name}` : name;
}

async function getDatabases(datasource: SnowflakeDatasource) {
    const result = await datasource.query<NameRow>(
        `
            SHOW DATABASES
        `,
    );

    return result.rows
        .map(row => row.name?.trim())
        .filter((name): name is string => Boolean(name))
        .map(name => ({ label: name, value: name }));
}

async function getSchemas(datasource: SnowflakeDatasource, database: string) {
    const informationSchema = `${quoteSnowflakeIdentifier(database)}.INFORMATION_SCHEMA.SCHEMATA`;
    const result = await datasource.queryWithContext<NameRow>(
        `
            SELECT SCHEMA_NAME AS "name"
            FROM ${informationSchema}
            WHERE CATALOG_NAME = ?
              AND SCHEMA_NAME <> 'INFORMATION_SCHEMA'
            ORDER BY SCHEMA_NAME
        `,
        {
            database,
            params: [database],
        },
    );

    return result.rows
        .map(row => row.name?.trim())
        .filter((name): name is string => Boolean(name))
        .map(name => ({ label: name, value: name }));
}

async function getSchemaMap(datasource: SnowflakeDatasource, database?: string): Promise<ConnectionSchemaMap> {
    const databases = database ? [{ value: database, label: database }] : await getDatabases(datasource);
    const entries = await Promise.all(
        databases.map(async db => {
            const schemas = await getSchemas(datasource, db.value);
            return [db.value, schemas.map(schema => schema.value)] as const;
        }),
    );
    return Object.fromEntries(entries);
}

function normalizeObjectRow(row: ObjectRow): DatabaseObjectRow | null {
    const name = objectName(row);
    if (!name) return null;
    return {
        name,
        schema: row.schemaName ?? undefined,
        engine: row.kind ?? null,
        totalBytes: toNumberOrNull(row.bytes),
        totalRows: toNumberOrNull(row.totalRows),
        comment: row.comment ?? null,
        lastModified: toIsoString(row.lastModified),
    };
}

async function getObjects(datasource: SnowflakeDatasource, database: string, kinds: string[]) {
    const placeholders = kinds.map(() => '?').join(', ');
    const informationSchema = `${quoteSnowflakeIdentifier(database)}.INFORMATION_SCHEMA.TABLES`;
    const result = await datasource.queryWithContext<ObjectRow>(
        `
            SELECT
                TABLE_SCHEMA AS "schemaName",
                TABLE_NAME AS "name",
                TABLE_TYPE AS "kind",
                ROW_COUNT AS "totalRows",
                BYTES AS "bytes",
                COMMENT AS "comment",
                LAST_ALTERED AS "lastModified"
            FROM ${informationSchema}
            WHERE TABLE_CATALOG = ?
              AND TABLE_SCHEMA <> 'INFORMATION_SCHEMA'
              AND TABLE_TYPE IN (${placeholders})
            ORDER BY TABLE_SCHEMA, TABLE_NAME
        `,
        {
            database,
            params: [database, ...kinds],
        },
    );

    return result.rows.map(normalizeObjectRow).filter((row): row is DatabaseObjectRow => Boolean(row));
}

async function getTables(datasource: SnowflakeDatasource, database?: string) {
    if (!database) {
        const databases = await getDatabases(datasource);
        const rows = await Promise.all(databases.map(db => getObjects(datasource, db.value, ['BASE TABLE', 'TEMPORARY TABLE'])));
        return rows.flat().map(row => ({
            label: row.name,
            value: row.name,
            database: row.name.includes('.') ? undefined : database,
            schema: row.schema,
        }));
    }

    return (await getObjects(datasource, database, ['BASE TABLE', 'TEMPORARY TABLE'])).map(row => ({
        label: row.name,
        value: row.name,
        database,
        schema: row.schema,
    }));
}

async function getTableColumns(datasource: SnowflakeDatasource, database: string, table: string): Promise<TableColumnInfo[]> {
    const parsed = parseSnowflakeTableReference(table);
    const schema = parsed.schema ?? (datasource.config.options?.schema as string | undefined) ?? 'PUBLIC';
    const targetDatabase = parsed.database ?? database;
    const informationSchema = `${quoteSnowflakeIdentifier(targetDatabase)}.INFORMATION_SCHEMA.COLUMNS`;
    const result = await datasource.queryWithContext<ColumnRow>(
        `
            SELECT
                COLUMN_NAME AS "columnName",
                DATA_TYPE AS "columnType",
                COLUMN_DEFAULT AS "defaultExpression",
                IS_NULLABLE AS "nullable",
                COMMENT AS "comment"
            FROM ${informationSchema}
            WHERE TABLE_CATALOG = ?
              AND TABLE_SCHEMA = ?
              AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
        `,
        {
            database: targetDatabase,
            params: [targetDatabase, schema, parsed.table],
        },
    );

    return result.rows.map(row => ({
        columnName: row.columnName ?? '',
        columnType: row.columnType ?? null,
        defaultExpression: row.defaultExpression ?? null,
        defaultKind: row.defaultExpression ? 'expression' : null,
        isPrimaryKey: false,
        comment: row.comment ?? null,
    }));
}

async function getSchemaGraph(datasource: SnowflakeDatasource, options: SchemaGraphOptions): Promise<SchemaGraphResult> {
    const informationSchema = `${quoteSnowflakeIdentifier(options.database)}.INFORMATION_SCHEMA`;
    const [columnResult, relationshipResult] = await Promise.all([
        datasource.queryWithContext<SchemaGraphColumnRow>(
            `
                SELECT
                    cols.TABLE_SCHEMA AS "schemaName",
                    cols.TABLE_NAME AS "tableName",
                    cols.COLUMN_NAME AS "columnName",
                    cols.DATA_TYPE AS "dataType",
                    cols.ORDINAL_POSITION AS "ordinal",
                    cols.IS_NULLABLE AS "nullable",
                    IFF(pk.COLUMN_NAME IS NULL, FALSE, TRUE) AS "primaryKey"
                FROM ${informationSchema}.COLUMNS cols
                JOIN ${informationSchema}.TABLES tbl
                  ON tbl.TABLE_CATALOG = cols.TABLE_CATALOG
                 AND tbl.TABLE_SCHEMA = cols.TABLE_SCHEMA
                 AND tbl.TABLE_NAME = cols.TABLE_NAME
                LEFT JOIN (
                    SELECT kcu.TABLE_CATALOG, kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME
                    FROM ${informationSchema}.TABLE_CONSTRAINTS tc
                    JOIN ${informationSchema}.KEY_COLUMN_USAGE kcu
                      ON kcu.CONSTRAINT_CATALOG = tc.CONSTRAINT_CATALOG
                     AND kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
                     AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                ) pk
                  ON pk.TABLE_CATALOG = cols.TABLE_CATALOG
                 AND pk.TABLE_SCHEMA = cols.TABLE_SCHEMA
                 AND pk.TABLE_NAME = cols.TABLE_NAME
                 AND pk.COLUMN_NAME = cols.COLUMN_NAME
                WHERE cols.TABLE_CATALOG = ?
                  AND cols.TABLE_SCHEMA <> 'INFORMATION_SCHEMA'
                  AND tbl.TABLE_TYPE IN ('BASE TABLE', 'TEMPORARY TABLE')
                ORDER BY cols.TABLE_SCHEMA, cols.TABLE_NAME, cols.ORDINAL_POSITION
            `,
            { database: options.database, params: [options.database] },
        ),
        datasource
            .queryWithContext<SchemaGraphRelationshipRow>(
                `
                    SELECT
                        fk.CONSTRAINT_NAME AS "constraintName",
                        fk.TABLE_SCHEMA AS "sourceSchemaName",
                        fk.TABLE_NAME AS "sourceTableName",
                        fk.COLUMN_NAME AS "sourceColumnName",
                        target.TABLE_SCHEMA AS "targetSchemaName",
                        target.TABLE_NAME AS "targetTableName",
                        target.COLUMN_NAME AS "targetColumnName",
                        source_col.IS_NULLABLE AS "sourceNullable",
                        rc.UPDATE_RULE AS "updateAction",
                        rc.DELETE_RULE AS "deleteAction"
                    FROM ${informationSchema}.REFERENTIAL_CONSTRAINTS rc
                    JOIN ${informationSchema}.KEY_COLUMN_USAGE fk
                      ON fk.CONSTRAINT_CATALOG = rc.CONSTRAINT_CATALOG
                     AND fk.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
                     AND fk.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
                    JOIN ${informationSchema}.KEY_COLUMN_USAGE target
                      ON target.CONSTRAINT_CATALOG = rc.UNIQUE_CONSTRAINT_CATALOG
                     AND target.CONSTRAINT_SCHEMA = rc.UNIQUE_CONSTRAINT_SCHEMA
                     AND target.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
                     AND target.ORDINAL_POSITION = fk.POSITION_IN_UNIQUE_CONSTRAINT
                    JOIN ${informationSchema}.COLUMNS source_col
                      ON source_col.TABLE_CATALOG = fk.TABLE_CATALOG
                     AND source_col.TABLE_SCHEMA = fk.TABLE_SCHEMA
                     AND source_col.TABLE_NAME = fk.TABLE_NAME
                     AND source_col.COLUMN_NAME = fk.COLUMN_NAME
                    WHERE fk.TABLE_CATALOG = ?
                    ORDER BY fk.TABLE_SCHEMA, fk.TABLE_NAME, fk.CONSTRAINT_NAME, fk.ORDINAL_POSITION
                `,
                { database: options.database, params: [options.database] },
            )
            .catch(() => ({ rows: [], schemaGraphRelationshipsUnavailable: true as const })),
    ]);

    const tablesByKey = new Map<string, SchemaGraphTableInput>();
    for (const row of columnResult.rows) {
        const schema = row.schemaName?.trim();
        const tableName = row.tableName?.trim();
        const columnName = row.columnName?.trim();
        if (!schema || !tableName || !columnName) continue;
        const key = `${schema}\u0000${tableName}`;
        const table = tablesByKey.get(key) ?? { database: options.database, schema, name: tableName, columns: [] };
        table.columns.push({
            name: columnName,
            dataType: row.dataType ?? null,
            ordinal: toNumberOrNull(row.ordinal) ?? table.columns.length + 1,
            nullable: row.nullable ? row.nullable.toUpperCase() === 'YES' : null,
            isPrimaryKey: row.primaryKey === true || row.primaryKey === 1 || row.primaryKey === '1',
            isForeignKey: false,
        });
        tablesByKey.set(key, table);
    }

    const relationshipsByKey = new Map<string, SchemaGraphRelationshipInput>();
    for (const row of relationshipResult.rows) {
        const sourceSchema = row.sourceSchemaName?.trim();
        const sourceTable = row.sourceTableName?.trim();
        const sourceColumn = row.sourceColumnName?.trim();
        const targetSchema = row.targetSchemaName?.trim();
        const targetTable = row.targetTableName?.trim();
        const targetColumn = row.targetColumnName?.trim();
        if (!sourceSchema || !sourceTable || !sourceColumn || !targetSchema || !targetTable || !targetColumn) continue;
        const key = `${sourceSchema}\u0000${sourceTable}\u0000${row.constraintName ?? ''}`;
        const relationship = relationshipsByKey.get(key) ?? {
            constraintName: row.constraintName ?? null,
            sourceSchema,
            sourceTable,
            sourceColumns: [],
            targetSchema,
            targetTable,
            targetColumns: [],
            sourceUnique: null,
            sourceOptional: false,
            onUpdate: row.updateAction ?? null,
            onDelete: row.deleteAction ?? null,
        };
        relationship.sourceColumns.push(sourceColumn);
        relationship.targetColumns.push(targetColumn);
        relationship.sourceOptional = Boolean(relationship.sourceOptional) || row.sourceNullable?.toUpperCase() === 'YES';
        relationshipsByKey.set(key, relationship);
    }

    return buildSchemaGraphResult(options, Array.from(tablesByKey.values()), Array.from(relationshipsByKey.values()), {
        relationships: !('schemaGraphRelationshipsUnavailable' in relationshipResult),
        compositeForeignKeys: !('schemaGraphRelationshipsUnavailable' in relationshipResult),
        cardinality: false,
        referentialActions: !('schemaGraphRelationshipsUnavailable' in relationshipResult),
        constraintsEnforced: false,
    });
}

export function createSnowflakeMetadataCapability(datasource: SnowflakeDatasource): SnowflakeMetadataAPI {
    return {
        getDatabases: () => getDatabases(datasource),
        getSchemas: database => getSchemas(datasource, database),
        getSchema: database => getSchemaMap(datasource, database),
        getTables: database => getTables(datasource, database),
        getTablesOnly: database => getObjects(datasource, database, ['BASE TABLE', 'TEMPORARY TABLE']),
        getViews: database => getObjects(datasource, database, ['VIEW']),
        getTableColumns: (database, table) => getTableColumns(datasource, database, table),
        getSchemaGraph: options => getSchemaGraph(datasource, options),
    };
}
