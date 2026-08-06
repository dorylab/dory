import sql, { type ConnectionPool, type ISqlType } from 'mssql';

import { CommitUnknownError, type DataWriter, type ImportColumnType, type ImportExecutionPlan, type ImportTarget, type TargetColumn } from '@dory/import';
import {
    IMPORT_COLUMN_TYPES,
    abortError,
    activeImportColumns,
    assertImportSupported,
    atomicCapabilities,
    batchRows,
    isCommitOutcomeUnknown,
    quoteBracket,
    targetSchema,
} from '../shared/import-writer';

export class SqlServerImportWriter implements DataWriter {
    readonly dialect = 'sqlserver' as const;
    readonly allowedTypes = IMPORT_COLUMN_TYPES;

    constructor(private readonly resolvePool: (database?: string | null) => Promise<ConnectionPool>) {}

    async inspectTarget(target: ImportTarget) {
        const pool = await this.resolvePool(target.database);
        const schema = target.schema?.trim() || 'dbo';
        const result = await pool
            .request()
            .input('schema', sql.NVarChar, schema)
            .input('table', sql.NVarChar, target.table)
            .query<{
                COLUMN_NAME: string;
                DATA_TYPE: string;
                IS_NULLABLE: string;
                COLUMN_DEFAULT: string | null;
                IS_IDENTITY: number;
            }>(
                `SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
                        COLUMNPROPERTY(OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)), c.COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
                 FROM INFORMATION_SCHEMA.COLUMNS c
                 WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
                 ORDER BY c.ORDINAL_POSITION`,
            );
        return targetSchema(
            result.recordset.length > 0,
            result.recordset.map<TargetColumn>(column => ({
                name: column.COLUMN_NAME,
                databaseType: column.DATA_TYPE,
                importType: sqlServerImportType(column.DATA_TYPE),
                nullable: column.IS_NULLABLE === 'YES',
                hasDefault: column.COLUMN_DEFAULT !== null || column.IS_IDENTITY === 1,
            })),
            atomicCapabilities,
        );
    }

    async previewCreateTable(plan: ImportExecutionPlan) {
        return createTableSql(plan);
    }

    async write(input: Parameters<DataWriter['write']>[0]) {
        assertImportSupported(input.plan, (await this.inspectTarget(input.plan.target)).writeCapabilities);
        const pool = await this.resolvePool(input.plan.target.database);
        const transaction = new sql.Transaction(pool);
        const columns = activeImportColumns(input.plan);
        let rowsWritten = 0;
        let batches = 0;
        let commitStarted = false;
        let committed = false;

        try {
            if (input.signal.aborted) throw abortError();
            await transaction.begin();
            if (input.plan.target.mode === 'create') await new sql.Request(transaction).query(createTableSql(input.plan));
            else if (input.plan.mode === 'replace') await new sql.Request(transaction).query(`DELETE FROM ${qualifiedName(input.plan.target)}`);
            await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            const reader = await input.dataset.openBatches({ batchSize: input.batchSize, signal: input.signal });
            for await (const batch of reader) {
                if (input.signal.aborted) throw abortError();
                const rows = batchRows(batch, columns).map(row => row.map((value, index) => sqlServerValue(value, columns[index]!.targetType)));
                if (!rows.length) continue;
                const table = createSqlServerBulkTable(input.plan.target);
                for (const column of columns) table.columns.add(column.target, sqlServerBindType(column.targetType), { nullable: true });
                for (const row of rows) table.rows.add(...(row as Array<string | number | boolean | Date | Buffer | null | undefined>));
                const result = await new sql.Request(transaction).bulk(table);
                if (result.rowsAffected !== rows.length) throw new Error(`Expected to insert ${rows.length} rows, inserted ${result.rowsAffected}`);
                rowsWritten += result.rowsAffected;
                batches += 1;
                await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            }
            if (input.signal.aborted) throw abortError();
            await input.onProgress({ phase: 'committing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            commitStarted = true;
            await transaction.commit();
            committed = true;
            return { insertedRows: rowsWritten, batches, atomicity: 'atomic' as const };
        } catch (error) {
            if (!committed) await transaction.rollback().catch(() => undefined);
            if (commitStarted && !committed && isCommitOutcomeUnknown(error)) throw new CommitUnknownError(error instanceof Error ? error.message : undefined);
            throw error;
        }
    }
}

export function createSqlServerBulkTable(target: ImportTarget) {
    const schema = target.schema?.trim() || 'dbo';
    const table = new sql.Table();
    table.name = target.table;
    table.schema = schema;
    table.path = `${quoteBracket(schema)}.${quoteBracket(target.table)}`;
    table.create = false;
    return table;
}

function createTableSql(plan: ImportExecutionPlan) {
    return `CREATE TABLE ${qualifiedName(plan.target)} (${activeImportColumns(plan)
        .map(column => `${quoteBracket(column.target)} ${sqlServerType(column.targetType)} NULL`)
        .join(', ')})`;
}

function qualifiedName(target: ImportTarget) {
    return `${quoteBracket(target.schema?.trim() || 'dbo')}.${quoteBracket(target.table)}`;
}

function sqlServerType(type: ImportColumnType) {
    return { string: 'NVARCHAR(MAX)', boolean: 'BIT', int64: 'BIGINT', float64: 'FLOAT(53)', date: 'DATE', datetime: 'DATETIMEOFFSET(3)' }[type];
}

function sqlServerBindType(type: ImportColumnType): (() => ISqlType) | ISqlType {
    if (type === 'string') return sql.NVarChar(sql.MAX);
    if (type === 'boolean') return sql.Bit;
    if (type === 'int64') return sql.BigInt;
    if (type === 'float64') return sql.Float;
    if (type === 'date') return sql.Date;
    return sql.DateTimeOffset(3);
}

function sqlServerImportType(type: string): ImportColumnType {
    const normalized = type.toLocaleLowerCase();
    if (normalized === 'bit') return 'boolean';
    if (normalized === 'date') return 'date';
    if (normalized.includes('time')) return 'datetime';
    if (normalized.includes('int')) return 'int64';
    if (/float|real|decimal|numeric|money/.test(normalized)) return 'float64';
    return 'string';
}

function sqlServerValue(value: unknown, type: ImportColumnType) {
    if (value === null) return null;
    if (type === 'int64') return String(value);
    if (type === 'date' || type === 'datetime') return new Date(String(value));
    return value;
}
