
import { QueryInsightsFilters, QueryInsightsRow, QueryInsightsSummary, QueryTimelinePoint } from '@/types/monitoring';
import { NotInitializedError } from './errors';
import { BaseConfig, DatabaseMeta, GetTableInfoAPI, HealthInfo, QueryInsightsAPI, QueryResult, SQLParams, TableMeta } from './types';
import { translate } from '@/lib/i18n/i18n';
import { routing } from '@/lib/i18n/routing';

export abstract class BaseConnection {
    protected _initialized = false;
    constructor(public readonly config: BaseConfig) {}

    /** Connection/pool initialization (idempotent) */
    async init(): Promise<void> {
        if (this._initialized) return;
        await this._init();
        this._initialized = true;
    }
    protected abstract _init(): Promise<void>;

    /** Close connection/pool */
    abstract close(): Promise<void>;

    /** Health check */
    abstract ping(): Promise<HealthInfo>;

    /** Execute query (query/DDL/transaction behavior depends on driver) */
    abstract query<Row = any>(sql: string, params?: SQLParams): Promise<QueryResult<Row>>;

    /**
     * Query with context; defaults to plain query.
     * Subclasses can override to support database/schema selection.
     */
    async queryWithContext<Row = any>(
        sql: string,
        context?: { database?: string; params?: SQLParams; queryId?: string },
    ): Promise<QueryResult<Row>> {
        return this.query<Row>(sql, context?.params);
    }

    async cancelQuery(_queryId: string, _context?: { database?: string }): Promise<void> {
        throw new Error(translate(routing.defaultLocale, 'Utils.Connection.CancelUnsupported'));
    }

    /** List databases */
    abstract getDatabases(): Promise<DatabaseMeta[]>;

    /** List tables (optional database) */
    abstract getTables(database?: string): Promise<TableMeta[]>;

    abstract queryInsights: QueryInsightsAPI;

    abstract getTableInfo: GetTableInfoAPI;

    protected assertReady() {
        if (!this._initialized) throw new NotInitializedError();
    }

}
