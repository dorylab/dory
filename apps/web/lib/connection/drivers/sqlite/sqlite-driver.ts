import path from 'node:path';
import Database from 'better-sqlite3';
import { MAX_RESULT_ROWS } from '@/app/config/sql-console';
import { resolveStoredSqlitePath } from '@/lib/demo/paths';
import { enforceSelectLimit } from '@/lib/connection/base/limit';
import { compileParams } from '@/lib/connection/base/params/compile';
import type { DriverQueryParams } from '@/lib/connection/base/params/types';
import type { BaseConfig, HealthInfo, QueryResult, TableColumnInfo } from '@/lib/connection/base/types';
import type { TableIndexInfo, TablePropertiesRow } from '@/types/table-info';
import { SqliteDialect } from './dialect';

type SqliteDatabase = InstanceType<typeof Database>;

const SQLITE_PRIMARY_DATABASE = 'main';

function assertAbsolutePath(filePath?: string): string {
    const normalized = filePath?.trim();
    if (!normalized) {
        throw new Error('SQLite path is required');
    }
    if (!path.isAbsolute(normalized)) {
        throw new Error('SQLite path must be absolute');
    }
    return normalized;
}

function normalizeDatabaseName(database?: string | null): string {
    const normalized = database?.trim();
    return normalized || SQLITE_PRIMARY_DATABASE;
}

function normalizeParams(sql: string, params?: DriverQueryParams) {
    const compiled = compileParams(SqliteDialect, sql, params);
    return {
        sql: compiled.sql,
        params: compiled.params,
    };
}

function bindStatement(statement: ReturnType<SqliteDatabase['prepare']>, params?: DriverQueryParams) {
    if (!params) return [];
    return Array.isArray(params) ? params : [params];
}

function normalizeColumns(statement: ReturnType<SqliteDatabase['prepare']>) {
    return statement.columns().map(column => ({
        name: column.name,
        type: column.type ?? undefined,
    }));
}

