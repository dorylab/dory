import type snowflake from 'snowflake-sdk';
import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult, TableUpdateBatch, TableUpdateResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { buildTableUpdateStatements, TableMutationConflictError } from '@dory/drivers/table-mutations';
import { createSnowflakeMetadataCapability, type SnowflakeMetadataAPI } from './capabilities/metadata';
import { createSnowflakeTableInfoCapability } from './capabilities/table-info';
import { SnowflakeDialect } from './dialect';
import {
    closeSnowflake,
    connectSnowflake,
    createSnowflakeConnection,
    executeSnowflakeCommand,
    executeSnowflakeQuery,
    executeSnowflakeQueryRowStream,
    pingSnowflake,
} from './runtime';

export class SnowflakeDatasource extends BaseConnection {
    readonly dialect = SnowflakeDialect;
    private connection: snowflake.Connection | null = null;
    private readonly runningQueries = new Map<string, snowflake.RowStatement>();

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createSnowflakeMetadataCapability(this);
        this.capabilities.tableInfo = createSnowflakeTableInfoCapability(this);
        this.capabilities.tableMutations = {
            dialect: 'snowflake',
            atomicity: 'atomic',
            commitUpdates: input => this.commitUpdates(input),
        };
    }

    protected async _init(): Promise<void> {
        this.connection = createSnowflakeConnection(this.config);
        await connectSnowflake(this.connection);
    }

    async close(): Promise<void> {
        const connection = this.connection;
        this.connection = null;
        this.runningQueries.clear();
        if (connection) {
            await closeSnowflake(connection).catch(() => undefined);
        }
        this._initialized = false;
    }

    async ping(): Promise<HealthInfo & { version?: string }> {
        this.assertReady();
        return pingSnowflake(this.connection!, this.config);
    }

    async query<Row = any>(sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
        this.assertReady();
        return executeSnowflakeQuery<Row>(this.connection!, this.config, sql, params, {
            context,
            trackQuery: statement => {
                if (context?.queryId) {
                    this.runningQueries.set(context.queryId, statement);
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
        return this.query<Row>(sql, context?.params, context);
    }

    async queryRowsStreamWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<DriverQueryRowStream<Row>> {
        this.assertReady();
        return executeSnowflakeQueryRowStream<Row>(this.connection!, this.config, sql, context?.params, {
            context,
            trackQuery: statement => {
                if (context?.queryId) {
                    this.runningQueries.set(context.queryId, statement);
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
        await executeSnowflakeCommand(this.connection!, this.config, sql, params, context);
    }

    private async commitUpdates(input: TableUpdateBatch): Promise<TableUpdateResult> {
        this.assertReady();
        const schema = typeof this.config.options?.schema === 'string' && this.config.options.schema.trim() ? this.config.options.schema.trim() : 'PUBLIC';
        const normalizedInput = input.table.includes('.') ? input : { ...input, table: `${schema}.${input.table}` };
        const statements = buildTableUpdateStatements('snowflake', normalizedInput);

        await executeSnowflakeQuery(this.connection!, this.config, 'BEGIN TRANSACTION');
        try {
            for (const statement of statements) {
                const result = await executeSnowflakeQuery(this.connection!, this.config, statement.sql, statement.params);
                if (result.rowCount !== 1) {
                    throw new TableMutationConflictError(undefined, statement.rowIndex);
                }
            }
            await executeSnowflakeQuery(this.connection!, this.config, 'COMMIT');
            return {
                updatedRows: statements.length,
                updatedCells: statements.reduce((total, statement) => total + statement.changedColumns.length, 0),
                atomicity: 'atomic',
            };
        } catch (error) {
            await executeSnowflakeQuery(this.connection!, this.config, 'ROLLBACK').catch(() => undefined);
            throw error;
        }
    }

    async cancelQuery(queryId: string): Promise<void> {
        this.assertReady();
        const statement = this.runningQueries.get(queryId);
        if (!statement) return;
        await new Promise<void>((resolve, reject) => {
            statement.cancel(err => {
                this.runningQueries.delete(queryId);
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    get metadata(): SnowflakeMetadataAPI {
        return this.capabilities.metadata as SnowflakeMetadataAPI;
    }
}
