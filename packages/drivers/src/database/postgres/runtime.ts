import { Pool, type ClientConfig, type PoolClient, type PoolConfig, type QueryResult as PgResult, types as pgTypes } from 'pg';
import QueryStream from 'pg-query-stream';
import { DEFAULT_MAX_RESULT_ROWS, isPostgresFamilyConnectionType } from '@dory/drivers/types';
import { enforceSelectLimit } from '@dory/drivers/core';
import { compileParams } from '@dory/drivers/core';
import type { DriverQueryParams } from '@dory/drivers/core';
import type { BaseConfig, ColumnMeta, ConnectionQueryContext, DriverRowCursor, HealthInfo, QueryResult } from '@dory/drivers/types';
import { buildNodeTlsConnectionOptions, getDriverTlsOptions } from '@dory/drivers/core/tls';
import { PostgresDialect } from './dialect';

type PgClientLike = PoolClient & { processID?: number };

type PostgresRuntimeOptions = {
    schema?: string;
    ssl?: PoolConfig['ssl'];
    queryTimeoutMs?: number;
    statementTimeoutMs?: number;
    connectionTimeoutMs?: number;
    applicationName?: string;
    connectionOptions?: string;
    enableChannelBinding?: boolean;
};

type PostgresConnectionOverride = {
    host: string;
    port: number;
};

type QuerySessionOptions = {
    context?: ConnectionQueryContext;
    trackQuery?: (pid: number) => void;
    untrackQuery?: () => void;
};

type TableKind = 'table' | 'partitioned' | 'view' | 'materialized_view' | 'foreign_table' | 'unknown';

pgTypes.setTypeParser(20, value => value);
pgTypes.setTypeParser(1700, value => value);

function parseHostInput(host: string, fallbackPort?: number | string): ClientConfig {
    const trimmedHost = host.trim();

    try {
        const url = new URL(trimmedHost);
        if (!/^postgres(ql)?:$/i.test(url.protocol)) {
            throw new Error('unsupported protocol');
        }

        return {
            host: url.hostname,
            port: url.port ? Number(url.port) : normalizePort(fallbackPort),
            database: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) : undefined,
            user: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : undefined,
        };
    } catch {
        return {
            host: trimmedHost,
            port: normalizePort(fallbackPort),
        };
    }
}

function normalizePort(value?: number | string): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.trunc(value);
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.trunc(parsed);
        }
    }
    return undefined;
}

function parsePositiveInt(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.trunc(value);
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.trunc(parsed);
        }
    }
    return undefined;
}

function mergeConnectionStringWithConfig(connectionString: string, config: BaseConfig, databaseOverride?: string, connectionOverride?: PostgresConnectionOverride) {
    try {
        const url = new URL(connectionString);
        if (!/^postgres(ql)?:$/i.test(url.protocol)) {
            return connectionString;
        }

        const resolvedHost = connectionOverride?.host ?? config.host;
        const resolvedPort = connectionOverride?.port ?? normalizePort(config.port);
        const resolvedDatabase = databaseOverride ?? config.database;
        const resolvedUsername = config.username;
        const resolvedPassword = config.password;

        if (resolvedHost) {
            url.hostname = resolvedHost.replace(/^\[(.*)\]$/, '$1');
        }
        if (resolvedPort) {
            url.port = String(resolvedPort);
        }
        if (resolvedDatabase) {
            url.pathname = `/${encodeURIComponent(resolvedDatabase)}`;
        }
        if (resolvedUsername && !url.username) {
            url.username = encodeURIComponent(resolvedUsername);
        }
        if (resolvedPassword && !url.password) {
            url.password = encodeURIComponent(resolvedPassword);
        }

        return url.toString();
    } catch {
        return connectionString;
    }
}

