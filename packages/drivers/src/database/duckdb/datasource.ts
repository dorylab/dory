import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult, TableUpdateBatch, TableUpdateResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { buildTableUpdateStatements, TableMutationConflictError } from '@dory/drivers/table-mutations';

import { createDuckDbMetadataCapability, type DuckDbMetadataAPI } from './capabilities/metadata';
import { createDuckDbTableInfoCapability } from './capabilities/table-info';
import { DuckDbDialect } from './dialect';
import { closeDuckDbConnection, executeDuckDbQuery, executeDuckDbQueryRowStream, openDuckDbConnection, pingDuckDb } from './runtime';

type DuckDbHandle = Awaited<ReturnType<typeof openDuckDbConnection>>;

export class DuckDbDatasource extends BaseConnection {
    readonly dialect = DuckDbDialect;

    private handle: DuckDbHandle | null = null;

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createDuckDbMetadataCapability(this);
        this.capabilities.tableInfo = createDuckDbTableInfoCapability(this);
        this.capabilities.tableMutations = {
            dialect: 'duckdb',
            commitUpdates: input => this.commitUpdates(input),
        };
    }

    protected async _init(): Promise<void> {
        this.handle = await openDuckDbConnection(this.config);
    }

    getHandle() {
        this.assertReady();
        if (!this.handle) {
            throw new Error('DuckDB connection is not initialized');
        }
        return this.handle;
    }

    async close(): Promise<void> {
        closeDuckDbConnection(this.handle);
        this.handle = null;
        this._initialized = false;
    }

    async ping(): Promise<HealthInfo & { version?: string }> {
        return pingDuckDb(this.getHandle());
    }

    async query<Row = any>(sql: string, params?: DriverQueryParams, _context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
        return executeDuckDbQuery<Row>(this.getHandle(), sql, params);
    }

    async queryWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<QueryResult<Row>> {
        return executeDuckDbQuery<Row>(this.getHandle(), sql, context?.params);
    }

    async queryRowsStreamWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<DriverQueryRowStream<Row>> {
        return executeDuckDbQueryRowStream<Row>(this.getHandle(), sql, context?.params);
    }

    async command(sql: string, params?: DriverQueryParams, _context?: ConnectionQueryContext): Promise<void> {
        await executeDuckDbQuery(this.getHandle(), sql, params);
    }

    private async commitUpdates(input: TableUpdateBatch): Promise<TableUpdateResult> {
        const statements = buildTableUpdateStatements('duckdb', input);
        const connection = this.getHandle().connection;

        try {
            await connection.run('BEGIN TRANSACTION');
            for (const statement of statements) {
                const reader = await connection.runAndReadAll(statement.sql, statement.params as any);
                if (reader.rowsChanged !== 1) {
                    throw new TableMutationConflictError(undefined, statement.rowIndex);
                }
            }
            await connection.run('COMMIT');
            return {
                updatedRows: statements.length,
                updatedCells: statements.reduce((total, statement) => total + statement.changedColumns.length, 0),
            };
        } catch (error) {
            await connection.run('ROLLBACK').catch(() => undefined);
            throw error;
        }
    }

    get metadata(): DuckDbMetadataAPI {
        return this.capabilities.metadata as DuckDbMetadataAPI;
    }
}
