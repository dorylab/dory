import sql, { type ConnectionPool, type Request } from 'mssql';
import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult, TableUpdateBatch, TableUpdateResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { bindTableMutationParams, buildTableUpdateStatements, TableMutationConflictError } from '@dory/drivers/table-mutations';
import { createSqlServerMetadataCapability, type SqlServerMetadataAPI } from './capabilities/metadata';
import { createSqlServerTableInfoCapability } from './capabilities/table-info';
import { SqlServerDialect } from './dialect';
import { createSqlServerPool, executeSqlServerCommand, executeSqlServerQuery, executeSqlServerQueryRowStream, pingSqlServer, resolveSqlServerPort } from './runtime';

export class SqlServerDatasource extends BaseConnection {
    readonly dialect = SqlServerDialect;

    private primaryPool: ConnectionPool | null = null;
    private readonly pools = new Map<string, ConnectionPool>();
    private readonly runningQueries = new Map<string, Request>();

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createSqlServerMetadataCapability(this);
        this.capabilities.tableInfo = createSqlServerTableInfoCapability(this);
        this.capabilities.tableMutations = {
            dialect: 'sqlserver',
            atomicity: 'atomic',
            commitUpdates: input => this.commitUpdates(input),
        };
    }

    protected async _init(): Promise<void> {
        await this.setupSshIfNeeded(resolveSqlServerPort(this.config));
        const pool = await this.getOrCreatePool(this.config.database);
        this.primaryPool = pool;
    }

    private getPoolKey(database?: string | null) {
        return database?.trim() || this.config.database?.trim() || '__default__';
    }

    private async getOrCreatePool(database?: string | null): Promise<ConnectionPool> {
        const key = this.getPoolKey(database);
        const existing = this.pools.get(key);
        if (existing) return existing;

        const sshEndpoint = this.getSshEndpoint();
        const pool = await createSqlServerPool(
            this.config,
            key === '__default__' ? undefined : key,
            sshEndpoint
                ? {
                      host: sshEndpoint.host,
                      port: sshEndpoint.port,
                  }
                : undefined,
        );
        this.pools.set(key, pool);
        return pool;
    }

    private resolvePool(database?: string | null): Promise<ConnectionPool> {
        return this.getOrCreatePool(database);
    }

    async close(): Promise<void> {
        const pools = Array.from(this.pools.values());
        this.pools.clear();
        this.primaryPool = null;
        this.runningQueries.clear();
        await Promise.all(pools.map(pool => pool.close().catch(() => undefined)));
        await this.teardownSsh();
        this._initialized = false;
    }

    async ping(): Promise<HealthInfo & { version?: string }> {
        this.assertReady();
        return pingSqlServer(this.primaryPool ?? (await this.resolvePool(this.config.database)));
    }

    async query<Row = any>(sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
        this.assertReady();
        const pool = await this.resolvePool(this.config.database);
        return executeSqlServerQuery<Row>(pool, sql, params, {
            context,
            trackQuery: request => {
                if (context?.queryId) this.runningQueries.set(context.queryId, request);
            },
            untrackQuery: () => {
                if (context?.queryId) this.runningQueries.delete(context.queryId);
            },
        });
    }

    async queryWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<QueryResult<Row>> {
        this.assertReady();
        const targetDatabase = context?.database ?? this.config.database;
        const pool = await this.resolvePool(targetDatabase);
        return executeSqlServerQuery<Row>(pool, sql, context?.params, {
            context,
            trackQuery: request => {
                if (context?.queryId) this.runningQueries.set(context.queryId, request);
            },
            untrackQuery: () => {
                if (context?.queryId) this.runningQueries.delete(context.queryId);
            },
        });
    }

    async queryRowsStreamWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<DriverQueryRowStream<Row>> {
        this.assertReady();
        const targetDatabase = context?.database ?? this.config.database;
        const pool = await this.resolvePool(targetDatabase);
        return executeSqlServerQueryRowStream<Row>(pool, sql, context?.params, {
            context,
            trackQuery: request => {
                if (context?.queryId) this.runningQueries.set(context.queryId, request);
            },
            untrackQuery: () => {
                if (context?.queryId) this.runningQueries.delete(context.queryId);
            },
        });
    }

    async command(sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<void> {
        this.assertReady();
        const pool = await this.resolvePool(context?.database ?? this.config.database);
        await executeSqlServerCommand(pool, sql, params, context);
    }

    private async commitUpdates(input: TableUpdateBatch): Promise<TableUpdateResult> {
        this.assertReady();
        const statements = buildTableUpdateStatements('sqlserver', input);
        const pool = await this.resolvePool(input.database);
        const transaction = new sql.Transaction(pool);
        await executeSqlServerUpdateTransaction(statements, transaction, () => new sql.Request(transaction));
        return {
            updatedRows: statements.length,
            updatedCells: statements.reduce((total, statement) => total + statement.changedColumns.length, 0),
            atomicity: 'atomic',
        };
    }

    async cancelQuery(queryId: string): Promise<void> {
        this.assertReady();
        this.runningQueries.get(queryId)?.cancel();
    }

    get metadata(): SqlServerMetadataAPI {
        return this.capabilities.metadata as SqlServerMetadataAPI;
    }
}

type SqlServerUpdateStatement = ReturnType<typeof buildTableUpdateStatements>[number];

export async function executeSqlServerUpdateTransaction(
    statements: SqlServerUpdateStatement[],
    transaction: { begin: () => Promise<unknown>; commit: () => Promise<unknown>; rollback: () => Promise<unknown> },
    createRequest: () => { input: (name: string, value: unknown) => unknown; query: (sql: string) => Promise<{ rowsAffected?: number[] }> },
) {
    await transaction.begin();
    try {
        for (const statement of statements) {
            const request = createRequest();
            const params = bindTableMutationParams('sqlserver', statement.params) as Record<string, unknown>;
            for (const [name, value] of Object.entries(params)) {
                request.input(name, value);
            }
            const result = await request.query(statement.sql);
            const affectedRows = result.rowsAffected?.reduce((total, count) => total + count, 0) ?? 0;
            if (affectedRows !== 1) {
                throw new TableMutationConflictError(undefined, statement.rowIndex);
            }
        }
        await transaction.commit();
    } catch (error) {
        await transaction.rollback().catch(() => undefined);
        throw error;
    }
}
