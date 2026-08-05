import type { ClickHouseClient } from '@clickhouse/client';
import { BaseConnection, asyncIterableWithCleanup, onceAsync } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult, TableMutationValue, TableUpdateBatch, TableUpdateResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { TableMutationConflictError, TableMutationIdentityNotUniqueError, TableMutationPartialCommitError } from '@dory/drivers/table-mutations';
import { ClickhouseDialect } from './dialect';
import {
    cancelClickhouseQuery,
    createClickhouseClient,
    executeClickhouseCommand,
    executeClickhouseQuery,
    executeClickhouseQueryRowStream,
    isClickhouseTlsEnabled,
    pingClickhouse,
    resolveClickhouseHttpPort,
} from './runtime';
import { createClickhouseMetadataCapability, type ClickhouseMetadataAPI } from './capabilities/metadata';
import { createClickhouseQueryInsightsCapability } from './capabilities/insights';
import { createClickhouseTableInfoCapability } from './capabilities/table-info';
import { createClickhousePrivilegesCapability } from './capabilities/privileges';
import { ClickhouseImportWriter } from './import-writer';

export class ClickhouseDatasource extends BaseConnection {
    readonly dialect = ClickhouseDialect;
    private client: ClickHouseClient | null = null;

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createClickhouseMetadataCapability(this);
        this.capabilities.queryInsights = createClickhouseQueryInsightsCapability(this);
        this.capabilities.tableInfo = createClickhouseTableInfoCapability(this);
        this.capabilities.privileges = createClickhousePrivilegesCapability(this);
        this.capabilities.tableMutations = {
            dialect: 'clickhouse',
            atomicity: 'best-effort',
            commitUpdates: input => this.commitUpdates(input),
        };
        this.capabilities.dataWriter = new ClickhouseImportWriter(this);
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

    async withClient<T>(database: string | undefined, callback: (client: ClickHouseClient) => Promise<T>): Promise<T> {
        this.assertReady();
        const targetDb = database ?? this.config.database;
        if (!targetDb || targetDb === this.config.database) return callback(this.client!);
        const sshEndpoint = this.getSshEndpoint();
        const client = createClickhouseClient(this.config, {
            database: targetDb,
            hostOverride: sshEndpoint?.host,
            httpPortOverride: sshEndpoint?.port,
        });
        try {
            return await callback(client);
        } finally {
            await client.close().catch(() => undefined);
        }
    }

