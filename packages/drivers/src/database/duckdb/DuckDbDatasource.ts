import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, HealthInfo, QueryResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';

import { createDuckDbMetadataCapability, type DuckDbMetadataAPI } from './capabilities/metadata';
import { createDuckDbTableInfoCapability } from './capabilities/table-info';
import { DuckDbDialect } from './dialect';
import { closeDuckDbConnection, executeDuckDbQuery, openDuckDbConnection, pingDuckDb } from './duckdb-driver';

type DuckDbHandle = Awaited<ReturnType<typeof openDuckDbConnection>>;

export class DuckDbDatasource extends BaseConnection {
    readonly dialect = DuckDbDialect;

    private handle: DuckDbHandle | null = null;

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createDuckDbMetadataCapability(this);
        this.capabilities.tableInfo = createDuckDbTableInfoCapability(this);
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

    async command(sql: string, params?: DriverQueryParams, _context?: ConnectionQueryContext): Promise<void> {
        await executeDuckDbQuery(this.getHandle(), sql, params);
    }

    get metadata(): DuckDbMetadataAPI {
        return this.capabilities.metadata as DuckDbMetadataAPI;
    }
}
