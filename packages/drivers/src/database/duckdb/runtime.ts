import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

import { DEFAULT_MAX_RESULT_ROWS } from '@dory/drivers/types';
import { compileParams } from '@dory/drivers/core';
import type { DriverQueryParams } from '@dory/drivers/core';
import { enforceSelectLimit } from '@dory/drivers/core';
import type { BaseConfig, HealthInfo, QueryResult, TableColumnInfo, TablePreviewOptions } from '@dory/drivers/types';
import type { TableIndexInfo, TablePropertiesRow } from '@dory/drivers/types';
import { buildTablePreviewClauses } from '../shared/table-preview-query';

import { DuckDbDialect } from './dialect';

type DuckDbMode = 'local' | 'motherduck';

type DuckDbConnectionHandle = {
    instance: DuckDBInstance;
    connection: DuckDBConnection;
    mode: DuckDbMode;
    databasePath: string;
};

function parseOptions(config: BaseConfig): Record<string, unknown> {
    const options = config.options;
    return options && typeof options === 'object' && !Array.isArray(options) ? options : {};
}

export function isMotherDuckConfig(config: BaseConfig): boolean {
    return parseOptions(config).mode === 'motherduck';
}

function assertAbsoluteExistingPath(filePath: string | undefined, options: Record<string, unknown>): string {
    const normalized = filePath?.trim();
    if (!normalized) {
        throw new Error('DuckDB path is required');
    }
    if (!path.isAbsolute(normalized)) {
        throw new Error('DuckDB path must be absolute');
    }
    if (!fs.existsSync(normalized)) {
        if (options.createIfMissing === true) {
            fs.mkdirSync(path.dirname(normalized), { recursive: true });
        } else {
            throw new Error('DuckDB file does not exist');
        }
    }
    return normalized;
}

function resolveMotherDuckDatabase(config: BaseConfig): string {
    const database = config.database?.trim();
    if (!database) {
        return 'md:';
    }
    return database.startsWith('md:') ? database : `md:${database}`;
}

function resolveDuckDbInstanceOptions(config: BaseConfig): Record<string, string> | undefined {
    const options = parseOptions(config);
    const instanceOptions =
        options.instanceOptions && typeof options.instanceOptions === 'object' && !Array.isArray(options.instanceOptions)
            ? { ...(options.instanceOptions as Record<string, string>) }
            : {};

    if (isMotherDuckConfig(config)) {
        const token = config.password?.trim();
        if (!token) {
            throw new Error('MotherDuck token is required');
        }
        instanceOptions.motherduck_token = token;
    }
    if (typeof options.access_mode === 'string' && !instanceOptions.access_mode) {
        instanceOptions.access_mode = options.access_mode;
    }

    return Object.keys(instanceOptions).length ? instanceOptions : undefined;
}

export function resolveDuckDbDatabasePath(config: BaseConfig): { mode: DuckDbMode; path: string } {
    const options = parseOptions(config);
    if (isMotherDuckConfig(config)) {
        return {
            mode: 'motherduck',
            path: resolveMotherDuckDatabase(config),
        };
    }

    return {
        mode: 'local',
        path: assertAbsoluteExistingPath(config.path, options),
    };
}

function normalizeParams(sql: string, params?: DriverQueryParams) {
    const compiled = compileParams(DuckDbDialect, sql, params);
    return {
        sql: compiled.sql,
        params: compiled.params,
    };
}

function isReadStatement(sql: string): boolean {
    return /^\s*(select|with|from|show|describe|explain|pragma)\b/i.test(sql);
}

