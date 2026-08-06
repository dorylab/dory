import type { DuckDBConnection, DuckDBValue } from '@duckdb/node-api';

import { CommitUnknownError, type DataWriter, type ImportColumnType, type ImportExecutionPlan, type ImportTarget, type TargetColumn } from '@dory/import';
import {
    IMPORT_COLUMN_TYPES,
    abortError,
    activeImportColumns,
    assertImportSupported,
    atomicCapabilities,
    batchRows,
    isCommitOutcomeUnknown,
    quoteDouble,
    targetSchema,
} from '../shared/import-writer';

export class DuckDbImportWriter implements DataWriter {
    readonly dialect = 'duckdb' as const;
    readonly allowedTypes = IMPORT_COLUMN_TYPES;

    constructor(private readonly getConnection: () => DuckDBConnection) {}

    async inspectTarget(target: ImportTarget) {
        const catalog = target.database?.trim() || 'memory';
        const schema = target.schema?.trim() || 'main';
        const reader = await this.getConnection().runAndReadAll(
            `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
             WHERE table_catalog = ? AND table_schema = ? AND table_name = ?
             ORDER BY ordinal_position`,
            [catalog, schema, target.table],
        );
        const rows = reader.getRowObjectsJson() as Array<{ column_name: string; data_type: string; is_nullable: string; column_default: unknown }>;
        return targetSchema(
            rows.length > 0,
            rows.map<TargetColumn>(column => ({
                name: column.column_name,
                databaseType: column.data_type,
                importType: duckDbImportType(column.data_type),
                nullable: column.is_nullable === 'YES',
                hasDefault: column.column_default !== null,
            })),
            atomicCapabilities,
        );
    }

    async previewCreateTable(plan: ImportExecutionPlan) {
        return createTableSql(plan);
    }

    async write(input: Parameters<DataWriter['write']>[0]) {
        const capabilities = (await this.inspectTarget(input.plan.target)).writeCapabilities;
        assertImportSupported(input.plan, capabilities);
        const connection = this.getConnection();
        const columns = activeImportColumns(input.plan);
        const names = columns.map(column => quoteDouble(column.target)).join(', ');
        let statement: Awaited<ReturnType<DuckDBConnection['prepare']>> | null = null;
        let rowsWritten = 0;
        let batches = 0;
        let commitStarted = false;
        let committed = false;

        try {
            if (input.signal.aborted) throw abortError();
            await connection.run('BEGIN TRANSACTION');
            if (input.plan.target.mode === 'create') await connection.run(createTableSql(input.plan));
            else if (input.plan.mode === 'replace') await connection.run(`DELETE FROM ${qualifiedName(input.plan.target)}`);
            statement = await connection.prepare(`INSERT INTO ${qualifiedName(input.plan.target)} (${names}) VALUES (${columns.map(() => '?').join(', ')})`);
            await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            const reader = await input.dataset.openBatches({ batchSize: input.batchSize, signal: input.signal });
            for await (const batch of reader) {
                if (input.signal.aborted) throw abortError();
                for (const row of batchRows(batch, columns)) {
                    statement.bind(row as DuckDBValue[]);
                    await statement.run();
                    statement.clearBindings();
                    rowsWritten += 1;
                }
                batches += 1;
                await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            }
            if (input.signal.aborted) throw abortError();
            await input.onProgress({ phase: 'committing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            commitStarted = true;
            await connection.run('COMMIT');
            committed = true;
            return { insertedRows: rowsWritten, batches, atomicity: 'atomic' as const };
        } catch (error) {
            if (!committed) await connection.run('ROLLBACK').catch(() => undefined);
            if (commitStarted && !committed && isCommitOutcomeUnknown(error)) throw new CommitUnknownError(error instanceof Error ? error.message : undefined);
            throw error;
        } finally {
            statement?.destroySync();
        }
    }
}

function createTableSql(plan: ImportExecutionPlan) {
    return `CREATE TABLE ${qualifiedName(plan.target)} (${activeImportColumns(plan)
        .map(column => `${quoteDouble(column.target)} ${duckDbType(column.targetType)}`)
        .join(', ')})`;
}

function qualifiedName(target: ImportTarget) {
    const parts = [target.database?.trim(), target.schema?.trim() || 'main', target.table].filter((part): part is string => Boolean(part));
    return parts.map(quoteDouble).join('.');
}

function duckDbType(type: ImportColumnType) {
    return { string: 'VARCHAR', boolean: 'BOOLEAN', int64: 'BIGINT', float64: 'DOUBLE', date: 'DATE', datetime: 'TIMESTAMPTZ' }[type];
}

function duckDbImportType(type: string): ImportColumnType {
    const normalized = type.toLocaleUpperCase();
    if (normalized === 'BOOLEAN') return 'boolean';
    if (normalized === 'DATE') return 'date';
    if (normalized.includes('TIMESTAMP')) return 'datetime';
    if (normalized.includes('INT')) return 'int64';
    if (/DOUBLE|FLOAT|REAL|DECIMAL|NUMERIC/.test(normalized)) return 'float64';
    return 'string';
}
