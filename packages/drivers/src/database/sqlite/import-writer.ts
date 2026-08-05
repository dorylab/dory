import type Database from 'better-sqlite3';

import { CommitUnknownError, type DataWriter, type ImportColumnType, type ImportPlanV1, type ImportTarget, type TargetColumn, type TargetSchema } from '@dory/import';
import { atomicCapabilities } from '../shared/import-writer';

const ALLOWED_TYPES: ReadonlyArray<ImportColumnType> = ['string', 'boolean', 'int64', 'float64', 'date', 'datetime'];
const SQLITE_SAFE_PARAMETER_LIMIT = 999;

type SqliteDatabase = InstanceType<typeof Database>;

export class SqliteImportWriter implements DataWriter {
    readonly dialect = 'sqlite' as const;
    readonly allowedTypes = ALLOWED_TYPES;

    constructor(private readonly openDatabase: () => SqliteDatabase) {}

    async inspectTarget(target: ImportTarget): Promise<TargetSchema> {
        const database = this.openDatabase();
        try {
            const schema = target.database?.trim() || 'main';
            const exists = Boolean(database.prepare(`SELECT 1 FROM ${quoteIdentifier(schema)}.sqlite_master WHERE type = 'table' AND name = ?`).get(target.table));
            if (!exists) return { exists: false, columns: [], writeCapabilities: atomicCapabilities };
            const rows = database.prepare(`PRAGMA ${quoteIdentifier(schema)}.table_info(${quoteLiteral(target.table)})`).all() as Array<{
                name: string;
                type: string;
                notnull: number;
                dflt_value: unknown;
                pk: number;
            }>;
            return {
                exists: true,
                columns: rows.map<TargetColumn>(column => ({
                    name: column.name,
                    databaseType: column.type || 'BLOB',
                    importType: sqliteImportType(column.type),
                    nullable: column.notnull === 0 && column.pk === 0,
                    hasDefault: column.dflt_value !== null || column.pk > 0,
                })),
                writeCapabilities: atomicCapabilities,
            };
        } finally {
            database.close();
        }
    }

    async previewCreateTable(plan: ImportPlanV1): Promise<string> {
        return createTableSql(plan);
    }

    async write(input: Parameters<DataWriter['write']>[0]) {
        const database = this.openDatabase();
        const columns = input.plan.columns.filter(column => !column.ignored).sort((left, right) => left.order - right.order);
        const maxRowsPerInsert = Math.max(1, Math.min(input.batchSize, Math.floor(SQLITE_SAFE_PARAMETER_LIMIT / columns.length)));
        let rowsWritten = 0;
        let batches = 0;
        let commitStarted = false;
        let committed = false;

        try {
            if (input.signal.aborted) throw abortError();
            database.exec('BEGIN IMMEDIATE');
            if (input.plan.target.mode === 'create') {
                database.exec(createTableSql(input.plan));
            } else if (input.plan.mode === 'replace') {
                database.exec(`DELETE FROM ${qualifiedName(input.plan.target)}`);
            }
            await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            const reader = await input.dataset.openBatches({ batchSize: input.batchSize, signal: input.signal });

            for await (const batch of reader) {
                for (let offset = 0; offset < batch.numRows; offset += maxRowsPerInsert) {
                    if (input.signal.aborted) throw abortError();
                    const count = Math.min(maxRowsPerInsert, batch.numRows - offset);
                    const values: unknown[] = [];
                    const rowSql: string[] = [];
                    for (let row = 0; row < count; row += 1) {
                        rowSql.push(`(${columns.map(() => '?').join(', ')})`);
                        for (const column of columns) {
                            values.push(sqliteValue(batch.getChild(column.target)?.get(offset + row), column.targetType));
                        }
                    }
                    const names = columns.map(column => quoteIdentifier(column.target)).join(', ');
                    database.prepare(`INSERT INTO ${qualifiedName(input.plan.target)} (${names}) VALUES ${rowSql.join(', ')}`).run(...values);
                    rowsWritten += count;
                    batches += 1;
                    await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
                    await yieldEventLoop();
                }
            }

            if (input.signal.aborted) throw abortError();
            await input.onProgress({ phase: 'committing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            if (input.signal.aborted) throw abortError();
            commitStarted = true;
            database.exec('COMMIT');
            committed = true;
            return { insertedRows: rowsWritten, batches, atomicity: 'atomic' as const };
        } catch (error) {
            if (!committed) {
                try {
                    database.exec('ROLLBACK');
                } catch {
                    // The transaction may already be closed by SQLite.
                }
            }
            if (commitStarted && !committed) throw new CommitUnknownError(error instanceof Error ? error.message : undefined);
            throw error;
        } finally {
            database.close();
        }
    }
}

function createTableSql(plan: ImportPlanV1) {
    const columns = plan.columns
        .filter(column => !column.ignored)
        .sort((left, right) => left.order - right.order)
        .map(column => `${quoteIdentifier(column.target)} ${sqliteType(column.targetType)}`)
        .join(', ');
    return `CREATE TABLE ${qualifiedName(plan.target)} (${columns})`;
}

function qualifiedName(target: ImportTarget) {
    return `${quoteIdentifier(target.database?.trim() || 'main')}.${quoteIdentifier(target.table)}`;
}

function quoteIdentifier(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

function sqliteType(type: ImportColumnType) {
    return {
        string: 'TEXT',
        boolean: 'INTEGER',
        int64: 'INTEGER',
        float64: 'REAL',
        date: 'TEXT',
        datetime: 'TEXT',
    }[type];
}

function sqliteImportType(type: string): ImportColumnType {
    const normalized = type.toLocaleUpperCase();
    if (normalized.includes('BOOL')) return 'boolean';
    if (normalized.includes('DATE') && !normalized.includes('TIME')) return 'date';
    if (normalized.includes('TIME')) return 'datetime';
    if (normalized.includes('INT')) return 'int64';
    if (normalized.includes('REAL') || normalized.includes('FLOA') || normalized.includes('DOUB') || normalized.includes('NUM')) return 'float64';
    return 'string';
}

function sqliteValue(value: unknown, type: ImportColumnType) {
    if (value === null || value === undefined) return null;
    if (type === 'boolean') return value === true || value === 1 || value === BigInt(1) ? 1 : 0;
    if (value instanceof Date) return type === 'date' ? value.toISOString().slice(0, 10) : value.toISOString();
    if (type === 'date' && typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
    if (type === 'datetime' && (typeof value === 'number' || typeof value === 'bigint')) return new Date(Number(value)).toISOString();
    return value as string | number | bigint | Buffer;
}

function yieldEventLoop() {
    return new Promise<void>(resolve => setImmediate(resolve));
}

function abortError() {
    return new DOMException('The import was canceled', 'AbortError');
}
