import type { ConnectionMetadataAPI, ConnectionSchemaMap, DatabaseObjectRow, TableColumnInfo } from '@dory/drivers/types';
import type { SnowflakeDatasource } from '../datasource';
import { parseSnowflakeTableReference, quoteSnowflakeIdentifier } from '../runtime';

export type SnowflakeMetadataAPI = ConnectionMetadataAPI & {
    getSchemas: (database: string) => Promise<{ label: string; value: string }[]>;
    getTableColumns: (database: string, table: string) => Promise<TableColumnInfo[]>;
    getTablesOnly: (database: string) => Promise<DatabaseObjectRow[]>;
    getViews: (database: string) => Promise<DatabaseObjectRow[]>;
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

export function createSnowflakeMetadataCapability(datasource: SnowflakeDatasource): SnowflakeMetadataAPI {
    return {
        getDatabases: () => getDatabases(datasource),
        getSchemas: database => getSchemas(datasource, database),
        getSchema: database => getSchemaMap(datasource, database),
        getTables: database => getTables(datasource, database),
        getTablesOnly: database => getObjects(datasource, database, ['BASE TABLE', 'TEMPORARY TABLE']),
        getViews: database => getObjects(datasource, database, ['VIEW']),
        getTableColumns: (database, table) => getTableColumns(datasource, database, table),
    };
}