function extractRuntimeOptions(config: BaseConfig): PostgresRuntimeOptions {
    const options = (config.options ?? {}) as Record<string, unknown>;
    const sslMode = typeof options.sslmode === 'string' ? options.sslmode.toLowerCase() : undefined;
    const sslOption = options.ssl;
    const tlsOption = getDriverTlsOptions(options);

    let ssl: PoolConfig['ssl'];
    const tlsSsl = buildNodeTlsConnectionOptions(tlsOption);
    if (typeof tlsSsl !== 'undefined') {
        ssl = tlsSsl as PoolConfig['ssl'];
    } else if (typeof sslOption === 'boolean') {
        ssl = sslOption ? { rejectUnauthorized: false } : false;
    } else if (sslOption && typeof sslOption === 'object') {
        ssl = sslOption as PoolConfig['ssl'];
    } else if (sslMode) {
        ssl = sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' };
    }

    return {
        schema: typeof options.schema === 'string' && options.schema.trim() ? options.schema.trim() : undefined,
        ssl,
        queryTimeoutMs: parsePositiveInt(options.request_timeout),
        statementTimeoutMs: parsePositiveInt(options.statement_timeout),
        connectionTimeoutMs: parsePositiveInt(options.connection_timeout),
        applicationName: typeof options.application_name === 'string' && options.application_name.trim() ? options.application_name.trim() : 'dory',
        connectionOptions: typeof options.options === 'string' && options.options.trim() ? options.options.trim() : undefined,
        enableChannelBinding:
            typeof options.channel_binding === 'string'
                ? options.channel_binding.toLowerCase() === 'require'
                : Boolean((options as { enableChannelBinding?: unknown }).enableChannelBinding),
    };
}

export function resolvePostgresPort(config: BaseConfig): number {
    const hostConfig = parseHostInput(config.host, config.port);
    return hostConfig.port ?? 5432;
}

export function buildPostgresPoolConfig(config: BaseConfig, databaseOverride?: string, connectionOverride?: PostgresConnectionOverride): PoolConfig {
    const hostConfig = parseHostInput(config.host, config.port);
    const runtime = extractRuntimeOptions(config);
    const rawOptions = (config.options ?? {}) as Record<string, unknown>;
    const connectionString =
        isPostgresFamilyConnectionType(config.type) && typeof rawOptions.connectionString === 'string' && rawOptions.connectionString.trim()
            ? rawOptions.connectionString.trim()
            : undefined;

    const poolConfig = {
        host: connectionOverride?.host ?? hostConfig.host,
        port: connectionOverride?.port ?? hostConfig.port ?? 5432,
        user: config.username ?? hostConfig.user,
        password: config.password ?? hostConfig.password,
        database: databaseOverride ?? config.database ?? hostConfig.database ?? 'postgres',
        ssl: runtime.ssl,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: runtime.connectionTimeoutMs ?? 20_000,
        query_timeout: runtime.queryTimeoutMs,
        statement_timeout: runtime.statementTimeoutMs,
        application_name: runtime.applicationName,
        options: runtime.connectionOptions,
        ...(runtime.enableChannelBinding ? ({ enableChannelBinding: true } as any) : {}),
    } as PoolConfig;

    if (connectionString) {
        poolConfig.connectionString = mergeConnectionStringWithConfig(connectionString, config, databaseOverride, connectionOverride);
    }

    return poolConfig;
}

function normalizeColumns(result: PgResult<any>) {
    return result.fields.map(field => ({
        name: field.name,
        type: String(field.dataTypeID),
    }));
}

function normalizePgFields(fields: Array<{ name: string; dataTypeID?: number }> | undefined): ColumnMeta[] | undefined {
    if (!Array.isArray(fields) || !fields.length) return undefined;
    return fields.map(field => ({
        name: field.name,
        type: typeof field.dataTypeID === 'number' ? String(field.dataTypeID) : undefined,
    }));
}

function normalizeParams(sql: string, params?: DriverQueryParams) {
    const compiled = compileParams(PostgresDialect, sql, params);
    return {
        sql: compiled.sql,
        values: (compiled.params as unknown[] | undefined) ?? [],
    };
}

function resolveSearchPath(config: BaseConfig, context?: ConnectionQueryContext): string | undefined {
    const runtime = extractRuntimeOptions(config);
    const candidate = context?.schema ?? runtime.schema;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

async function applySessionContext(client: PgClientLike, config: BaseConfig, context?: ConnectionQueryContext) {
    const searchPath = resolveSearchPath(config, context);
    const statementTimeoutMs = context?.statementTimeoutMs ?? extractRuntimeOptions(config).statementTimeoutMs;

    if (searchPath) {
        await client.query(`SET search_path TO ${quoteQualifiedPath(searchPath)}`);
    }

    if (statementTimeoutMs) {
        await client.query('SET statement_timeout TO $1', [statementTimeoutMs]);
    }
}

function quoteQualifiedPath(input: string): string {
    return input
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part =>
            part
                .split('.')
                .map(segment => `"${segment.replace(/"/g, '""')}"`)
                .join('.'),
        )
        .join(', ');
}

