import { PartialWriteError, type DataWriter, type ImportColumnType, type ImportPlanV1, type ImportTarget, type TargetColumn } from '@dory/import';
import type { BaseConfig } from '@dory/drivers/types';
import {
    IMPORT_COLUMN_TYPES,
    abortError,
    activeImportColumns,
    assertImportSupported,
    batchCommitCapabilities,
    batchRows,
    isCommitOutcomeUnknown,
    quoteDouble,
    targetSchema,
} from '../shared/import-writer';
import { executeCloudflareD1Batch, executeCloudflareD1Query, type CloudflareD1BatchQuery } from './runtime';

const D1_PARAMETER_LIMIT = 100;
const D1_STATEMENT_LIMIT = 100_000;

export class CloudflareD1ImportWriter implements DataWriter {
    readonly dialect = 'sqlite' as const;
    readonly allowedTypes = IMPORT_COLUMN_TYPES;

    constructor(private readonly config: BaseConfig) {}

    async inspectTarget(target: ImportTarget) {
        const schema = target.database?.trim() || 'main';
        const table = await executeCloudflareD1Query<{ exists: number }>(
            this.config,
            `SELECT EXISTS(SELECT 1 FROM ${quoteDouble(schema)}.sqlite_master WHERE type = 'table' AND name = ?1) AS exists`,
            [target.table],
        );
        if (!table.rows[0]?.exists) return targetSchema(false, [], batchCommitCapabilities);
        const columns = await executeCloudflareD1Query<{
            name: string;
            type: string;
            notnull: number;
            dflt_value: unknown;
            pk: number;
        }>(this.config, `PRAGMA ${quoteDouble(schema)}.table_info('${target.table.replaceAll("'", "''")}')`);
        return targetSchema(
            true,
            columns.rows.map<TargetColumn>(column => ({
                name: column.name,
                databaseType: column.type || 'BLOB',
                importType: d1ImportType(column.type),
                nullable: column.notnull === 0 && column.pk === 0,
                hasDefault: column.dflt_value !== null || column.pk > 0,
            })),
            batchCommitCapabilities,
        );
    }

    async previewCreateTable(plan: ImportPlanV1) {
        return createTableSql(plan);
    }

    async write(input: Parameters<DataWriter['write']>[0]) {
        assertImportSupported(input.plan, (await this.inspectTarget(input.plan.target)).writeCapabilities);
        const columns = activeImportColumns(input.plan);
        let rowsWritten = 0;
        let batches = 0;
        let createAttempted = false;
        let createdTarget = false;
        let writeAttempted = false;
        try {
            if (input.signal.aborted) throw abortError();
            if (input.plan.target.mode === 'create') {
                createAttempted = true;
                await executeCloudflareD1Query(this.config, createTableSql(input.plan));
                createdTarget = true;
            }
            await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: rowsWritten, pendingCommit: false });
            const reader = await input.dataset.openBatches({ batchSize: input.batchSize, signal: input.signal });
            for await (const batch of reader) {
                if (input.signal.aborted) throw abortError();
                const rows = batchRows(batch, columns).map(row => row.map((value, index) => d1ImportValue(value, columns[index]!.targetType)));
                const queries = buildD1InsertQueries(
                    input.plan.target,
                    columns.map(column => column.target),
                    rows,
                );
                if (!queries.length) continue;
                writeAttempted = true;
                const results = await executeCloudflareD1Batch(this.config, queries);
                const affected = results.reduce((total, result) => total + result.changes, 0);
                rowsWritten += affected || rows.length;
                batches += 1;
                await input.onProgress({ phase: 'writing', batches, rowsWritten, rowsCommitted: rowsWritten, pendingCommit: false });
            }
            return { insertedRows: rowsWritten, batches, atomicity: 'best-effort' as const };
        } catch (error) {
            if (createdTarget) {
                const cleaned = await executeCloudflareD1Query(this.config, `DROP TABLE IF EXISTS ${qualifiedName(input.plan.target)}`)
                    .then(() => true)
                    .catch(() => false);
                if (cleaned) {
                    await Promise.resolve(input.onProgress({ phase: 'writing', batches, rowsWritten: 0, rowsCommitted: 0, pendingCommit: false })).catch(() => undefined);
                    throw error;
                }
            }
            if (rowsWritten > 0 || createdTarget || ((createAttempted || writeAttempted) && isCommitOutcomeUnknown(error))) {
                throw new PartialWriteError(error instanceof Error ? error.message : String(error), rowsWritten, batches, true);
            }
            throw error;
        }
    }
}

export function buildD1InsertQueries(target: ImportTarget, columnNames: string[], rows: unknown[][]): CloudflareD1BatchQuery[] {
    const maxRows = Math.max(1, Math.floor(D1_PARAMETER_LIMIT / Math.max(1, columnNames.length)));
    const queries: CloudflareD1BatchQuery[] = [];
    let offset = 0;
    while (offset < rows.length) {
        let count = Math.min(maxRows, rows.length - offset);
        while (count > 0) {
            const selected = rows.slice(offset, offset + count);
            const sql = `INSERT INTO ${qualifiedName(target)} (${columnNames.map(quoteDouble).join(', ')}) VALUES ${selected
                .map(() => `(${columnNames.map(() => '?').join(', ')})`)
                .join(', ')}`;
            if (Buffer.byteLength(sql) <= D1_STATEMENT_LIMIT) {
                queries.push({ sql, params: selected.flat() });
                offset += count;
                break;
            }
            count = Math.floor(count / 2);
        }
        if (count === 0) throw new Error('A generated Cloudflare D1 insert statement exceeds the SQL size limit');
    }
    return queries;
}

function createTableSql(plan: ImportPlanV1) {
    return `CREATE TABLE ${qualifiedName(plan.target)} (${activeImportColumns(plan)
        .map(column => `${quoteDouble(column.target)} ${d1Type(column.targetType)}`)
        .join(', ')})`;
}

function qualifiedName(target: ImportTarget) {
    return `${quoteDouble(target.database?.trim() || 'main')}.${quoteDouble(target.table)}`;
}

function d1Type(type: ImportColumnType) {
    return { string: 'TEXT', boolean: 'INTEGER', int64: 'INTEGER', float64: 'REAL', date: 'TEXT', datetime: 'TEXT' }[type];
}

function d1ImportType(type: string): ImportColumnType {
    const normalized = type.toLocaleUpperCase();
    if (normalized.includes('BOOL')) return 'boolean';
    if (normalized.includes('DATE') && !normalized.includes('TIME')) return 'date';
    if (normalized.includes('TIME')) return 'datetime';
    if (normalized.includes('INT')) return 'int64';
    if (/REAL|FLOA|DOUB|NUM/.test(normalized)) return 'float64';
    return 'string';
}

export function d1ImportValue(value: unknown, type: ImportColumnType) {
    if (value === null) return null;
    if (type === 'boolean') return value ? 1 : 0;
    if (type === 'int64') return String(value);
    return value;
}
