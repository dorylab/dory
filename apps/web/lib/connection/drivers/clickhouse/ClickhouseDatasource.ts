import { createClient, type ClickHouseClient, type ClickHouseClientConfigOptions, type ClickHouseSettings, type ResponseJSON } from '@clickhouse/client';

import { BaseConnection } from '../../base/base-connection';
import type { DatabaseMeta, GetTableInfoAPI, HealthInfo, QueryInsightsAPI, QueryResult, SQLParams, TableMeta } from '../../base/types';
import { getQueryInsightsImpl } from './impl/getQueryInsightsImpl';
import { getTableInfoImpl } from './impl/getTableInfoImpl';
import { getClickhousePrivilegesImpl, type ClickhousePrivilegesImpl } from './impl/privilegesImpl';
import { enforceSelectLimit } from '@/lib/utils/enforce-select-limit';
import { MAX_RESULT_BYTES, MAX_RESULT_ROWS } from '@/app/config/sql-console';
import { translate } from '@/lib/i18n/i18n';
import { routing } from '@/lib/i18n/routing';
import { getDatabaseSummary, getDatabaseTablesDetail, getFunctions, getMaterializedViews, getTablesOnly, getViews, type DatabaseSummary } from './impl/metadataImpl';

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildUrl(host: string, httpPort?: number | string, useTls?: boolean): string {
    if (/^https?:\/\//i.test(host)) {
        return host;
    }
    const port = typeof httpPort !== 'undefined' && httpPort !== null && httpPort !== '' ? `:${httpPort}` : '';
    const scheme = useTls ? 'https' : 'http';
    return `${scheme}://${host}${port}`;
}

export class ClickhouseDatasource extends BaseConnection {
    private client: ClickHouseClient | null = null;
    private configOptions!: ClickHouseClientConfigOptions;

    /* -------------------- Lifecycle -------------------- */

    protected async _init(): Promise<void> {
        const targetPort = this.resolveHttpPort() ?? (this.isTlsEnabled() ? 8443 : 8123);

        await this.setupSshIfNeeded(targetPort);

        this.configOptions = this.createClientOptions();
        this.client = createClient(this.configOptions);

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

    /* -------------------- Health Check -------------------- */

    async ping(): Promise<HealthInfo & { version?: string }> {
        this.assertReady();
        const started = Date.now();

        await this.client!.ping();

        const versionRes = await this.client!.query({
            query: 'SELECT version() AS version',
            format: 'JSON',
        });

        const { data } = (await versionRes.json()) as any;

        // console.log('ClickHouse version info:', data);

        return {
            ok: true,
            tookMs: Date.now() - started,
            version: data?.[0]?.version ?? undefined,
        };
    }

    /* -------------------- Query / Command -------------------- */

    /**
     * Supports queryId so callers can pass a sessionId
     */
    async query<Row = any>(sql: string, params?: SQLParams, queryId?: string): Promise<QueryResult<Row>> {
        this.assertReady();
        return this.executeQuery<Row>(this.client!, sql, params, queryId);
    }

    /**
     * Supports context.queryId + explicit database
     */
    async queryWithContext<Row = any>(sql: string, context?: { database?: string; params?: SQLParams; queryId?: string }): Promise<QueryResult<Row>> {
        const targetDb = context?.database ?? this.config.database;

        if (!targetDb || targetDb === this.configOptions.database) {
            return this.query<Row>(sql, context?.params, context?.queryId);
        }

        // Temporary client for database switch, pass through queryId
        const tempClient = createClient(this.createClientOptions(targetDb));
        try {
            return await this.executeQuery<Row>(tempClient, sql, context?.params, context?.queryId);
        } finally {
            await tempClient.close().catch(() => undefined);
        }
    }

    async command(sql: string, params?: SQLParams): Promise<void> {
        this.assertReady();
        const queryParams = this.normalizeParams(params);
        await this.client!.command({ query: sql, query_params: queryParams });
    }

    /**
     * Cancel query: maps to frontend sessionId
     */
    async cancelQuery(queryId: string): Promise<void> {
        this.assertReady();
        if (!queryId) {
            throw new Error(translate(routing.defaultLocale, 'Utils.Clickhouse.MissingQueryId'));
        }
        try {
            await this.command('KILL QUERY WHERE query_id = {qid:String} SYNC', { qid: queryId });
        } catch (error: any) {
            const message = String(error?.message ?? error ?? '');
            // Treat as success if it's no longer running
            if (/is not running/i.test(message) || /unknown query/i.test(message) || /was cancelled/i.test(message)) {
                return;
            }
            throw error;
        }
    }

    /**
     * Pass queryId through to ClickHouse query_id
     */
    private async executeQuery<Row>(client: ClickHouseClient, sql: string, params?: SQLParams, queryId?: string): Promise<QueryResult<Row>> {
        const started = Date.now();
        const queryParams = this.normalizeParams(params);

        // Guard interactive queries
        const finalSql = enforceSelectLimit(sql, MAX_RESULT_ROWS);

        const resultSet = await client.query({
            query: finalSql,
            format: 'JSON',
            query_params: queryParams,
            query_id: queryId,
            // clickhouse_settings: {
            //     max_result_rows: MAX_RESULT_ROWS.toString(),
            //     max_result_bytes: MAX_RESULT_BYTES.toString(),
            //     result_overflow_mode: 'throw',
            // },
        });

        let payload: ResponseJSON<Row> | undefined;

        try {
            payload = (await resultSet.json()) as unknown as ResponseJSON<Row>;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);

            // Result too large: V8 string size limit
            if (message.includes('response length exceeds the maximum allowed size of V8 String')) {
                console.error('Query result too large for JSON parsing', err);
                // Throw an error code the frontend can recognize
                throw new Error('RESULT_TOO_LARGE');
            }

            // SyntaxError with no body (DDL/INSERT)
            if (err instanceof SyntaxError) {
                console.warn(translate(routing.defaultLocale, 'Utils.Clickhouse.ParseJsonFailedNoResult'), err);
                return {
                    rows: [],
                    rowCount: 0,
                    columns: [],
                    tookMs: Date.now() - started,
                };
            }

            // Don't swallow other errors
            throw err;
        }

        const rows = (payload?.data ?? []) as Row[];
        const columns = payload?.meta?.map(meta => ({ name: meta.name, type: meta.type })) ?? [];
        const rowCount = typeof payload?.rows === 'number' ? payload.rows : rows.length;
        const limited = rowCount >= MAX_RESULT_ROWS;
        return {
            rows,
            rowCount,
            columns,
            limited,
            limit: MAX_RESULT_ROWS,
            tookMs: Date.now() - started,
        };
    }