export function createPostgresPool(config: BaseConfig, databaseOverride?: string, connectionOverride?: PostgresConnectionOverride): Pool {
    return new Pool(buildPostgresPoolConfig(config, databaseOverride, connectionOverride));
}

export async function pingPostgres(pool: Pool): Promise<HealthInfo & { version?: string }> {
    const started = Date.now();
    const result = await pool.query<{ version: string }>('SELECT version() AS version');

    return {
        ok: true,
        tookMs: Date.now() - started,
        version: result.rows[0]?.version,
    };
}

export async function executePostgresQuery<Row>(pool: Pool, config: BaseConfig, sql: string, params?: DriverQueryParams, options?: QuerySessionOptions): Promise<QueryResult<Row>> {
    const { sql: compiledSql, values } = normalizeParams(sql, params);
    const client = (await pool.connect()) as PgClientLike;
    const started = Date.now();

    try {
        await applySessionContext(client, config, options?.context);
        if (options?.trackQuery && options?.context?.queryId && client.processID) {
            options.trackQuery(client.processID);
        }

        const result: PgResult<any> = await client.query({
            text: enforceSelectLimit(compiledSql, DEFAULT_MAX_RESULT_ROWS),
            values,
        });

        return {
            rows: (Array.isArray(result.rows) ? result.rows : []) as Row[],
            rowCount: typeof result.rowCount === 'number' ? result.rowCount : undefined,
            columns: normalizeColumns(result),
            limited: typeof result.rowCount === 'number' && /^\s*(select|with)\b/i.test(compiledSql) && result.rowCount >= DEFAULT_MAX_RESULT_ROWS,
            limit: /^\s*(select|with)\b/i.test(compiledSql) ? DEFAULT_MAX_RESULT_ROWS : undefined,
            tookMs: Date.now() - started,
        };
    } finally {
        options?.untrackQuery?.();
        client.release();
    }
}

export async function executePostgresQueryRowStream<Row>(
    pool: Pool,
    config: BaseConfig,
    sql: string,
    params?: DriverQueryParams,
    options?: QuerySessionOptions,
): Promise<DriverRowCursor<Row>> {
    const { sql: compiledSql, values } = normalizeParams(sql, params);
    const client = (await pool.connect()) as PgClientLike;
    const started = Date.now();
    let released = false;
    let stream: QueryStream | null = null;

    const release = () => {
        if (released) return;
        released = true;
        options?.untrackQuery?.();
        client.release();
    };

    try {
        await applySessionContext(client, config, options?.context);
        if (options?.trackQuery && options?.context?.queryId && client.processID) {
            options.trackQuery(client.processID);
        }

        stream = new QueryStream(compiledSql, values, {
            batchSize: 1000,
            highWaterMark: 1000,
            rowMode: 'array',
        });
        const readable = client.query(stream);

        const rows = (async function* () {
            try {
                for await (const row of readable as AsyncIterable<Row>) {
                    yield row;
                }
            } finally {
                stream?.destroy();
                release();
            }
        })();

        return {
            rows,
            get columns() {
                return normalizePgFields((stream as any)?._result?.fields);
            },
            rowCount: null,
            limited: false,
            tookMs: Date.now() - started,
            close: () => {
                stream?.destroy();
                release();
            },
        };
    } catch (error) {
        stream?.destroy();
        release();
        throw error;
    }
}

export async function executePostgresCommand(pool: Pool, config: BaseConfig, sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<void> {
    await executePostgresQuery(pool, config, sql, params, { context });
}

export function normalizePostgresTableKind(value: unknown): TableKind {
    switch (String(value ?? '')) {
        case 'r':
            return 'table';
        case 'p':
            return 'partitioned';
        case 'v':
            return 'view';
        case 'm':
            return 'materialized_view';
        case 'f':
            return 'foreign_table';
        default:
            return 'unknown';
    }
}
