import type { BindParameters, Pool } from 'oracledb';
import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult, TableUpdateBatch, TableUpdateResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { bindTableMutationParams, buildTableUpdateStatements, TableMutationConflictError } from '@dory/drivers/table-mutations';
import { createOracleMetadataCapability, type OracleMetadataAPI } from './capabilities/metadata';
import { createOracleTableInfoCapability } from './capabilities/table-info';
import { OracleDialect } from './dialect';
import { createOraclePool, executeOracleCommand, executeOracleQuery, executeOracleQueryRowStream, pingOracle, resolveOraclePort, resolveOracleServiceName } from './runtime';

export class OracleDatasource extends BaseConnection {
    readonly dialect = OracleDialect;

    private primaryPool: Pool | null = null;
    private readonly pools = new Map<string, Pool>();

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createOracleMetadataCapability(this);
        this.capabilities.tableInfo = createOracleTableInfoCapability(this);
        this.capabilities.tableMutations = {
            dialect: 'oracle',
            atomicity: 'atomic',
            commitUpdates: input => this.commitUpdates(input),
        };
    }

    protected async _init(): Promise<void> {
        await this.setupSshIfNeeded(resolveOraclePort(this.config));
        const pool = await this.getOrCreatePool(resolveOracleServiceName(this.config));
        this.primaryPool = pool;
    }

    private getPoolKey(serviceName?: string | null) {
        return serviceName?.trim() || resolveOracleServiceName(this.config) || '__default__';
    }

    private async getOrCreatePool(serviceName?: string | null): Promise<Pool> {
        const key = this.getPoolKey(serviceName);
        const existing = this.pools.get(key);
        if (existing) return existing;

        const sshEndpoint = this.getSshEndpoint();
        const pool = await createOraclePool(
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

    private resolvePool(serviceName?: string | null): Promise<Pool> {
        return this.getOrCreatePool(serviceName);
    }

    async close(): Promise<void> {
        const pools = Array.from(this.pools.values());
        this.pools.clear();
        this.primaryPool = null;
        await Promise.all(pools.map(pool => pool.close(0).catch(() => undefined)));
        await this.teardownSsh();
        this._initialized = false;
    }

    async ping(): Promise<HealthInfo & { version?: string }> {
        this.assertReady();
        return pingOracle(this.primaryPool ?? (await this.resolvePool(resolveOracleServiceName(this.config))));
    }

    async query<Row = any>(sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
        this.assertReady();
        const pool = await this.resolvePool(resolveOracleServiceName(this.config));
        return executeOracleQuery<Row>(pool, sql, params, { context });
    }

    async queryWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<QueryResult<Row>> {
        this.assertReady();
        const targetService = context?.database ?? resolveOracleServiceName(this.config);
        const pool = await this.resolvePool(targetService);
        return executeOracleQuery<Row>(pool, sql, context?.params, { context });
    }

    async queryRowsStreamWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<DriverQueryRowStream<Row>> {
        this.assertReady();
        const targetService = context?.database ?? resolveOracleServiceName(this.config);
        const pool = await this.resolvePool(targetService);
        return executeOracleQueryRowStream<Row>(pool, sql, context?.params, { context });
    }

    async command(sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<void> {
        this.assertReady();
        const targetService = context?.database ?? resolveOracleServiceName(this.config);
        const pool = await this.resolvePool(targetService);
        await executeOracleCommand(pool, sql, params, context);
    }

    private async commitUpdates(input: TableUpdateBatch): Promise<TableUpdateResult> {
        this.assertReady();
        const statements = buildTableUpdateStatements('oracle', input);
        const pool = await this.resolvePool(input.database);
        const connection = await pool.getConnection();

        try {
            for (const statement of statements) {
                const bindParams = bindTableMutationParams('oracle', statement.params) as BindParameters;
                const result = await connection.execute(statement.sql, bindParams, { autoCommit: false });
                if (result.rowsAffected !== 1) {
                    throw new TableMutationConflictError(undefined, statement.rowIndex);
                }
            }
            await connection.commit();
            return {
                updatedRows: statements.length,
                updatedCells: statements.reduce((total, statement) => total + statement.changedColumns.length, 0),
                atomicity: 'atomic',
            };
        } catch (error) {
            await connection.rollback().catch(() => undefined);
            throw error;
        } finally {
            await connection.close();
        }
    }

    get metadata(): OracleMetadataAPI {
        return this.capabilities.metadata as OracleMetadataAPI;
    }
}