function quoteIdentifier(identifier: string) {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

function buildQualifiedTable(database: string, table: string, schema = 'main') {
    return `${quoteIdentifier(database)}.${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function toRows<Row>(reader: Awaited<ReturnType<DuckDBConnection['runAndReadAll']>>): Row[] {
    return reader.getRowObjectsJson() as Row[];
}

function toColumns(reader: Awaited<ReturnType<DuckDBConnection['runAndReadAll']>>) {
    const names = reader.columnNames();
    const types = reader.columnTypes().map(type => type.toString());
    return names.map((name, index) => ({
        name,
        type: types[index],
    }));
}

export async function openDuckDbConnection(config: BaseConfig): Promise<DuckDbConnectionHandle> {
    const resolved = resolveDuckDbDatabasePath(config);
    const options = resolveDuckDbInstanceOptions(config);
    const instance = resolved.mode === 'motherduck' ? await DuckDBInstance.create(resolved.path, options) : await DuckDBInstance.fromCache(resolved.path, options);
    const connection = await instance.connect();

    return {
        instance,
        connection,
        mode: resolved.mode,
        databasePath: resolved.path,
    };
}

export async function pingDuckDb(handle: DuckDbConnectionHandle): Promise<HealthInfo & { version?: string }> {
    const started = Date.now();
    const reader = await handle.connection.runAndReadAll('SELECT version() AS version');
    const row = reader.getRowObjectsJson()[0] as { version?: string } | undefined;

    return {
        ok: true,
        tookMs: Date.now() - started,
        version: row?.version,
    };
}

export async function executeDuckDbQuery<Row = any>(handle: DuckDbConnectionHandle, sql: string, params?: DriverQueryParams): Promise<QueryResult<Row>> {
    const { sql: compiledSql, params: compiledParams } = normalizeParams(sql, params);
    const limitedSql = isReadStatement(compiledSql) ? enforceSelectLimit(compiledSql, DEFAULT_MAX_RESULT_ROWS) : compiledSql;
    const started = Date.now();
    const reader = await handle.connection.runAndReadAll(limitedSql, compiledParams as any);
    const rows = toRows<Row>(reader);
    const rowCount = rows.length || reader.rowsChanged || 0;

    return {
        rows,
        rowCount,
        columns: toColumns(reader),
        limited: isReadStatement(compiledSql) && rows.length >= DEFAULT_MAX_RESULT_ROWS,
        limit: isReadStatement(compiledSql) ? DEFAULT_MAX_RESULT_ROWS : undefined,
        tookMs: Date.now() - started,
    };
}

export async function getDuckDbDatabases(handle: DuckDbConnectionHandle) {
    const result = await executeDuckDbQuery<{ database_name?: string; name?: string }>(handle, 'SHOW DATABASES');
    return result.rows
        .map(row => row.database_name ?? row.name)
        .filter((name): name is string => Boolean(name))
        .map(name => ({ label: name, value: name }));
}

export async function getDuckDbTables(handle: DuckDbConnectionHandle, database?: string | null, tableType?: 'BASE TABLE' | 'VIEW', schema?: string | null) {
    const clauses: string[] = [];
    if (database?.trim()) {
        clauses.push(`table_catalog = ${quoteLiteral(database.trim())}`);
    }
    if (schema?.trim()) {
        clauses.push(`table_schema = ${quoteLiteral(schema.trim())}`);
    }
    if (tableType) {
        clauses.push(`table_type = ${quoteLiteral(tableType)}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await executeDuckDbQuery<{ table_catalog: string; table_schema: string; table_name: string; table_type: string }>(
        handle,
        `
            SELECT table_catalog, table_schema, table_name, table_type
            FROM information_schema.tables
            ${where}
            ORDER BY table_catalog, table_schema, table_name
        `,
    );

    return result.rows.map(row => ({
        name: row.table_schema && row.table_schema !== 'main' ? `${row.table_schema}.${row.table_name}` : row.table_name,
        database: row.table_catalog,
        schema: row.table_schema,
        comment: null,
        engine: row.table_type,
    }));
}

export async function getDuckDbTableColumns(handle: DuckDbConnectionHandle, database: string, table: string): Promise<TableColumnInfo[]> {
    const { schema, tableName } = parseDuckDbTableReference(table);
    const result = await executeDuckDbQuery<{
        column_name: string;
        data_type: string;
        column_default: string | null;
        is_nullable: string | null;
    }>(
        handle,
        `
            SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_catalog = ${quoteLiteral(database)}
              AND table_schema = ${quoteLiteral(schema)}
              AND table_name = ${quoteLiteral(tableName)}
            ORDER BY ordinal_position
        `,
    );

    return result.rows.map(row => ({
        columnName: row.column_name,
        columnType: row.data_type,
        defaultExpression: row.column_default,
    }));
}

export async function getDuckDbTableDdl(handle: DuckDbConnectionHandle, database: string, table: string): Promise<string | null> {
    const { schema, tableName } = parseDuckDbTableReference(table);
    const result = await executeDuckDbQuery<{ sql?: string }>(
        handle,
        `SELECT sql FROM duckdb_tables() WHERE database_name = ${quoteLiteral(database)} AND schema_name = ${quoteLiteral(schema)} AND table_name = ${quoteLiteral(tableName)}`,
    );
    return result.rows[0]?.sql ?? null;
}

export async function getDuckDbTableProperties(handle: DuckDbConnectionHandle, database: string, table: string): Promise<TablePropertiesRow | null> {
    const { schema, tableName } = parseDuckDbTableReference(table);
    const countResult = await executeDuckDbQuery<{ rowCount?: number | string }>(handle, `SELECT COUNT(*) AS rowCount FROM ${buildQualifiedTable(database, tableName, schema)}`);
    const rowCount = countResult.rows[0]?.rowCount;

    return {
        engine: 'duckdb',
        primaryKey: null,
        totalRows: typeof rowCount === 'number' ? rowCount : rowCount ? Number(rowCount) : null,
        totalBytes: null,
    };
}

export async function previewDuckDbTable(
    handle: DuckDbConnectionHandle,
    database: string,
    table: string,
    limit: number,
    offset = 0,
    options?: TablePreviewOptions,
): Promise<QueryResult<Record<string, unknown>>> {
    const { schema, tableName } = parseDuckDbTableReference(table);
    const preview = buildTablePreviewClauses({
        ...options,
        dialect: 'duckdb',
        quoteIdentifier,
    });
    return executeDuckDbQuery<Record<string, unknown>>(
        handle,
        `SELECT * FROM ${buildQualifiedTable(database, tableName, schema)}${preview.whereSql}${preview.orderBySql} LIMIT ? OFFSET ?`,
        [...(preview.params as unknown[]), Number(limit) || 100, Number(offset) || 0],
    );
}

export async function getDuckDbTableIndexes(): Promise<TableIndexInfo[]> {
    return [];
}

export function closeDuckDbConnection(handle: DuckDbConnectionHandle | null): void {
    if (!handle) return;
    handle.connection.closeSync();
    handle.instance.closeSync();
}

function parseDuckDbTableReference(table: string) {
    const [maybeSchema, maybeTable] = table.split('.');
    if (maybeTable) {
        return {
            schema: maybeSchema,
            tableName: maybeTable,
        };
    }
    return {
        schema: 'main',
        tableName: table,
    };
}
