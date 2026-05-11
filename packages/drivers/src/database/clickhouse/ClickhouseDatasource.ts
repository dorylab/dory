import type { ClickHouseClient } from '@clickhouse/client';
import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, HealthInfo, QueryResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { ClickhouseDialect } from './dialect';
import {
    cancelClickhouseQuery,
    createClickhouseClient,
    executeClickhouseCommand,
    executeClickhouseQuery,
    isClickhouseTlsEnabled,
    pingClickhouse,
    resolveClickhouseHttpPort,
} from './clickhouse-driver';
import { createClickhouseMetadataCapability, type ClickhouseMetadataAPI } from './capabilities/metadata';
import { createClickhouseQueryInsightsCapability } from './capabilities/insights';
import { createClickhouseTableInfoCapability } from './capabilities/table-info';
import { createClickhousePrivilegesCapability } from './capabilities/privileges';

export class ClickhouseDatasource extends BaseConnection {
    readonly dialect = ClickhouseDialect;
    private client: ClickHouseClient | null = null;

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createClickhouseMetadataCapability(this);
        this.capabilities.queryInsights = createClickhouseQueryInsightsCapability(this);
        this.capabilities.tableInfo = createClickhouseTableInfoCapability(this);
        this.capabilities.privileges = createClickhousePrivilegesCapability(this);
    }

    protected async _init(): Promise<void> {
        const targetPort = resolveClickhouseHttpPort(this.config) ?? (isClickhouseTlsEnabled(this.config) ? 8443 : 8123);
        await this.setupSshIfNeeded(targetPort);
        const sshEndpoint = this.getSshEndpoint();
        this.client = createClickhouseClient(this.config, {
            hostOverride: sshEndpoint?.host,
            httpPortOverride: sshEndpoint?.port,
        });
        await this.client.ping();
    }

    async close(): Promise<void> {
        if (this.client) {
            await this.client.close().catch(() => undefined);
            this.client = null;
        }
        await this.teardownSsh();
        this._initialized = false;
    }

    async ping(): Promise<HealthInfo & { version?: string }> {
        this.assertReady();
        return pingClickhouse(this.client!);
    }

    async query<Row = any>(sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
        this.assertReady();
        return executeClickhouseQuery<Row>(this.client!, sql, params, context);
    }

    async queryWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<QueryResult<Row>> {
        const targetDb = context?.database ?? this.config.database;

        if (!targetDb || targetDb === this.config.database) {
            return this.query<Row>(sql, context?.params, context);
        }

        const sshEndpoint = this.getSshEndpoint();
        const tempClient = createClickhouseClient(this.config, {
            database: targetDb,
            hostOverride: sshEndpoint?.host,
            httpPortOverride: sshEndpoint?.port,
        });

        try {
            return await executeClickhouseQuery<Row>(tempClient, sql, context?.params, context);
        } finally {
            await tempClient.close().catch(() => undefined);
        }
    }

    async command(sql: string, params?: DriverQueryParams): Promise<void> {
        this.assertReady();
        await executeClickhouseCommand(this.client!, sql, params);
    }

    async cancelQuery(queryId: string): Promise<void> {
        this.assertReady();
        await cancelClickhouseQuery(this.client!, queryId);
    }

    get metadata(): ClickhouseMetadataAPI {
        return this.capabilities.metadata as ClickhouseMetadataAPI;
    }
}
