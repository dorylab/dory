import type snowflake from 'snowflake-sdk';

import { CommitUnknownError, PartialWriteError, type DataWriter, type ImportColumnType, type ImportExecutionPlan, type ImportTarget, type TargetColumn } from '@dory/import';
import {
    IMPORT_COLUMN_TYPES,
    abortError,
    activeImportColumns,
    assertImportSupported,
    batchRows,
    capabilityMatrix,
    isCommitOutcomeUnknown,
    quoteDouble,
    targetSchema,
} from '../shared/import-writer';

const SNOWFLAKE_CAPABILITIES = capabilityMatrix({
    create: 'best-effort',
    append: 'atomic',
    replace: 'atomic',
    createReason: 'ddl_not_transactional',
});

export class SnowflakeImportWriter implements DataWriter {
    readonly dialect = 'snowflake' as const;
    readonly allowedTypes = IMPORT_COLUMN_TYPES;

    constructor(
        private readonly getConnection: () => snowflake.Connection,
        private readonly defaultSchema = 'PUBLIC',
    ) {}

    async inspectTarget(target: ImportTarget) {
        const database = target.database?.trim();
        if (!database) throw new Error('A target database is required');
        const schema = target.schema?.trim() || this.defaultSchema;
        const rows = await executeRows<{
            COLUMN_NAME: string;
            DATA_TYPE: string;
            NUMERIC_SCALE: number | null;
            IS_NULLABLE: string;
            COLUMN_DEFAULT: string | null;
            IS_IDENTITY?: string;
        }>(
            this.getConnection(),
            `SELECT column_name, data_type, numeric_scale, is_nullable, column_default, is_identity
             FROM ${quoteDouble(database)}.information_schema.columns
             WHERE table_schema = ? AND table_name = ?
             ORDER BY ordinal_position`,
            [schema, target.table],
        );
        return targetSchema(
            rows.length > 0,
            rows.map<TargetColumn>(column => ({
                name: column.COLUMN_NAME,
                databaseType: column.DATA_TYPE,
                importType: snowflakeImportType(column.DATA_TYPE, column.NUMERIC_SCALE),
                nullable: column.IS_NULLABLE === 'YES',
                hasDefault: column.COLUMN_DEFAULT !== null || column.IS_IDENTITY === 'YES',
            })),
            SNOWFLAKE_CAPABILITIES,
        );
    }

    async previewCreateTable(plan: ImportExecutionPlan) {
        return createTableSql(plan, this.defaultSchema);
    }

    async write(input: Parameters<DataWriter['write']>[0]) {
        assertImportSupported(input.plan, (await this.inspectTarget(input.plan.target)).writeCapabilities);
        const connection = this.getConnection();
        const columns = activeImportColumns(input.plan);
        const target = qualifiedName(input.plan.target, this.defaultSchema);
        const insertSql = `INSERT INTO ${target} (${columns.map(column => quoteDouble(column.target)).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
        let rowsWritten = 0;
        let batches = 0;
        let createAttempted = false;
        let createdTarget = false;
        let commitStarted = false;
        let committed = false;

        try {
            if (input.signal.aborted) throw abortError();
            if (input.plan.target.mode === 'create') {
                createAttempted = true;
                await execute(connection, createTableSql(input.plan, this.defaultSchema));
                createdTarget = true;
            }
            await execute(connection, 'BEGIN TRANSACTION');
            if (input.plan.target.mode === 'existing' && input.plan.mode === 'replace') await execute(connection, `DELETE FROM ${target}`);
            await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            const dataStream = await input.dataSource.open({ batchRows: input.batchSize, signal: input.signal });
            for await (const batch of dataStream.batches()) {
                if (input.signal.aborted) throw abortError();
                const rows = batchRows(batch, columns).map(row => row.map((value, index) => snowflakeValue(value, columns[index]!.targetType)));
                if (!rows.length) continue;
                await execute(connection, insertSql, rows as snowflake.Binds);
                rowsWritten += rows.length;
                batches += 1;
                await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            }
            if (input.signal.aborted) throw abortError();
            await input.onProgress({ phase: 'committing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            commitStarted = true;
            await execute(connection, 'COMMIT');
            committed = true;
            return { insertedRows: rowsWritten, batches, atomicity: input.plan.target.mode === 'create' ? ('best-effort' as const) : ('atomic' as const) };
        } catch (error) {
            if (!committed) await execute(connection, 'ROLLBACK').catch(() => undefined);
            if (commitStarted && !committed && isCommitOutcomeUnknown(error)) throw new CommitUnknownError(error instanceof Error ? error.message : undefined);
            if (createdTarget) {
                const cleaned = await execute(connection, `DROP TABLE IF EXISTS ${target}`)
                    .then(() => true)
                    .catch(() => false);
                if (cleaned) throw error;
            }
            if (createdTarget || (createAttempted && isCommitOutcomeUnknown(error))) {
                throw new PartialWriteError(error instanceof Error ? error.message : String(error), 0, batches, true);
            }
            throw error;
        }
    }
}

function execute(connection: snowflake.Connection, sqlText: string, binds?: snowflake.Binds) {
    return new Promise<void>((resolve, reject) => {
        connection.execute({
            sqlText,
            binds,
            complete: error => (error ? reject(error) : resolve()),
        });
    });
}

function executeRows<Row>(connection: snowflake.Connection, sqlText: string, binds?: snowflake.Binds) {
    return new Promise<Row[]>((resolve, reject) => {
        connection.execute({
            sqlText,
            binds,
            complete: (error, _statement, rows) => (error ? reject(error) : resolve((rows ?? []) as Row[])),
        });
    });
}

function createTableSql(plan: ImportExecutionPlan, defaultSchema: string) {
    return `CREATE TABLE ${qualifiedName(plan.target, defaultSchema)} (${activeImportColumns(plan)
        .map(column => `${quoteDouble(column.target)} ${snowflakeType(column.targetType)}`)
        .join(', ')})`;
}

function qualifiedName(target: ImportTarget, defaultSchema: string) {
    const database = target.database?.trim();
    if (!database) throw new Error('A target database is required');
    return [database, target.schema?.trim() || defaultSchema, target.table].map(quoteDouble).join('.');
}

function snowflakeType(type: ImportColumnType) {
    return { string: 'VARCHAR', boolean: 'BOOLEAN', int64: 'NUMBER(38,0)', float64: 'DOUBLE', date: 'DATE', datetime: 'TIMESTAMP_TZ' }[type];
}

function snowflakeImportType(type: string, numericScale: number | null): ImportColumnType {
    const normalized = type.toLocaleUpperCase();
    if (normalized === 'BOOLEAN') return 'boolean';
    if (normalized === 'DATE') return 'date';
    if (normalized.includes('TIMESTAMP')) return 'datetime';
    if (/FLOAT|DOUBLE|REAL|DECIMAL/.test(normalized)) return 'float64';
    if (normalized.includes('NUMBER')) return numericScale !== null && numericScale > 0 ? 'float64' : 'int64';
    if (normalized.includes('INT')) return 'int64';
    return 'string';
}

function snowflakeValue(value: unknown, type: ImportColumnType) {
    if (value === null) return null;
    if (type === 'int64') return String(value);
    if (type === 'date' || type === 'datetime') return String(value);
    return value;
}
