import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { CommitUnknownError, PartialWriteError, type DataWriter, type ImportColumnType, type ImportExecutionPlan, type ImportTarget, type TargetColumn } from '@dory/import';
import {
    IMPORT_COLUMN_TYPES,
    abortError,
    activeImportColumns,
    assertImportSupported,
    batchRows,
    capabilityMatrix,
    importOperation,
    isCommitOutcomeUnknown,
    quoteBacktick,
    targetSchema,
} from '../shared/import-writer';

const TRANSACTIONAL_ENGINES = new Set(['INNODB', 'NDB', 'NDBCLUSTER']);

export class MySqlImportWriter implements DataWriter {
    readonly dialect = 'mysql' as const;
    readonly allowedTypes = IMPORT_COLUMN_TYPES;

    constructor(private readonly resolvePool: (database?: string | null) => Pool) {}

    async inspectTarget(target: ImportTarget) {
        const database = target.database?.trim();
        if (!database) throw new Error('A target database is required');
        const pool = this.resolvePool(database);
        const [tables] = await pool.query<Array<RowDataPacket & { ENGINE: string | null }>>(
            `SELECT ENGINE FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`,
            [database, target.table],
        );
        const [columns] = await pool.query<
            Array<RowDataPacket & { COLUMN_NAME: string; DATA_TYPE: string; COLUMN_TYPE: string; IS_NULLABLE: string; COLUMN_DEFAULT: unknown; EXTRA: string }>
        >(
            `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
             FROM information_schema.columns
             WHERE table_schema = ? AND table_name = ?
             ORDER BY ORDINAL_POSITION`,
            [database, target.table],
        );
        const exists = tables.length > 0;
        const transactional = !exists || TRANSACTIONAL_ENGINES.has((tables[0]?.ENGINE ?? '').toLocaleUpperCase());
        const capabilities = capabilityMatrix({
            create: 'best-effort',
            append: transactional ? 'atomic' : 'best-effort',
            replace: transactional ? 'atomic' : false,
            createReason: 'ddl_not_transactional',
            ...(transactional ? {} : { appendReason: 'target_non_transactional' as const, replaceReason: 'target_non_transactional' as const }),
        });
        return targetSchema(
            exists,
            columns.map<TargetColumn>(column => ({
                name: column.COLUMN_NAME,
                databaseType: column.COLUMN_TYPE,
                importType: mysqlImportType(column.DATA_TYPE, column.COLUMN_TYPE),
                nullable: column.IS_NULLABLE === 'YES',
                hasDefault: column.COLUMN_DEFAULT !== null || /auto_increment|generated/i.test(column.EXTRA),
            })),
            capabilities,
        );
    }

    async previewCreateTable(plan: ImportExecutionPlan) {
        return createTableSql(plan);
    }

    async write(input: Parameters<DataWriter['write']>[0]) {
        const inspected = await this.inspectTarget(input.plan.target);
        const capability = assertImportSupported(input.plan, inspected.writeCapabilities);
        const operation = importOperation(input.plan);
        const atomicDml = capability.atomicity === 'atomic' || operation === 'create';
        const pool = this.resolvePool(input.plan.target.database);
        const connection = await pool.getConnection();
        const columns = activeImportColumns(input.plan);
        let rowsWritten = 0;
        let rowsCommitted = 0;
        let batches = 0;
        let createAttempted = false;
        let createdTarget = false;
        let writeAttempted = false;
        let commitStarted = false;
        let committed = false;

        try {
            if (input.signal.aborted) throw abortError();
            if (operation === 'create') {
                createAttempted = true;
                await connection.query(createTableSql(input.plan));
                createdTarget = true;
            }
            if (atomicDml) await connection.beginTransaction();
            if (operation === 'replace') await connection.query(`DELETE FROM ${qualifiedName(input.plan.target)}`);
            await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted, pendingCommit: atomicDml });
            const dataStream = await input.dataSource.open({ batchRows: input.batchSize, signal: input.signal });

            for await (const batch of dataStream.batches()) {
                if (input.signal.aborted) throw abortError();
                const rows = batchRows(batch, columns).map(row => row.map((value, index) => mysqlValue(value, columns[index]!.targetType)));
                if (!rows.length) continue;
                const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
                const names = columns.map(column => quoteBacktick(column.target)).join(', ');
                writeAttempted = true;
                const [result] = await connection.query(`INSERT INTO ${qualifiedName(input.plan.target)} (${names}) VALUES ${placeholders}`, rows.flat());
                const affected = (result as ResultSetHeader).affectedRows;
                if (affected !== rows.length) throw new Error(`Expected to insert ${rows.length} rows, inserted ${affected}`);
                batches += 1;
                rowsWritten += affected;
                if (!atomicDml) rowsCommitted = rowsWritten;
                await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted, pendingCommit: atomicDml });
            }

            if (input.signal.aborted) throw abortError();
            if (atomicDml) {
                await input.onProgress({ phase: 'committing', batches, rowsWritten, rowsCommitted, pendingCommit: true });
                commitStarted = true;
                await connection.commit();
            }
            committed = true;
            return { insertedRows: rowsWritten, batches, atomicity: capability.atomicity };
        } catch (error) {
            if (atomicDml && !committed) await connection.rollback().catch(() => undefined);
            if (commitStarted && !committed && isCommitOutcomeUnknown(error)) {
                throw new CommitUnknownError(error instanceof Error ? error.message : undefined);
            }
            if (createdTarget) {
                const cleaned = await connection
                    .query(`DROP TABLE IF EXISTS ${qualifiedName(input.plan.target)}`)
                    .then(() => true)
                    .catch(() => false);
                if (cleaned) throw error;
            }
            const targetMayBeChanged =
                rowsCommitted > 0 || createdTarget || (createAttempted && isCommitOutcomeUnknown(error)) || (!atomicDml && writeAttempted && isCommitOutcomeUnknown(error));
            if (targetMayBeChanged) throw new PartialWriteError(error instanceof Error ? error.message : String(error), rowsCommitted, batches, true);
            throw error;
        } finally {
            connection.release();
        }
    }
}

function createTableSql(plan: ImportExecutionPlan) {
    const columns = activeImportColumns(plan)
        .map(column => `${quoteBacktick(column.target)} ${mysqlType(column.targetType)}`)
        .join(', ');
    return `CREATE TABLE ${qualifiedName(plan.target)} (${columns}) ENGINE=InnoDB`;
}

function qualifiedName(target: ImportTarget) {
    const database = target.database?.trim();
    if (!database) throw new Error('A target database is required');
    return `${quoteBacktick(database)}.${quoteBacktick(target.table)}`;
}

function mysqlType(type: ImportColumnType) {
    return { string: 'LONGTEXT', boolean: 'BOOLEAN', int64: 'BIGINT', float64: 'DOUBLE', date: 'DATE', datetime: 'DATETIME(3)' }[type];
}

function mysqlImportType(type: string, columnType: string): ImportColumnType {
    if (type === 'boolean' || (type === 'tinyint' && /^tinyint\(1\)/i.test(columnType))) return 'boolean';
    if (type === 'date') return 'date';
    if (type.includes('time')) return 'datetime';
    if (/int$/.test(type)) return 'int64';
    if (['decimal', 'numeric', 'float', 'double', 'real'].includes(type)) return 'float64';
    return 'string';
}

function mysqlValue(value: unknown, type: ImportColumnType) {
    if (value === null) return null;
    if (type === 'boolean') return value ? 1 : 0;
    if (type === 'datetime') return String(value).replace('T', ' ').replace(/Z$/, '');
    return value;
}
