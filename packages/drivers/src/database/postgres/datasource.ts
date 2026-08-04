import type { Pool } from 'pg';
import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult, TableUpdateBatch, TableUpdateResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { isTlsNegotiationError, isTlsPreferMode, withTlsDisabledOptions } from '@dory/drivers/core/tls';
import { buildTableUpdateStatements, TableMutationConflictError } from '@dory/drivers/table-mutations';
import { createPostgresMetadataCapability, type PostgresMetadataAPI } from './capabilities/metadata';
import { createPostgresTableInfoCapability } from './capabilities/table-info';
import { PostgresDialect } from './dialect';
import { PostgresImportWriter } from './import-writer';
import { createPostgresPool, executePostgresCommand, executePostgresQuery, executePostgresQueryRowStream, pingPostgres, resolvePostgresPort } from './runtime';

export class PostgresDatasource extends BaseConnection {
    readonly dialect = PostgresDialect;

    private primaryPool: Pool | null = null;
    private readonly pools = new Map<string, Pool>();
    private readonly runningQueries = new Map<string, { pid: number; database: string }>();

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createPostgresMetadataCapability(this);
        this.capabilities.tableInfo = createPostgresTableInfoCapability(this);
        this.capabilities.tableMutations = {
            dialect: 'postgres',
            atomicity: 'atomic',
            commitUpdates: input => this.commitUpdates(input),
        };
        this.capabilities.dataWriter = new PostgresImportWriter(database => this.resolvePool(database));
    }

    protected async _init(): Promise<void> {
        await this.setupSshIfNeeded(resolvePostgresPort(this.config));
        try {
            const pool = this.getOrCreatePool(this.config.database);
            this.primaryPool = pool;
            const client = await pool.connect();
            client.release();
        } catch (error) {
            if (!isTlsPreferMode(this.config.options) || !isTlsNegotiationError(error)) {
                throw error;
            }
            await this.close();
            (this.config as any).options = withTlsDisabledOptions(this.config).options;
            await this.setupSshIfNeeded(resolvePostgresPort(this.config));
            const pool = this.getOrCreatePool(this.config.database);
            this.primaryPool = pool;
            const client = await pool.connect();
            client.release();
        }
    }

    private getOrCreatePool(database?: string | null): Pool {
        const key = database?.trim() || this.config.database?.trim() || 'postgres';
        const existing = this.pools.get(key);
        if (existing) {
            return existing;
        }

        const sshEndpoint = this.getSshEndpoint();
        const pool = createPostgresPool(
            this.config,
            key,
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
        return pingPostgres(this.primaryPool ?? this.resolvePool(this.config.database));
    }

    async query<Row = any>(sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
        this.assertReady();
        const pool = this.resolvePool(this.config.database);
        return executePostgresQuery<Row>(pool, this.config, sql, params, {
            context,
            trackQuery: pid => {
                if (context?.queryId) {
                    this.runningQueries.set(context.queryId, {
                        pid,
                        database: this.config.database ?? 'postgres',
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

        return executePostgresQuery<Row>(pool, this.config, sql, context?.params, {
            context,
            trackQuery: pid => {
                if (context?.queryId) {
                    this.runningQueries.set(context.queryId, {
                        pid,
                        database: targetDatabase ?? this.config.database ?? 'postgres',
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

        return executePostgresQueryRowStream<Row>(pool, this.config, sql, context?.params, {
            context,
            trackQuery: pid => {
                if (context?.queryId) {
                    this.runningQueries.set(context.queryId, {
                        pid,
                        database: targetDatabase ?? this.config.database ?? 'postgres',
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
        await executePostgresCommand(pool, this.config, sql, params, context);
    }

    private async commitUpdates(input: TableUpdateBatch): Promise<TableUpdateResult> {
        this.assertReady();
        const statements = buildTableUpdateStatements('postgres', input);
        const pool = this.resolvePool(input.database);
        const client = await pool.connect();

        try {
            await client.query('BEGIN');
            for (const statement of statements) {
                const result = await client.query(statement.sql, statement.params);
                if (result.rowCount !== 1) {
                    throw new TableMutationConflictError(undefined, statement.rowIndex);
                }
            }
            await client.query('COMMIT');
            return {
                updatedRows: statements.length,
                updatedCells: statements.reduce((total, statement) => total + statement.changedColumns.length, 0),
                atomicity: 'atomic',
            };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
    }

    async cancelQuery(queryId: string): Promise<void> {
        this.assertReady();
        const running = this.runningQueries.get(queryId);
        if (!running) {
            return;
        }

        const pool = this.resolvePool(running.database);
        await pool.query('SELECT pg_cancel_backend($1)', [running.pid]);
    }

    get metadata(): PostgresMetadataAPI {
        return this.capabilities.metadata as PostgresMetadataAPI;
    }
}
