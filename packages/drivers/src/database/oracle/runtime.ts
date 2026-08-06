import oracledb, { type BindParameters, type ExecuteOptions, type Pool, type PoolAttributes, type Result } from 'oracledb';
import { compileParams } from '@dory/drivers/core';
import { asyncIterableWithCleanup, onceAsync } from '@dory/drivers/core';
import { DEFAULT_MAX_RESULT_ROWS } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import type { BaseConfig, ConnectionQueryContext, DriverRowCursor, HealthInfo, QueryResult } from '@dory/drivers/types';
import { OracleDialect } from './dialect';

oracledb.fetchAsString = Array.from(new Set([...(oracledb.fetchAsString ?? []), oracledb.CLOB]));

type OracleRuntimeOptions = {
    connectString?: string;
    queryTimeoutMs?: number;
    connectTimeoutMs?: number;
};

type OracleConnectionOverride = {
    host: string;
    port: number;
};

type ParsedHostInput = {
    host: string;
    port?: number;
    serviceName?: string;
    user?: string;
    password?: string;
};

function normalizePort(value?: number | string): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value);
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
    }
    return undefined;
}

function parsePositiveInt(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value);
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
    }
    return undefined;
}

function parseHostInput(host: string, fallbackPort?: number | string): ParsedHostInput {
    const trimmedHost = host.trim();
    const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedHost);

    try {
        const url = new URL(hasProtocol ? trimmedHost : `oracle://${trimmedHost}`);
        if (!/^oracle:$/i.test(url.protocol)) {
            throw new Error('unsupported protocol');
        }

        return {
            host: url.hostname || trimmedHost,
            port: url.port ? Number(url.port) : normalizePort(fallbackPort),
            serviceName: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) || undefined : undefined,
            user: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
        };
    } catch {
        return {
            host: trimmedHost,
            port: normalizePort(fallbackPort),
        };
    }
}

function extractRuntimeOptions(config: BaseConfig): OracleRuntimeOptions {
    const options = (config.options ?? {}) as Record<string, unknown>;

    return {
        connectString: typeof options.connectString === 'string' && options.connectString.trim() ? options.connectString.trim() : undefined,
        queryTimeoutMs: parsePositiveInt(options.request_timeout ?? options.query_timeout),
        connectTimeoutMs: parsePositiveInt(options.connect_timeout),
    };
}

export function buildOracleConnectString(config: BaseConfig, serviceOverride?: string, connectionOverride?: OracleConnectionOverride): string {
    const runtime = extractRuntimeOptions(config);
    if (runtime.connectString) return runtime.connectString;

    const hostConfig = parseHostInput(config.host, config.port);
    const host = connectionOverride?.host ?? hostConfig.host;
    const port = connectionOverride?.port ?? hostConfig.port ?? 1521;
    const serviceName = serviceOverride ?? config.database ?? hostConfig.serviceName;

    return serviceName ? `${host}:${port}/${serviceName}` : `${host}:${port}`;
}

function buildPoolConfig(config: BaseConfig, serviceOverride?: string, connectionOverride?: OracleConnectionOverride): PoolAttributes {
    const hostConfig = parseHostInput(config.host, config.port);
    const runtime = extractRuntimeOptions(config);

    return {
        user: config.username ?? hostConfig.user,
        password: config.password ?? hostConfig.password,
        connectString: buildOracleConnectString(config, serviceOverride, connectionOverride),
        poolMax: 10,
        poolMin: 0,
        poolIncrement: 1,
        poolTimeout: 30,
        queueTimeout: runtime.connectTimeoutMs ?? 20_000,
    };
}

function normalizeColumns(result: Result<any>) {
    return (result.metaData ?? []).map(column => ({
        name: String(column.name),
        type: typeof column.dbTypeName === 'string' ? column.dbTypeName : String(column.dbType ?? 'unknown'),
    }));
}

function normalizeParams(sqlText: string, params?: DriverQueryParams) {
    const compiled = compileParams(OracleDialect, sqlText, params);
    return {
        sql: compiled.sql,
        values: ((compiled.params as Record<string, unknown> | undefined) ?? {}) as BindParameters,
    };
}

function isSelectLike(sqlText: string) {
    return /^\s*(select|with)\b/i.test(sqlText);
}

export function enforceOracleSelectLimit(sqlText: string, maxRows = DEFAULT_MAX_RESULT_ROWS): string {
    const original = sqlText;
    let trimmed = sqlText.trim();
    if (trimmed.endsWith(';')) trimmed = trimmed.slice(0, -1);
    if (trimmed.includes(';')) return original;
    if (!/^\s*(select|with)\b/i.test(trimmed)) return original;
    if (/\bfetch\s+(first|next)\s+(:\w+|\d+)\s+rows\s+only\b/i.test(trimmed) || /\brownum\b/i.test(trimmed)) return trimmed;
    return `${trimmed} FETCH FIRST ${maxRows} ROWS ONLY`;
}

export function quoteOracleIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

export function normalizeOracleCatalogName(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/""/g, '"');
    }
    return trimmed.toUpperCase();
}

