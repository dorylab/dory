import oracledb, { type BindDefinition, type Pool } from 'oracledb';

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

const ORACLE_CAPABILITIES = capabilityMatrix({
    create: 'best-effort',
    append: 'atomic',
    replace: 'atomic',
    createReason: 'ddl_not_transactional',
});

export class OracleImportWriter implements DataWriter {
    readonly dialect = 'oracle' as const;
    readonly allowedTypes = IMPORT_COLUMN_TYPES;

    constructor(
        private readonly resolvePool: (database?: string | null) => Promise<Pool>,
        private readonly defaultSchema?: string | null,
    ) {}

    async inspectTarget(target: ImportTarget) {
        const pool = await this.resolvePool(target.database);
        const connection = await pool.getConnection();
        const owner = (target.schema?.trim() || this.defaultSchema?.trim() || '').toLocaleUpperCase();
        try {
            const result = await connection.execute<{
                COLUMN_NAME: string;
                DATA_TYPE: string;
                DATA_PRECISION: number | null;
                DATA_SCALE: number | null;
                NULLABLE: string;
                DATA_DEFAULT: string | null;
                IDENTITY_COLUMN?: string;
            }>(
                `SELECT column_name, data_type, data_precision, data_scale, nullable, data_default, identity_column
                 FROM all_tab_columns
                 WHERE owner = :owner AND table_name = :table_name
                 ORDER BY column_id`,
                { owner, table_name: target.table },
                { outFormat: oracledb.OUT_FORMAT_OBJECT },
            );
            const rows = result.rows ?? [];
            return targetSchema(
                rows.length > 0,
                rows.map<TargetColumn>(column => ({
                    name: column.COLUMN_NAME,
                    databaseType: column.DATA_TYPE,
                    importType: oracleImportType(column.DATA_TYPE, column.DATA_PRECISION, column.DATA_SCALE),
                    nullable: column.NULLABLE === 'Y',
                    hasDefault: column.DATA_DEFAULT !== null || column.IDENTITY_COLUMN === 'YES',
                })),
                ORACLE_CAPABILITIES,
            );
        } finally {
            await connection.close();
        }
    }

    async previewCreateTable(plan: ImportExecutionPlan) {
        return createTableSql(plan, this.defaultSchema);
    }

    async write(input: Parameters<DataWriter['write']>[0]) {
        assertImportSupported(input.plan, (await this.inspectTarget(input.plan.target)).writeCapabilities);
        const pool = await this.resolvePool(input.plan.target.database);
        const connection = await pool.getConnection();
        const columns = activeImportColumns(input.plan);
        const target = qualifiedName(input.plan.target, this.defaultSchema);
        const sql = `INSERT INTO ${target} (${columns.map(column => quoteDouble(column.target)).join(', ')}) VALUES (${columns.map((_, index) => `:${index + 1}`).join(', ')})`;
        const bindDefs = columns.map<BindDefinition>(column => oracleBindDefinition(column.targetType));
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
                await connection.execute(createTableSql(input.plan, this.defaultSchema));
                createdTarget = true;
            } else if (input.plan.mode === 'replace') {
                await connection.execute(`DELETE FROM ${target}`);
            }
            await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            const dataStream = await input.dataSource.open({ batchRows: input.batchSize, signal: input.signal });
            for await (const batch of dataStream.batches()) {
                if (input.signal.aborted) throw abortError();
                const rows = batchRows(batch, columns).map(row => row.map((value, index) => oracleValue(value, columns[index]!.targetType)));
                if (!rows.length) continue;
                const result = await connection.executeMany(sql, rows, { autoCommit: false, bindDefs });
                const affected = result.rowsAffected ?? rows.length;
                if (affected !== rows.length) throw new Error(`Expected to insert ${rows.length} rows, inserted ${affected}`);
                rowsWritten += affected;
                batches += 1;
                await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            }
            if (input.signal.aborted) throw abortError();
            await input.onProgress({ phase: 'committing', batches, rowsWritten, rowsCommitted: 0, pendingCommit: true });
            commitStarted = true;
            await connection.commit();
            committed = true;
            return { insertedRows: rowsWritten, batches, atomicity: input.plan.target.mode === 'create' ? ('best-effort' as const) : ('atomic' as const) };
        } catch (error) {
            if (!committed) await connection.rollback().catch(() => undefined);
            if (commitStarted && !committed && isCommitOutcomeUnknown(error)) throw new CommitUnknownError(error instanceof Error ? error.message : undefined);
            if (createdTarget) {
                const cleaned = await connection
                    .execute(`DROP TABLE ${target} PURGE`)
                    .then(() => true)
                    .catch(() => false);
                if (cleaned) throw error;
            }
            if (createdTarget || (createAttempted && isCommitOutcomeUnknown(error))) {
                throw new PartialWriteError(error instanceof Error ? error.message : String(error), 0, batches, true);
            }
            throw error;
        } finally {
            await connection.close();
        }
    }
}

function createTableSql(plan: ImportExecutionPlan, defaultSchema?: string | null) {
    return `CREATE TABLE ${qualifiedName(plan.target, defaultSchema)} (${activeImportColumns(plan)
        .map(column => `${quoteDouble(column.target)} ${oracleType(column.targetType)}`)
        .join(', ')})`;
}

function qualifiedName(target: ImportTarget, defaultSchema?: string | null) {
    const schema = target.schema?.trim() || defaultSchema?.trim();
    return [schema, target.table]
        .filter((part): part is string => Boolean(part))
        .map(quoteDouble)
        .join('.');
}

function oracleType(type: ImportColumnType) {
    return {
        string: 'CLOB',
        boolean: 'NUMBER(1)',
        int64: 'NUMBER(19)',
        float64: 'BINARY_DOUBLE',
        date: 'DATE',
        datetime: 'TIMESTAMP WITH TIME ZONE',
    }[type];
}

function oracleImportType(type: string, precision: number | null, scale: number | null): ImportColumnType {
    const normalized = type.toLocaleUpperCase();
    if (normalized === 'BOOLEAN' || (normalized.includes('NUMBER') && precision === 1 && scale === 0)) return 'boolean';
    if (normalized === 'DATE') return 'date';
    if (normalized.includes('TIMESTAMP')) return 'datetime';
    if (normalized.includes('BINARY_') || normalized.includes('FLOAT')) return 'float64';
    if (normalized.includes('NUMBER')) return scale !== null && scale > 0 ? 'float64' : 'int64';
    if (normalized.includes('INTEGER')) return 'int64';
    return 'string';
}

function oracleBindDefinition(type: ImportColumnType): BindDefinition {
    if (type === 'string') return { type: oracledb.CLOB };
    if (type === 'date' || type === 'datetime') return { type: oracledb.DATE };
    if (type === 'float64') return { type: oracledb.NUMBER };
    if (type === 'boolean') return { type: oracledb.NUMBER };
    return { type: oracledb.STRING, maxSize: 32 };
}

function oracleValue(value: unknown, type: ImportColumnType) {
    if (value === null) return null;
    if (type === 'boolean') return value ? 1 : 0;
    if (type === 'date' || type === 'datetime') return new Date(String(value));
    if (type === 'int64') return String(value);
    return value;
}
