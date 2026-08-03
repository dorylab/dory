import path from 'node:path';
import Database from 'better-sqlite3';
import { DEFAULT_MAX_RESULT_ROWS } from '@dory/drivers/types';
import { enforceSelectLimit } from '@dory/drivers/core';
import { compileParams } from '@dory/drivers/core';
import type { DriverQueryParams } from '@dory/drivers/core';
import type { BaseConfig, DriverQueryRowStream, HealthInfo, QueryResult, SchemaGraphOptions, SchemaGraphResult, TableColumnInfo, TablePreviewOptions } from '@dory/drivers/types';
import type { TableIndexInfo, TablePropertiesRow } from '@dory/drivers/types';
import { buildSchemaGraphResult, type SchemaGraphRelationshipInput, type SchemaGraphTableInput } from '@dory/drivers/core';
import { buildTablePreviewClauses, normalizeTablePreviewLimit, normalizeTablePreviewOffset } from '../shared/table-preview-query';
import { SqliteDialect } from './dialect';

type SqliteDatabase = InstanceType<typeof Database>;

const SQLITE_PRIMARY_DATABASE = 'main';

type CountRow = {
    totalRows?: number | string | bigint | null;
};

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
    return assertAbsolutePath(config.path);
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

export function executeSqliteQuery<Row = any>(db: SqliteDatabase, sql: string, params?: DriverQueryParams): QueryResult<Row> {
    const { sql: compiledSql, params: compiledParams } = normalizeParams(sql, params);
    const statement = db.prepare(enforceSelectLimit(compiledSql, DEFAULT_MAX_RESULT_ROWS));
    const boundParams = bindStatement(statement, compiledParams);
    const started = Date.now();

    if (statement.reader) {
        const rows = statement.all(...boundParams) as Row[];
        return {
            rows,
            rowCount: rows.length,
            columns: normalizeColumns(statement),
            limited: /^\s*(select|with)\b/i.test(compiledSql) && rows.length >= DEFAULT_MAX_RESULT_ROWS,
            limit: /^\s*(select|with)\b/i.test(compiledSql) ? DEFAULT_MAX_RESULT_ROWS : undefined,
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

export function executeSqliteQueryRowStream<Row = any>(db: SqliteDatabase, sql: string, params?: DriverQueryParams): DriverQueryRowStream<Row> {
    const { sql: compiledSql, params: compiledParams } = normalizeParams(sql, params);
    const statement = db.prepare(compiledSql);
    const boundParams = bindStatement(statement, compiledParams);
    const started = Date.now();

    if (!statement.reader) {
        const result = statement.run(...boundParams);
        return {
            rows: [],
            rowCount: result.changes,
            columns: [],
            limited: false,
            tookMs: Date.now() - started,
        };
    }

    const iterator = (statement.iterate(...boundParams) as Iterable<Row>)[Symbol.iterator]();
    let iteratorClosed = false;
    const close = () => {
        if (iteratorClosed) return;
        iteratorClosed = true;
        iterator.return?.();
    };

    const rows = (function* () {
        try {
            for (;;) {
                const next = iterator.next();
                if (next.done) {
                    iteratorClosed = true;
                    return;
                }
                yield next.value;
            }
        } finally {
            close();
        }
    })();

    return {
        rows,
        rowCount: null,
        columns: normalizeColumns(statement),
        limited: false,
        tookMs: Date.now() - started,
        close,
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
            nullable: row.pk > 0 ? false : row.notnull === 0,
        }));
}

export function getSqliteSchemaGraph(db: SqliteDatabase, options: SchemaGraphOptions): SchemaGraphResult {
    const database = normalizeDatabaseName(options.database);
    const tableRows = getSqliteTables(db, database);
    const tables: SchemaGraphTableInput[] = [];
    const relationships: SchemaGraphRelationshipInput[] = [];

    for (const tableRow of tableRows) {
        const columnRows = db.prepare(buildPragma(database, 'table_xinfo', tableRow.name)).all() as Array<{
            cid: number;
            name: string;
            type: string | null;
            notnull: number;
            pk: number;
            hidden?: number;
        }>;
        const foreignKeyRows = db.prepare(buildPragma(database, 'foreign_key_list', tableRow.name)).all() as Array<{
            id: number;
            seq: number;
            table: string;
            from: string;
            to: string;
            on_update?: string | null;
            on_delete?: string | null;
        }>;
        const indexRows = db.prepare(buildPragma(database, 'index_list', tableRow.name)).all() as Array<{
            name: string;
            unique: number;
            partial?: number;
        }>;
        const uniqueColumnSets: string[][] = [];
        const primaryKeyColumns = columnRows
            .filter(column => column.pk > 0)
            .sort((left, right) => left.pk - right.pk)
            .map(column => column.name);
        if (primaryKeyColumns.length > 0) uniqueColumnSets.push(primaryKeyColumns);
        for (const indexRow of indexRows.filter(row => row.unique === 1 && row.partial !== 1)) {
            const indexColumns = db.prepare(buildPragma(database, 'index_info', indexRow.name)).all() as Array<{ seqno: number; name: string | null }>;
            const names = indexColumns
                .filter(column => column.name)
                .sort((left, right) => left.seqno - right.seqno)
                .map(column => column.name as string);
            if (names.length > 0) uniqueColumnSets.push(names);
        }
        const foreignColumns = new Set(foreignKeyRows.map(row => row.from));
        tables.push({
            database,
            schema: null,
            name: tableRow.name,
            columns: columnRows
                .filter(row => !row.hidden)
                .map(row => ({
                    name: row.name,
                    dataType: row.type,
                    ordinal: row.cid + 1,
                    nullable: row.pk > 0 ? false : row.notnull === 0,
                    isPrimaryKey: row.pk > 0,
                    isForeignKey: foreignColumns.has(row.name),
                })),
        });

        const grouped = new Map<number, SchemaGraphRelationshipInput>();
        for (const row of foreignKeyRows.sort((left, right) => left.id - right.id || left.seq - right.seq)) {
            const relationship = grouped.get(row.id) ?? {
                constraintName: `fk_${tableRow.name}_${row.id}`,
                sourceSchema: null,
                sourceTable: tableRow.name,
                sourceColumns: [],
                targetSchema: null,
                targetTable: row.table,
                targetColumns: [],
                sourceUnique: null,
                sourceOptional: false,
                onUpdate: row.on_update ?? null,
                onDelete: row.on_delete ?? null,
            };
            relationship.sourceColumns.push(row.from);
            relationship.targetColumns.push(row.to);
            const sourceColumn = columnRows.find(column => column.name === row.from);
            relationship.sourceOptional = Boolean(relationship.sourceOptional) || (sourceColumn?.pk === 0 && sourceColumn.notnull === 0);
            grouped.set(row.id, relationship);
        }
        for (const relationship of grouped.values()) {
            relationship.sourceUnique = uniqueColumnSets.some(
                columns => columns.length === relationship.sourceColumns.length && columns.every(column => relationship.sourceColumns.includes(column)),
            );
        }
        relationships.push(...grouped.values());
    }

    return buildSchemaGraphResult(options, tables, relationships, {
        relationships: true,
        compositeForeignKeys: true,
        cardinality: true,
        referentialActions: true,
        constraintsEnforced: true,
    });
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

    const countRow = db.prepare(`SELECT COUNT(*) AS rowCount FROM ${buildQualifiedName(database, table)}`).get() as { rowCount?: number } | undefined;

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
    limit?: number,
    offset: number = 0,
    options?: TablePreviewOptions,
): QueryResult<Record<string, unknown>> {
    const preview = buildTablePreviewClauses({
        ...options,
        dialect: 'sqlite',
        quoteIdentifier,
    });
    const normalizedLimit = normalizeTablePreviewLimit(limit);
    const normalizedOffset = normalizeTablePreviewOffset(offset);
    const qualifiedName = buildQualifiedName(database, table);
    const shouldCount = options?.countMode !== 'none';
    const countResult = shouldCount ? executeSqliteQuery<CountRow>(db, `SELECT COUNT(*) AS totalRows FROM ${qualifiedName}${preview.whereSql}`, preview.params) : null;
    const unfilteredCountResult = shouldCount && preview.whereSql.length > 0 ? executeSqliteQuery<CountRow>(db, `SELECT COUNT(*) AS totalRows FROM ${qualifiedName}`) : countResult;
    const sql = `SELECT * FROM ${qualifiedName}${preview.whereSql}${preview.orderBySql} LIMIT ? OFFSET ?`;
    const result = executeSqliteQuery<Record<string, unknown>>(db, sql, [...(preview.params as unknown[]), normalizedLimit, normalizedOffset]);

    return {
        ...result,
        totalRows: countResult ? Number(countResult.rows[0]?.totalRows ?? 0) : null,
        unfilteredTotalRows: unfilteredCountResult ? Number(unfilteredCountResult.rows[0]?.totalRows ?? 0) : null,
        limited: true,
        limit: normalizedLimit,
    };
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

export function renameSqliteTable(db: SqliteDatabase, database: string, table: string, nextName: string): void {
    const normalizedNextName = nextName.trim();
    if (!normalizedNextName || normalizedNextName.includes('.')) {
        throw new Error('New table name must be an unqualified table name.');
    }

    db.prepare(`ALTER TABLE ${buildQualifiedName(database, table)} RENAME TO ${quoteIdentifier(normalizedNextName)}`).run();
}
