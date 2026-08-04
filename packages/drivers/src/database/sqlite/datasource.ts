import { BaseConnection } from '@dory/drivers/core';
import type { ConnectionQueryContext, DriverQueryRowStream, HealthInfo, QueryResult, TableUpdateBatch, TableUpdateResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { buildTableUpdateStatements, TableMutationConflictError } from '@dory/drivers/table-mutations';
import { SqliteDialect } from './dialect';
import { SqliteImportWriter } from './import-writer';
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
        this.capabilities.tableMutations = {
            dialect: 'sqlite',
            atomicity: 'atomic',
            commitUpdates: input => this.commitUpdates(input),
        };
        this.capabilities.dataWriter = new SqliteImportWriter(() => openSqliteDatabase(this.config));
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
        this.assertReady();
        const streamDatabase = openSqliteDatabase(this.config);

        try {
            const stream = executeSqliteQueryRowStream<Row>(streamDatabase, sql, context?.params);
            let closed = false;
            const close = () => {
                if (closed) return;
                closed = true;
                try {
                    stream.close?.();
                } finally {
                    if (streamDatabase.open) {
                        streamDatabase.close();
                    }
                }
            };

            return {
                ...stream,
                rows: rowsWithClose(stream.rows, close),
                close,
            };
        } catch (error) {
            if (streamDatabase.open) {
                streamDatabase.close();
            }
            throw error;
        }
    }

    async command(sql: string, params?: DriverQueryParams, _context?: ConnectionQueryContext): Promise<void> {
        executeSqliteQuery(this.getDatabase(), sql, params);
    }

    private async commitUpdates(input: TableUpdateBatch): Promise<TableUpdateResult> {
        const statements = buildTableUpdateStatements('sqlite', input);
        const database = this.getDatabase();
        const commit = database.transaction(() => {
            for (const statement of statements) {
                const result = database.prepare(statement.sql).run(...statement.params);
                if (result.changes !== 1) {
                    throw new TableMutationConflictError(undefined, statement.rowIndex);
                }
            }
        });

        commit();
        return {
            updatedRows: statements.length,
            updatedCells: statements.reduce((total, statement) => total + statement.changedColumns.length, 0),
            atomicity: 'atomic',
        };
    }

    get metadata(): SqliteMetadataAPI {
        return this.capabilities.metadata as SqliteMetadataAPI;
    }
}

function rowsWithClose<Row>(rows: DriverQueryRowStream<Row>['rows'], close: () => void): DriverQueryRowStream<Row>['rows'] {
    if (typeof (rows as AsyncIterable<Row>)[Symbol.asyncIterator] === 'function') {
        return (async function* () {
            try {
                for await (const row of rows as AsyncIterable<Row>) {
                    yield row;
                }
            } finally {
                close();
            }
        })();
    }

    return (function* () {
        try {
            for (const row of rows as Iterable<Row>) {
                yield row;
            }
        } finally {
            close();
        }
    })();
}