export function parseOracleTableReference(table: string, fallbackSchema?: string | null): { schema?: string; table: string } {
    const sanitized = table.trim();
    const parts = sanitized
        .split('.')
        .map(part => part.trim())
        .filter(Boolean);

    if (parts.length >= 2) {
        return {
            schema: normalizeOracleCatalogName(parts[parts.length - 2]),
            table: normalizeOracleCatalogName(parts[parts.length - 1]),
        };
    }

    return {
        schema: fallbackSchema ? normalizeOracleCatalogName(fallbackSchema) : undefined,
        table: normalizeOracleCatalogName(parts[0] || sanitized),
    };
}

export function quoteOracleQualifiedName(schema: string | undefined, name: string): string {
    return schema ? `${quoteOracleIdentifier(schema)}.${quoteOracleIdentifier(name)}` : quoteOracleIdentifier(name);
}

export function resolveOraclePort(config: BaseConfig): number {
    const hostConfig = parseHostInput(config.host, config.port);
    return hostConfig.port ?? 1521;
}

export function resolveOracleServiceName(config: BaseConfig): string | undefined {
    const hostConfig = parseHostInput(config.host, config.port);
    return config.database ?? hostConfig.serviceName;
}

export async function createOraclePool(config: BaseConfig, serviceOverride?: string, connectionOverride?: OracleConnectionOverride): Promise<Pool> {
    return oracledb.createPool(buildPoolConfig(config, serviceOverride, connectionOverride));
}

export async function pingOracle(pool: Pool): Promise<HealthInfo & { version?: string }> {
    const started = Date.now();
    const connection = await pool.getConnection();

    try {
        const result = await connection.execute<{ VERSION?: string }>(
            `
                SELECT version AS "VERSION"
                FROM product_component_version
                WHERE product LIKE :product
                FETCH FIRST 1 ROWS ONLY
            `,
            {
                product: 'Oracle Database%',
            },
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
                maxRows: 1,
            },
        );

        return {
            ok: true,
            tookMs: Date.now() - started,
            version: result.rows?.[0]?.VERSION ?? undefined,
        };
    } finally {
        await connection.close();
    }
}

export async function executeOracleQuery<Row>(
    pool: Pool,
    sqlText: string,
    params?: DriverQueryParams,
    options?: {
        context?: ConnectionQueryContext;
    },
): Promise<QueryResult<Row>> {
    const { sql: compiledSql, values } = normalizeParams(sqlText, params);
    const connection = await pool.getConnection();
    const runtimeOptions = (options?.context?.statementTimeoutMs ? { callTimeout: options.context.statementTimeoutMs } : {}) as ExecuteOptions;
    const executeOptions: ExecuteOptions = {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: DEFAULT_MAX_RESULT_ROWS,
        ...runtimeOptions,
    };
    const started = Date.now();

    try {
        const result = await connection.execute<Row>(enforceOracleSelectLimit(compiledSql), values, executeOptions);
        const rows = Array.isArray(result.rows) ? result.rows : [];

        return {
            rows,
            rowCount: result.rowsAffected ?? rows.length,
            columns: normalizeColumns(result),
            limited: isSelectLike(compiledSql) && rows.length >= DEFAULT_MAX_RESULT_ROWS,
            limit: isSelectLike(compiledSql) ? DEFAULT_MAX_RESULT_ROWS : undefined,
            tookMs: Date.now() - started,
            statistics:
                typeof result.rowsAffected === 'number'
                    ? {
                          rowsAffected: result.rowsAffected,
                      }
                    : undefined,
        };
    } finally {
        await connection.close();
    }
}

export async function executeOracleQueryRowStream<Row>(
    pool: Pool,
    sqlText: string,
    params?: DriverQueryParams,
    options?: {
        context?: ConnectionQueryContext;
    },
): Promise<DriverRowCursor<Row>> {
    const { sql: compiledSql, values } = normalizeParams(sqlText, params);
    const connection = await pool.getConnection();
    const runtimeOptions = (options?.context?.statementTimeoutMs ? { callTimeout: options.context.statementTimeoutMs } : {}) as ExecuteOptions;
    const executeOptions: ExecuteOptions = {
        outFormat: oracledb.OUT_FORMAT_ARRAY,
        fetchArraySize: 1000,
        ...runtimeOptions,
    };
    const started = Date.now();
    let stream: (AsyncIterable<Row> & { destroy?: (error?: Error) => void }) | null = null;
    const cleanup = onceAsync(() => connection.close());

    try {
        const queryStream = connection.queryStream<Row>(compiledSql, values, executeOptions) as AsyncIterable<Row> & { destroy?: (error?: Error) => void };
        let columns: ReturnType<typeof normalizeColumns> | undefined;
        (queryStream as typeof queryStream & { on?: (event: string, handler: (metadata: Result<any>['metaData']) => void) => void }).on?.('metadata', metadata => {
            columns = normalizeColumns({ metaData: metadata } as Result<any>);
        });
        stream = queryStream;
        return {
            rows: asyncIterableWithCleanup(queryStream, cleanup),
            rowCount: null,
            get columns() {
                return columns;
            },
            limited: false,
            tookMs: Date.now() - started,
            close: async () => {
                stream?.destroy?.();
                await cleanup();
            },
        };
    } catch (error) {
        stream?.destroy?.(error instanceof Error ? error : undefined);
        await cleanup();
        throw error;
    }
}

export async function executeOracleCommand(pool: Pool, sqlText: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<void> {
    await executeOracleQuery(pool, sqlText, params, { context });
}
