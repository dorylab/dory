import { PartialWriteError, type DataWriter, type ImportColumnType, type ImportPlanV1, type ImportTarget, type TargetColumn } from '@dory/import';
import {
    IMPORT_COLUMN_TYPES,
    abortError,
    activeImportColumns,
    assertImportSupported,
    batchCommitCapabilities,
    batchRows,
    isCommitOutcomeUnknown,
    quoteBacktick,
    targetSchema,
} from '../shared/import-writer';
import type { ClickhouseDatasource } from './datasource';

export class ClickhouseImportWriter implements DataWriter {
    readonly dialect = 'clickhouse' as const;
    readonly allowedTypes = IMPORT_COLUMN_TYPES;

    constructor(private readonly datasource: ClickhouseDatasource) {}

    async inspectTarget(target: ImportTarget) {
        const database = target.database?.trim() || this.datasource.config.database || 'default';
        const result = await this.datasource.queryWithContext<{
            name: string;
            type: string;
            default_kind: string;
        }>(
            `SELECT name, type, default_kind
             FROM system.columns
             WHERE database = {database:String} AND table = {table:String}
             ORDER BY position`,
            { database, params: { database, table: target.table } },
        );
        return targetSchema(
            result.rows.length > 0,
            result.rows.map<TargetColumn>(column => ({
                name: column.name,
                databaseType: column.type,
                importType: clickhouseImportType(column.type),
                nullable: /^Nullable\(/i.test(column.type),
                hasDefault: Boolean(column.default_kind),
            })),
            batchCommitCapabilities,
        );
    }

    async previewCreateTable(plan: ImportPlanV1) {
        return createTableSql(plan, this.datasource.config.database);
    }

    async write(input: Parameters<DataWriter['write']>[0]) {
        assertImportSupported(input.plan, (await this.inspectTarget(input.plan.target)).writeCapabilities);
        const columns = activeImportColumns(input.plan);
        const database = input.plan.target.database?.trim() || this.datasource.config.database || 'default';
        let rowsWritten = 0;
        let batches = 0;
        let createAttempted = false;
        let createdTarget = false;
        let writeAttempted = false;

        return this.datasource.withClient(database, async client => {
            try {
                if (input.signal.aborted) throw abortError();
                if (input.plan.target.mode === 'create') {
                    createAttempted = true;
                    await client.command({ query: createTableSql(input.plan, database), abort_signal: input.signal });
                    createdTarget = true;
                }
                await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: rowsWritten, pendingCommit: false });
                const reader = await input.dataset.openBatches({ batchSize: input.batchSize, signal: input.signal });
                for await (const batch of reader) {
                    if (input.signal.aborted) throw abortError();
                    const rows = batchRows(batch, columns).map(row =>
                        Object.fromEntries(columns.map((column, index) => [column.target, clickhouseValue(row[index], column.targetType)])),
                    );
                    if (!rows.length) continue;
                    writeAttempted = true;
                    await client.insert({
                        table: qualifiedName(input.plan.target, database),
                        columns: columns.map(column => quoteBacktick(column.target)) as [string, ...string[]],
                        values: rows,
                        format: 'JSONEachRow',
                        abort_signal: input.signal,
                    });
                    rowsWritten += rows.length;
                    batches += 1;
                    await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: rowsWritten, pendingCommit: false });
                }
                return { insertedRows: rowsWritten, batches, atomicity: 'best-effort' as const };
            } catch (error) {
                if (createdTarget) {
                    const cleaned = await client
                        .command({ query: `DROP TABLE IF EXISTS ${qualifiedName(input.plan.target, database)}` })
                        .then(() => true)
                        .catch(() => false);
                    if (cleaned) {
                        await Promise.resolve(input.onProgress({ phase: 'writing', batches, rowsWritten: 0, rowsCommitted: 0, pendingCommit: false })).catch(() => undefined);
                        throw error;
                    }
                }
                if (rowsWritten > 0 || createdTarget || ((createAttempted || writeAttempted) && (input.signal.aborted || isCommitOutcomeUnknown(error)))) {
                    throw new PartialWriteError(error instanceof Error ? error.message : String(error), rowsWritten, batches, true);
                }
                throw error;
            }
        });
    }
}

function createTableSql(plan: ImportPlanV1, defaultDatabase?: string | null) {
    return `CREATE TABLE ${qualifiedName(plan.target, defaultDatabase)} (${activeImportColumns(plan)
        .map(column => `${quoteBacktick(column.target)} ${clickhouseType(column.targetType)}`)
        .join(', ')}) ENGINE = MergeTree ORDER BY tuple()`;
}

function qualifiedName(target: ImportTarget, defaultDatabase?: string | null) {
    return `${quoteBacktick(target.database?.trim() || defaultDatabase?.trim() || 'default')}.${quoteBacktick(target.table)}`;
}

function clickhouseType(type: ImportColumnType) {
    return {
        string: 'Nullable(String)',
        boolean: 'Nullable(Bool)',
        int64: 'Nullable(Int64)',
        float64: 'Nullable(Float64)',
        date: 'Nullable(Date)',
        datetime: "Nullable(DateTime64(3, 'UTC'))",
    }[type];
}

function clickhouseImportType(type: string): ImportColumnType {
    const normalized = type.replace(/^Nullable\((.*)\)$/i, '$1').toLocaleUpperCase();
    if (normalized === 'BOOL' || normalized === 'BOOLEAN' || normalized === 'UINT8') return 'boolean';
    if (normalized === 'DATE' || normalized === 'DATE32') return 'date';
    if (normalized.includes('DATETIME')) return 'datetime';
    if (/^U?INT/.test(normalized)) return 'int64';
    if (/FLOAT|DECIMAL/.test(normalized)) return 'float64';
    return 'string';
}

function clickhouseValue(value: unknown, type: ImportColumnType) {
    if (value === null) return null;
    if (type === 'int64') return String(value);
    if (type === 'date') return String(value).slice(0, 10);
    if (type === 'datetime') return String(value).replace('T', ' ').replace('Z', '');
    return value;
}
