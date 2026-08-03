import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult, TableUpdateBatch, TableUpdateResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { TableMutationConflictError } from '@dory/drivers/table-mutations';
import { CloudflareD1Dialect } from './dialect';
import { createCloudflareD1MetadataCapability, type CloudflareD1MetadataAPI } from './capabilities/metadata';
import { createCloudflareD1TableInfoCapability } from './capabilities/table-info';
import { executeCloudflareD1Query, executeCloudflareD1QueryRowStream, pingCloudflareD1 } from './runtime';

export class CloudflareD1Datasource extends BaseConnection {
    readonly dialect = CloudflareD1Dialect;

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createCloudflareD1MetadataCapability(this);
        this.capabilities.tableInfo = createCloudflareD1TableInfoCapability(this);
        this.capabilities.tableMutations = {
            dialect: 'sqlite',
            atomicity: 'atomic',
            commitUpdates: input => this.commitUpdates(input),
        };
    }

    protected async _init(): Promise<void> {
        this._initialized = true;
    }

    async close(): Promise<void> {
        this._initialized = false;
    }

    async ping(): Promise<HealthInfo> {
        this.assertReady();
        return pingCloudflareD1(this.config);
    }

    async query<Row = any>(sql: string, params?: DriverQueryParams, _context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
        this.assertReady();
        return executeCloudflareD1Query<Row>(this.config, sql, params);
    }

    async queryWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<QueryResult<Row>> {
        this.assertReady();
        return executeCloudflareD1Query<Row>(this.config, sql, context?.params);
    }

    async queryRowsStreamWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<DriverQueryRowStream<Row>> {
        this.assertReady();
        return executeCloudflareD1QueryRowStream<Row>(this.config, sql, context?.params);
    }

    async command(sql: string, params?: DriverQueryParams, _context?: ConnectionQueryContext): Promise<void> {
        this.assertReady();
        await executeCloudflareD1Query(this.config, sql, params);
    }

    private async commitUpdates(input: TableUpdateBatch): Promise<TableUpdateResult> {
        this.assertReady();
        const statement = buildCloudflareD1AtomicUpdate(input);
        const result = await executeCloudflareD1Query(this.config, statement.sql, [statement.payload]);
        if (result.rowCount !== input.rows.length) {
            throw new TableMutationConflictError();
        }
        return {
            updatedRows: input.rows.length,
            updatedCells: input.rows.reduce((total, row) => total + row.changes.length, 0),
            atomicity: 'atomic',
        };
    }

    get metadata(): CloudflareD1MetadataAPI {
        return this.capabilities.metadata as CloudflareD1MetadataAPI;
    }
}

function quoteIdentifier(identifier: string) {
    return `"${identifier.replaceAll('"', '""')}"`;
}

function jsonPath(section: 'key' | 'changes', column: string, value?: 'originalValue' | 'nextValue') {
    const quotedColumn = column.replaceAll('"', '\\"');
    return `$.${section}."${quotedColumn}"${value ? `.${value}` : ''}`;
}

function sqlString(value: string) {
    return `'${value.replaceAll("'", "''")}'`;
}

function jsonValue(rowIndex: number, path: string) {
    return `(SELECT json_extract(edit, ${sqlString(path)}) FROM edits WHERE edit_index = ${rowIndex})`;
}

function nullSafeEquals(column: string, valueSql: string) {
    return `${quoteIdentifier(column)} IS ${valueSql}`;
}

export function buildCloudflareD1AtomicUpdate(input: TableUpdateBatch) {
    const tableSql = `${quoteIdentifier(input.database || 'main')}.${quoteIdentifier(input.table.split('.').at(-1) ?? input.table)}`;
    const payload = JSON.stringify(
        input.rows.map(row => ({
            key: row.key,
            changes: Object.fromEntries(row.changes.map(change => [change.column, { originalValue: change.originalValue, nextValue: change.nextValue }])),
        })),
    );
    const changedColumns = Array.from(new Set(input.rows.flatMap(row => row.changes.map(change => change.column))));
    const identityConditions = input.rows.map((row, rowIndex) =>
        input.identityColumns.map(column => nullSafeEquals(column, jsonValue(rowIndex, jsonPath('key', column)))).join(' AND '),
    );
    const fullConditions = input.rows.map((row, rowIndex) => {
        const originalConditions = row.changes.map(change => nullSafeEquals(change.column, jsonValue(rowIndex, jsonPath('changes', change.column, 'originalValue'))));
        return [identityConditions[rowIndex], ...originalConditions].filter(Boolean).join(' AND ');
    });
    const assignments = changedColumns.map(column => {
        const cases = input.rows.flatMap((row, rowIndex) =>
            row.changes.some(change => change.column === column)
                ? [`WHEN ${identityConditions[rowIndex]} THEN ${jsonValue(rowIndex, jsonPath('changes', column, 'nextValue'))}`]
                : [],
        );
        return `${quoteIdentifier(column)} = CASE ${cases.join(' ')} ELSE ${quoteIdentifier(column)} END`;
    });
    const guards = input.rows.flatMap((row, rowIndex) => [
        `(SELECT COUNT(*) FROM ${tableSql} WHERE ${identityConditions[rowIndex]}) = 1`,
        `(SELECT COUNT(*) FROM ${tableSql} WHERE ${fullConditions[rowIndex]}) = 1`,
    ]);

    return {
        payload,
        sql: `WITH edits AS (\n    SELECT CAST(key AS INTEGER) AS edit_index, value AS edit\n    FROM json_each(?1)\n)\nUPDATE ${tableSql}\nSET ${assignments.join(',\n    ')}\nWHERE (${fullConditions.map(condition => `(${condition})`).join(' OR ')})\n  AND ${guards.join('\n  AND ')}`,
    };
}
