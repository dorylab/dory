import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import type { Pool } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';

import {
    CommitUnknownError,
    type DataWriter,
    type ImportColumnMappingV1,
    type ImportColumnType,
    type ImportPlanV1,
    type ImportTarget,
    type TargetColumn,
    type TargetSchema,
} from '@dory/import';
import { atomicCapabilities } from '../shared/import-writer';

const ALLOWED_TYPES: ReadonlyArray<ImportColumnType> = ['string', 'boolean', 'int64', 'float64', 'date', 'datetime'];

export class PostgresImportWriter implements DataWriter {
    readonly dialect = 'postgres' as const;
    readonly allowedTypes = ALLOWED_TYPES;

    constructor(private readonly resolvePool: (database?: string | null) => Pool) {}

    async inspectTarget(target: ImportTarget): Promise<TargetSchema> {
        const schema = target.schema?.trim() || 'public';
        const pool = this.resolvePool(target.database);
        const table = await pool.query<{ exists: boolean }>(
            `SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = $1 AND table_name = $2
            ) AS exists`,
            [schema, target.table],
        );
        const result = await pool.query<{
            column_name: string;
            data_type: string;
            udt_name: string;
            is_nullable: string;
            column_default: string | null;
        }>(
            `SELECT column_name, data_type, udt_name, is_nullable, column_default
             FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2
             ORDER BY ordinal_position`,
            [schema, target.table],
        );
        return {
            exists: table.rows[0]?.exists ?? false,
            columns: result.rows.map<TargetColumn>(column => ({
                name: column.column_name,
                databaseType: column.data_type,
                importType: postgresImportType(column.data_type, column.udt_name),
                nullable: column.is_nullable === 'YES',
                hasDefault: column.column_default !== null,
            })),
            writeCapabilities: atomicCapabilities,
        };
    }

    async previewCreateTable(plan: ImportPlanV1): Promise<string> {
        return createTableSql(plan);
    }

    async write(input: Parameters<DataWriter['write']>[0]) {
        const { plan, signal } = input;
        const pool = this.resolvePool(plan.target.database);
        const client = await pool.connect();
        const columns = activeColumns(plan);
        let copyStream: ReturnType<typeof copyFrom> | null = null;
        let committed = false;
        let commitStarted = false;
        let batches = 0;
        let rowsWritten = 0;

        const abort = () => copyStream?.destroy(abortError());
        signal.addEventListener('abort', abort, { once: true });

        try {
            if (signal.aborted) throw abortError();
            await client.query('BEGIN');
            if (plan.target.mode === 'create') {
                await client.query(createTableSql(plan));
            } else if (plan.mode === 'replace') {
                await client.query(`TRUNCATE TABLE ${qualifiedName(plan.target)}`);
            }

            const names = columns.map(column => quoteIdentifier(column.target)).join(', ');
            const sql = `COPY ${qualifiedName(plan.target)} (${names}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`;
            copyStream = client.query(copyFrom(sql));
            const completion = finished(copyStream);
            await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            const reader = await input.dataset.openBatches({ batchSize: input.batchSize, signal });

            for await (const batch of reader) {
                if (signal.aborted) throw abortError();
                let chunk = '';
                for (let row = 0; row < batch.numRows; row += 1) {
                    chunk += `${columns.map(column => copyField(batch.getChild(column.target)?.get(row), column.targetType)).join(',')}\n`;
                }
                if (chunk && !copyStream.write(chunk)) await once(copyStream, 'drain');
                batches += 1;
                rowsWritten += batch.numRows;
                await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            }

            copyStream.end();
            await completion;
            if (signal.aborted) throw abortError();
            await input.onProgress({ phase: 'committing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            if (signal.aborted) throw abortError();
            commitStarted = true;
            await client.query('COMMIT');
            committed = true;
            return { insertedRows: rowsWritten, batches, atomicity: 'atomic' as const };
        } catch (error) {
            copyStream?.destroy();
            if (!committed) await client.query('ROLLBACK').catch(() => undefined);
            if (commitStarted && !committed && isCommitOutcomeUnknown(error)) {
                throw new CommitUnknownError(error instanceof Error ? error.message : undefined);
            }
            throw error;
        } finally {
            signal.removeEventListener('abort', abort);
            client.release();
        }
    }
}

function activeColumns(plan: ImportPlanV1) {
    return plan.columns.filter(column => !column.ignored).sort((left, right) => left.order - right.order);
}

function createTableSql(plan: ImportPlanV1) {
    const columns = activeColumns(plan)
        .map(column => `${quoteIdentifier(column.target)} ${postgresType(column.targetType)}`)
        .join(', ');
    return `CREATE TABLE ${qualifiedName(plan.target)} (${columns})`;
}

function qualifiedName(target: ImportTarget) {
    return `${quoteIdentifier(target.schema?.trim() || 'public')}.${quoteIdentifier(target.table)}`;
}

function quoteIdentifier(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
}

function postgresType(type: ImportColumnType) {
    return {
        string: 'TEXT',
        boolean: 'BOOLEAN',
        int64: 'BIGINT',
        float64: 'DOUBLE PRECISION',
        date: 'DATE',
        datetime: 'TIMESTAMPTZ',
    }[type];
}

function postgresImportType(dataType: string, udtName: string): ImportColumnType {
    if (dataType === 'boolean') return 'boolean';
    if (dataType === 'date') return 'date';
    if (dataType.includes('timestamp')) return 'datetime';
    if (['smallint', 'integer', 'bigint'].includes(dataType) || ['int2', 'int4', 'int8'].includes(udtName)) return 'int64';
    if (['numeric', 'decimal', 'real', 'double precision'].includes(dataType)) return 'float64';
    return 'string';
}

function copyField(value: unknown, type: ImportColumnType) {
    if (value === null || value === undefined) return '\\N';
    const text = formatValue(value, type);
    if (text === '') return '""';
    return `"${text.replace(/"/g, '""')}"`;
}

function formatValue(value: unknown, type: ImportColumnType) {
    if (value instanceof Date) return type === 'date' ? value.toISOString().slice(0, 10) : value.toISOString();
    if (type === 'date' && typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
    if (type === 'datetime' && (typeof value === 'number' || typeof value === 'bigint')) return new Date(Number(value)).toISOString();
    return String(value);
}

function abortError() {
    return new DOMException('The import was canceled', 'AbortError');
}

function isCommitOutcomeUnknown(error: unknown) {
    if (!(error instanceof Error)) return true;
    const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
    if (code.startsWith('08') || ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED'].includes(code)) return true;
    return /connection (?:terminated|closed|lost)|socket hang up|write after end/i.test(error.message);
}
