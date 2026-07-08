import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { SqliteDialect } from './dialect';
import { createSqliteMetadataCapability, type SqliteMetadataAPI } from './capabilities/metadata';
import { createSqliteTableInfoCapability } from './capabilities/table-info';
import { executeSqliteQuery, executeSqliteQueryRowStream, openSqliteDatabase, pingSqlite } from './runtime';

export class SqliteDatasource extends BaseConnection {
    readonly dialect = SqliteDialect;

    private database: ReturnType<typeof openSqliteDatabase> | null = null;

    constructor(config: BaseConnection['config']) {
        super(config);
        this.capabilities.metadata = createSqliteMetadataCapability(this);
        this.capabilities.tableInfo = createSqliteTableInfoCapability(this);
    }

    protected async _init(): Promise<void> {
        this.database = openSqliteDatabase(this.config);
    }

    getDatabase() {
        this.assertReady();
        if (!this.database) {
            throw new Error('SQLite database is not initialized');
        }
        return this.database;
    }

    async close(): Promise<void> {
        if (this.database?.open) {
            this.database.close();
        }
        this.database = null;
        this._initialized = false;
    }

    async ping(): Promise<HealthInfo & { version?: string }> {
        return pingSqlite(this.getDatabase());
    }

    async query<Row = any>(sql: string, params?: DriverQueryParams, _context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
        return executeSqliteQuery<Row>(this.getDatabase(), sql, params);
    }

    async queryWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<QueryResult<Row>> {
        return executeSqliteQuery<Row>(this.getDatabase(), sql, context?.params);
    }

    async queryRowsStreamWithContext<Row = any>(sql: string, context?: ConnectionQueryContext & { params?: DriverQueryParams }): Promise<DriverQueryRowStream<Row>> {
        return executeSqliteQueryRowStream<Row>(this.getDatabase(), sql, context?.params);
    }

    async command(sql: string, params?: DriverQueryParams, _context?: ConnectionQueryContext): Promise<void> {
        executeSqliteQuery(this.getDatabase(), sql, params);
    }

    get metadata(): SqliteMetadataAPI {
        return this.capabilities.metadata as SqliteMetadataAPI;
    }
}