function quoteIdentifier(identifier: string) {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

function buildQualifiedName(database: string, objectName: string) {
    return `${quoteIdentifier(normalizeDatabaseName(database))}.${quoteIdentifier(objectName)}`;
}

function buildPragma(database: string, pragmaName: string, value: string) {
    return `PRAGMA ${quoteIdentifier(normalizeDatabaseName(database))}.${pragmaName}(${quoteLiteral(value)})`;
}

function getSqliteVersion(db: SqliteDatabase): string | undefined {
    const row = db.prepare('SELECT sqlite_version() AS version').get() as { version?: string } | undefined;
    return row?.version;
}

export function resolveSqlitePath(config: BaseConfig): string {
    return assertAbsolutePath(resolveStoredSqlitePath(config.path));
}

export function openSqliteDatabase(config: BaseConfig): SqliteDatabase {
    return new Database(resolveSqlitePath(config), {
        fileMustExist: true,
    });
}

export function pingSqlite(db: SqliteDatabase): HealthInfo & { version?: string } {
    const started = Date.now();
    db.pragma('schema_version');

    return {
        ok: true,
        tookMs: Date.now() - started,
        version: getSqliteVersion(db),
    };
}

export function executeSqliteQuery<Row = any>(
    db: SqliteDatabase,
    sql: string,
    params?: DriverQueryParams,
): QueryResult<Row> {
    const { sql: compiledSql, params: compiledParams } = normalizeParams(sql, params);
    const statement = db.prepare(enforceSelectLimit(compiledSql, MAX_RESULT_ROWS));
    const boundParams = bindStatement(statement, compiledParams);
    const started = Date.now();

    if (statement.reader) {
        const rows = statement.all(...boundParams) as Row[];
        return {
            rows,
            rowCount: rows.length,
            columns: normalizeColumns(statement),
            limited: /^\s*(select|with)\b/i.test(compiledSql) && rows.length >= MAX_RESULT_ROWS,
            limit: /^\s*(select|with)\b/i.test(compiledSql) ? MAX_RESULT_ROWS : undefined,
            tookMs: Date.now() - started,
        };
    }

    const result = statement.run(...boundParams);
    return {
        rows: [],
        rowCount: result.changes,
        tookMs: Date.now() - started,
    };
}

export function getSqliteDatabases() {
    return [{ label: SQLITE_PRIMARY_DATABASE, value: SQLITE_PRIMARY_DATABASE }];
}

export function getSqliteTables(db: SqliteDatabase, database?: string | null) {
    const targetDatabase = normalizeDatabaseName(database);
    const rows = db
        .prepare(
            `SELECT name, NULL AS comment
             FROM ${quoteIdentifier(targetDatabase)}.sqlite_schema
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
             ORDER BY name`,
        )
        .all() as Array<{ name: string; comment: string | null }>;

    return rows.map(row => ({
        name: row.name,
        comment: row.comment,
    }));
}

export function getSqliteViews(db: SqliteDatabase, database?: string | null) {
    const targetDatabase = normalizeDatabaseName(database);
    const rows = db
        .prepare(
            `SELECT name, NULL AS comment
             FROM ${quoteIdentifier(targetDatabase)}.sqlite_schema
             WHERE type = 'view'
             ORDER BY name`,
        )
        .all() as Array<{ name: string; comment: string | null }>;

    return rows.map(row => ({
        name: row.name,
        comment: row.comment,
    }));
}

export function getSqliteTableColumns(db: SqliteDatabase, database: string, table: string): TableColumnInfo[] {
    const rows = db.prepare(buildPragma(database, 'table_xinfo', table)).all() as Array<{
        name: string;
        type: string | null;
        notnull: number;
        dflt_value: string | null;
        pk: number;
        hidden?: number;
    }>;

    return rows
        .filter(row => !row.hidden)
        .map(row => ({
            columnName: row.name,
            columnType: row.type,
            defaultExpression: row.dflt_value,
            isPrimaryKey: row.pk > 0,
        }));
}

export function getSqliteTableDdl(db: SqliteDatabase, database: string, table: string): string | null {
    const row = db
        .prepare(
            `SELECT sql
             FROM ${quoteIdentifier(normalizeDatabaseName(database))}.sqlite_schema
             WHERE type IN ('table', 'view') AND name = ?`,
        )
        .get(table) as { sql?: string | null } | undefined;

    return row?.sql ?? null;
}

export function getSqliteTableProperties(db: SqliteDatabase, database: string, table: string): TablePropertiesRow | null {
    const columns = getSqliteTableColumns(db, database, table);
    if (!columns.length) {
        return null;
    }

    const countRow = db
        .prepare(`SELECT COUNT(*) AS rowCount FROM ${buildQualifiedName(database, table)}`)
        .get() as { rowCount?: number } | undefined;

    const primaryKey = columns
        .filter(column => Boolean(column.isPrimaryKey))
        .map(column => column.columnName)
        .join(', ');

    return {
        engine: 'sqlite',
        primaryKey: primaryKey || null,
        totalRows: countRow?.rowCount ?? null,
        totalBytes: null,
    };
}

export function previewSqliteTable(
    db: SqliteDatabase,
    database: string,
    table: string,
    limit: number,
    offset: number = 0,
): QueryResult<Record<string, unknown>> {
    const sql = `SELECT * FROM ${buildQualifiedName(database, table)} LIMIT ? OFFSET ?`;
    return executeSqliteQuery<Record<string, unknown>>(db, sql, [limit, offset]);
}

export function getSqliteTableIndexes(db: SqliteDatabase, database: string, table: string): TableIndexInfo[] {
    const rows = db.prepare(buildPragma(database, 'index_list', table)).all() as Array<{
        name: string;
        origin?: string | null;
        unique?: number;
    }>;

    return rows.map(row => ({
        name: row.name,
        isPrimary: row.origin === 'pk',
        isUnique: row.unique === 1,
    }));
}