    async queryRowsStreamWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<DriverQueryRowStream<Row>> {
        this.assertReady();
        const targetDb = context?.database ?? this.config.database;

        if (!targetDb || targetDb === this.config.database) {
            return executeClickhouseQueryRowStream<Row>(this.client!, sql, context?.params, context);
        }

        const sshEndpoint = this.getSshEndpoint();
        const tempClient = createClickhouseClient(this.config, {
            database: targetDb,
            hostOverride: sshEndpoint?.host,
            httpPortOverride: sshEndpoint?.port,
        });

        try {
            const result = await executeClickhouseQueryRowStream<Row>(tempClient, sql, context?.params, context);
            const close = onceAsync(async () => {
                await result.close?.();
                await tempClient.close().catch(() => undefined);
            });
            return {
                ...result,
                rows: asyncIterableWithCleanup(result.rows, close),
                close,
            };
        } catch (error) {
            await tempClient.close().catch(() => undefined);
            throw error;
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

    private async commitUpdates(input: TableUpdateBatch): Promise<TableUpdateResult> {
        this.assertReady();
        const engineResult = await this.queryWithContext<{ engine?: string }>('SELECT engine FROM system.tables WHERE database = {db:String} AND name = {table:String} LIMIT 1', {
            database: input.database,
            params: { db: input.database, table: input.table.split('.').at(-1) ?? input.table },
        });
        if (!/MergeTree$/i.test(engineResult.rows[0]?.engine ?? '')) {
            throw new Error('This ClickHouse table engine does not support UPDATE mutations.');
        }
        const update = buildClickhouseUpdate(input);
        const preflight = await Promise.all(
            update.rows.map(async row => {
                const result = await this.queryWithContext<{ identityCount?: number | string; matchCount?: number | string }>(
                    `SELECT count() AS identityCount, countIf(${row.fullCondition}) AS matchCount FROM ${update.tableSql} WHERE ${row.identityCondition}`,
                    { database: input.database },
                );
                const values = result.rows[0];
                return {
                    identityCount: Number(values?.identityCount ?? 0),
                    matchCount: Number(values?.matchCount ?? 0),
                };
            }),
        );
        const nonUniqueIndex = preflight.findIndex(row => row.identityCount !== 1);
        if (nonUniqueIndex >= 0) {
            throw new TableMutationIdentityNotUniqueError(undefined, nonUniqueIndex);
        }
        const conflictIndex = preflight.findIndex(row => row.matchCount !== 1);
        if (conflictIndex >= 0) {
            throw new TableMutationConflictError(undefined, conflictIndex);
        }

        await this.command(update.sql);

        const verification = await Promise.all(
            update.rows.map(async row => {
                const result = await this.queryWithContext<{ appliedCount?: number | string }>(
                    `SELECT countIf(${row.finalCondition}) AS appliedCount FROM ${update.tableSql} WHERE ${row.identityCondition}`,
                    { database: input.database },
                );
                return Number(result.rows[0]?.appliedCount ?? 0) === 1;
            }),
        );
        const committedRowIndexes = verification.flatMap((verified, index) => (verified ? [index] : []));
        const pendingRowIndexes = verification.flatMap((verified, index) => (verified ? [] : [index]));
        if (pendingRowIndexes.length > 0) {
            if (committedRowIndexes.length === 0) {
                throw new TableMutationConflictError(undefined, pendingRowIndexes[0]);
            }
            throw new TableMutationPartialCommitError(committedRowIndexes, pendingRowIndexes);
        }

        return {
            updatedRows: input.rows.length,
            updatedCells: input.rows.reduce((total, row) => total + row.changes.length, 0),
            atomicity: 'best-effort',
        };
    }

    get metadata(): ClickhouseMetadataAPI {
        return this.capabilities.metadata as ClickhouseMetadataAPI;
    }
}

function quoteIdentifier(identifier: string) {
    return `\`${identifier.replaceAll('`', '``')}\``;
}

function formatLiteral(value: TableMutationValue): string {
    if (value === null) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function equals(column: string, value: TableMutationValue) {
    return value === null ? `isNull(${quoteIdentifier(column)})` : `${quoteIdentifier(column)} = ${formatLiteral(value)}`;
}

function buildClickhouseUpdate(input: TableUpdateBatch) {
    const tableSql = `${quoteIdentifier(input.database)}.${quoteIdentifier(input.table.split('.').at(-1) ?? input.table)}`;
    const rows = input.rows.map(row => {
        const identityCondition = input.identityColumns.map(column => equals(column, row.key[column]!)).join(' AND ');
        const originalCondition = row.changes.map(change => equals(change.column, change.originalValue)).join(' AND ');
        const finalCondition = [identityCondition, ...row.changes.map(change => equals(change.column, change.nextValue))].join(' AND ');
        return {
            identityCondition,
            fullCondition: [identityCondition, originalCondition].filter(Boolean).join(' AND '),
            finalCondition,
        };
    });
    const changedColumns = Array.from(new Set(input.rows.flatMap(row => row.changes.map(change => change.column))));
    const assignments = changedColumns.map(column => {
        const cases = input.rows.flatMap((row, rowIndex) => {
            const change = row.changes.find(item => item.column === column);
            return change ? [rows[rowIndex]!.fullCondition, formatLiteral(change.nextValue)] : [];
        });
        return `${quoteIdentifier(column)} = multiIf(${[...cases, quoteIdentifier(column)].join(', ')})`;
    });
    return {
        tableSql,
        rows,
        sql: `ALTER TABLE ${tableSql}\nUPDATE ${assignments.join(',\n    ')}\nWHERE ${rows.map(row => `(${row.fullCondition})`).join(' OR ')}\nSETTINGS mutations_sync = 1`,
    };
}
