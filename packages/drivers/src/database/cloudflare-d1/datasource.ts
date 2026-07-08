import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
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

    get metadata(): CloudflareD1MetadataAPI {
        return this.capabilities.metadata as CloudflareD1MetadataAPI;
    }
}
