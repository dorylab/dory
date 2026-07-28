import type { Pool, ResultSetHeader } from 'mysql2/promise';
import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult, TableUpdateBatch, TableUpdateResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { isTlsNegotiationError, isTlsPreferMode, withTlsDisabledOptions } from '@dory/drivers/core/tls';
import { buildTableUpdateStatements, TableMutationConflictError } from '@dory/drivers/table-mutations';
import { createMysqlMetadataCapability, type MysqlMetadataAPI } from './capabilities/metadata';
import { createMysqlTableInfoCapability } from './capabilities/table-info';
import { MySqlDialect } from './dialect';
import { cancelMySqlQuery, createMySqlPool, executeMySqlCommand, executeMySqlQuery, executeMySqlQueryRowStream, pingMySql, resolveMysqlPort } from './runtime';

export class MySqlDatasource extends BaseConnection {
    readonly dialect = MySqlDialect;

    private primaryPool: Pool | null = null;
    private readonly pools = new Map<string, Pool>();
    private readonly runningQueries = new Map<string, { threadId: number; database?: string }>();

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createMysqlMetadataCapability(this);
        this.capabilities.tableInfo = createMysqlTableInfoCapability(this);
        this.capabilities.tableMutations = {
            dialect: 'mysql',
            commitUpdates: input => this.commitUpdates(input),
        };
    }

    protected async _init(): Promise<void> {
        await this.setupSshIfNeeded(resolveMysqlPort(this.config));
        try {
            const pool = this.getOrCreatePool(this.config.database);
            this.primaryPool = pool;
            const connection = await pool.getConnection();
            connection.release();
        } catch (error) {
            if (!isTlsPreferMode(this.config.options) || !isTlsNegotiationError(error)) {
                throw error;
            }
            await this.close();
            (this.config as any).options = withTlsDisabledOptions(this.config).options;
            await this.setupSshIfNeeded(resolveMysqlPort(this.config));
            const pool = this.getOrCreatePool(this.config.database);
            this.primaryPool = pool;
            const connection = await pool.getConnection();
            connection.release();
        }
    }

    private getPoolKey(database?: string | null) {
        return database?.trim() || this.config.database?.trim() || '__default__';
    }

    private getOrCreatePool(database?: string | null): Pool {
        const key = this.getPoolKey(database);
        const existing = this.pools.get(key);
        if (existing) {
            return existing;
        }

        const sshEndpoint = this.getSshEndpoint();
        const pool = createMySqlPool(
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

    private resolvePool(database?: string | null): Pool {
        return this.getOrCreatePool(database);
    }

    async close(): Promise<void> {
        const pools = Array.from(this.pools.values());
        this.pools.clear();
        this.primaryPool = null;
        this.runningQueries.clear();
        await Promise.all(pools.map(pool => pool.end().catch(() => undefined)));
        await this.teardownSsh();
        this._initialized = false;
    }

    async ping(): Promise<HealthInfo & { version?: string }> {
        this.assertReady();
        return pingMySql(this.primaryPool ?? this.resolvePool(this.config.database));
    }

    async query<Row = any>(sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
        this.assertReady();
        const pool = this.resolvePool(this.config.database);
        return executeMySqlQuery<Row>(pool, this.config, sql, params, {
            context,
            trackQuery: threadId => {
                if (context?.queryId) {
                    this.runningQueries.set(context.queryId, {
                        threadId,
                        database: this.config.database ?? undefined,
                    });
                }
            },
            untrackQuery: () => {
                if (context?.queryId) {
                    this.runningQueries.delete(context.queryId);
                }
            },
        });
    }

    async queryWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<QueryResult<Row>> {
        this.assertReady();
        const targetDatabase = context?.database ?? this.config.database;
        const pool = this.resolvePool(targetDatabase);

        return executeMySqlQuery<Row>(pool, this.config, sql, context?.params, {
            context,
            trackQuery: threadId => {
                if (context?.queryId) {
                    this.runningQueries.set(context.queryId, {
                        threadId,
                        database: targetDatabase ?? undefined,
                    });
                }
            },
            untrackQuery: () => {
                if (context?.queryId) {
                    this.runningQueries.delete(context.queryId);
                }
            },
        });
    }

    async queryRowsStreamWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<DriverQueryRowStream<Row>> {
        this.assertReady();
        const targetDatabase = context?.database ?? this.config.database;
        const pool = this.resolvePool(targetDatabase);

        return executeMySqlQueryRowStream<Row>(pool, this.config, sql, context?.params, {
            context,
            trackQuery: threadId => {
                if (context?.queryId) {
                    this.runningQueries.set(context.queryId, {
                        threadId,
                        database: targetDatabase ?? undefined,
                    });
                }
            },
            untrackQuery: () => {
                if (context?.queryId) {
                    this.runningQueries.delete(context.queryId);
                }
            },
        });
    }

    async command(sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<void> {
        this.assertReady();
        const targetDatabase = context?.database ?? this.config.database;
        const pool = this.resolvePool(targetDatabase);
        await executeMySqlCommand(pool, this.config, sql, params, context);
    }

    private async commitUpdates(input: TableUpdateBatch): Promise<TableUpdateResult> {
        this.assertReady();
        const statements = buildTableUpdateStatements('mysql', input);
        const pool = this.resolvePool(input.database);
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();
            for (const statement of statements) {
                const [result] = await connection.query(statement.sql, statement.params);
                const affectedRows = (result as ResultSetHeader).affectedRows;
                if (affectedRows !== 1) {
                    throw new TableMutationConflictError(undefined, statement.rowIndex);
                }
            }
            await connection.commit();
            return {
                updatedRows: statements.length,
                updatedCells: statements.reduce((total, statement) => total + statement.changedColumns.length, 0),
            };
        } catch (error) {
            await connection.rollback().catch(() => undefined);
            throw error;
        } finally {
            connection.release();
        }
    }

    async cancelQuery(queryId: string): Promise<void> {
        this.assertReady();
        const running = this.runningQueries.get(queryId);
        if (!running) {
            return;
        }

        const pool = this.resolvePool(running.database);
        await cancelMySqlQuery(pool, running.threadId);
    }

    get metadata(): MysqlMetadataAPI {
        return this.capabilities.metadata as MysqlMetadataAPI;
    }
}