    private normalizeParams(params?: SQLParams): Record<string, unknown> | undefined {
        if (!params) return undefined;
        if (Array.isArray(params)) {
            throw new Error(translate(routing.defaultLocale, 'Utils.Clickhouse.NamedParamsOnly'));
        }
        if (isPlainObject(params)) {
            return params;
        }
        return undefined;
    }

    /* -------------------- Metadata Queries -------------------- */

    async getDatabases(): Promise<DatabaseMeta[]> {
        const result = await this.query<{ name: string }>('SELECT name FROM system.databases ORDER BY name');
        return result.rows.map(row => ({ value: row.name, label: row.name }));
    }

    async getTables(database?: string): Promise<TableMeta[]> {
        if (database) {
            const rows = await this.query<{ table: string; db: string }>('SELECT name AS table, database AS db FROM system.tables WHERE database = {db:String} ORDER BY name', {
                db: database,
            });
            return rows.rows.map(row => ({ value: row.table, label: row.table, database: row.db }));
        }

        const rows = await this.query<{ table: string; db: string }>('SELECT name AS table, database AS db FROM system.tables ORDER BY database, name');
        return rows.rows.map(row => ({ value: row.table, label: `${row.db}.${row.table}`, database: row.db }));
    }

    async getTablesOnly(database: string) {
        return getTablesOnly(this, database);
    }

    async getViews(database: string) {
        return getViews(this, database);
    }

    async getMaterializedViews(database: string) {
        return getMaterializedViews(this, database);
    }

    async getFunctions(database?: string) {
        return getFunctions(this, database);
    }

    async getDatabaseSummary(options: {
        database: string;
        catalogName?: string | null;
        schemaName?: string | null;
        engine?: DatabaseSummary['engine'];
        cluster?: string | null;
        timeoutMs?: number;
    }) {
        return getDatabaseSummary(this, options);
    }

    async getDatabaseTablesDetail(database: string) {
        return getDatabaseTablesDetail(this, database);
    }

    /* -------------------- ClickHouse client options -------------------- */

    private createClientOptions(databaseOverride?: string): ClickHouseClientConfigOptions {
        const httpPort = this.resolveHttpPort();
        const useTls = this.isTlsEnabled();
        const url = buildUrl(this.config.host, httpPort, useTls);

        const base: ClickHouseClientConfigOptions = {
            url,
            username: this.config.username || 'default',
            password: this.config.password || '',
            database: databaseOverride || this.config.database || 'default',
        };

        if (this.sshAgent) {
            base.http_agent = this.sshAgent;
        }

        const settings = this.extractSettings();
        if (settings) {
            base.clickhouse_settings = settings;
        }

        return base;
    }

    private resolveHttpPort(): number | undefined {
        const options = this.config.options as Record<string, unknown> | undefined;
        const { port } = this.config;
        const fromOptions = options && 'httpPort' in options ? (options as any).httpPort : undefined;

        if (typeof fromOptions === 'number') return fromOptions;
        if (typeof fromOptions === 'string' && fromOptions.trim() !== '') return Number(fromOptions);
        if (typeof port === 'number') return port;
        if (typeof port === 'string' && port.trim() !== '') return Number(port);
        return undefined;
    }

    private isTlsEnabled(): boolean {
        const raw = this.config.options as Record<string, unknown> | undefined;
        if (!raw) return false;
        if (typeof raw.ssl === 'boolean') return raw.ssl;
        if (typeof raw.useSSL === 'boolean') return raw.useSSL;
        if (typeof raw.protocol === 'string') {
            return raw.protocol.toLowerCase().startsWith('https');
        }
        return false;
    }

    private extractSettings(): ClickHouseSettings | undefined {
        const raw = this.config.options as Record<string, unknown> | undefined;
        if (!raw) return undefined;
        const settings = (raw as any).clickhouse_settings;
        if (!isPlainObject(settings)) {
            return undefined;
        }
        const normalized: ClickHouseSettings = {};
        for (const [key, value] of Object.entries(settings)) {
            if (value === null || value === undefined) continue;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                normalized[key] = value;
            }
        }
        return Object.keys(normalized).length ? normalized : undefined;
    }

    /* -------------------- Query Insights -------------------- */

    queryInsights: QueryInsightsAPI = getQueryInsightsImpl(this);
    getTableInfo: GetTableInfoAPI = getTableInfoImpl(this);
    privileges: ClickhousePrivilegesImpl = getClickhousePrivilegesImpl(this);
}
