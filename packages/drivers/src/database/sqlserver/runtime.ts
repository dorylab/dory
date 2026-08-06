import sql, { type ConnectionPool, type IResult, type Request, type config as SqlServerPoolConfig } from 'mssql';
import { DEFAULT_MAX_RESULT_ROWS } from '@dory/drivers/types';
import { compileParams } from '@dory/drivers/core';
import { asyncIterableWithCleanup, onceAsync } from '@dory/drivers/core';
import type { DriverQueryParams } from '@dory/drivers/core';
import type { BaseConfig, ConnectionQueryContext, DriverRowCursor, HealthInfo, QueryResult } from '@dory/drivers/types';
import { buildSecureContextOptions, getDriverTlsOptions, normalizeTlsMode } from '@dory/drivers/core/tls';
import { SqlServerDialect } from './dialect';

type SqlServerRuntimeOptions = {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    serverName?: string;
    cryptoCredentialsDetails?: NonNullable<SqlServerPoolConfig['options']>['cryptoCredentialsDetails'];
    queryTimeoutMs?: number;
    connectTimeoutMs?: number;
};

type SqlServerConnectionOverride = {
    host: string;
    port: number;
};

type ParsedHostInput = {
    host: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    encrypt?: boolean;
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

function parseBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
    }
    return undefined;
}

function parseHostInput(host: string, fallbackPort?: number | string): ParsedHostInput {
    const trimmedHost = host.trim();
    const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedHost);

    try {
        const url = new URL(hasProtocol ? trimmedHost : `sqlserver://${trimmedHost}`);
        if (!/^(sqlserver|mssql):$/i.test(url.protocol)) {
            throw new Error('unsupported protocol');
        }

        return {
            host: url.hostname || trimmedHost,
            port: url.port ? Number(url.port) : normalizePort(fallbackPort),
            database: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) || undefined : undefined,
            user: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            encrypt: parseBoolean(url.searchParams.get('encrypt')),
        };
    } catch {
        return {
            host: trimmedHost,
            port: normalizePort(fallbackPort),
        };
    }
}

function extractRuntimeOptions(config: BaseConfig): SqlServerRuntimeOptions {
    const options = (config.options ?? {}) as Record<string, unknown>;
    const hostConfig = parseHostInput(config.host, config.port);
    const tlsOption = getDriverTlsOptions(options);
    const tlsMode = normalizeTlsMode(tlsOption?.mode);
    const useTlsMode = tlsMode && tlsMode !== 'prefer';

    return {
        encrypt: useTlsMode ? tlsMode !== 'disable' : (parseBoolean(options.encrypt) ?? hostConfig.encrypt ?? true),
        trustServerCertificate: useTlsMode ? tlsMode !== 'verify-identity' : (parseBoolean(options.trustServerCertificate) ?? false),
        serverName: typeof tlsOption?.serverName === 'string' && tlsOption.serverName.trim() ? tlsOption.serverName.trim() : undefined,
        cryptoCredentialsDetails: useTlsMode && tlsMode !== 'disable' ? buildSecureContextOptions(tlsOption) : undefined,
        queryTimeoutMs: parsePositiveInt(options.request_timeout ?? options.query_timeout),
        connectTimeoutMs: parsePositiveInt(options.connect_timeout),
    };
}

export function buildSqlServerPoolConfig(config: BaseConfig, databaseOverride?: string, connectionOverride?: SqlServerConnectionOverride): SqlServerPoolConfig {
    const hostConfig = parseHostInput(config.host, config.port);
    const runtime = extractRuntimeOptions(config);

    return {
        server: connectionOverride?.host ?? hostConfig.host,
        port: connectionOverride?.port ?? hostConfig.port ?? 1433,
        user: config.username ?? hostConfig.user,
        password: config.password ?? hostConfig.password,
        database: databaseOverride ?? config.database ?? hostConfig.database,
        connectionTimeout: runtime.connectTimeoutMs ?? 20_000,
        requestTimeout: runtime.queryTimeoutMs ?? 30_000,
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30_000,
        },
        options: {
            encrypt: runtime.encrypt,
            trustServerCertificate: runtime.trustServerCertificate,
            serverName: runtime.serverName,
            cryptoCredentialsDetails: runtime.cryptoCredentialsDetails,
            enableArithAbort: true,
        },
    };
}

function normalizeColumns(result: IResult<unknown>) {
    return normalizeColumnMap(result.recordset?.columns ?? {});
}

function normalizeColumnMap(columns: IResult<unknown>['recordset']['columns']) {
    return Object.values(columns)
        .sort((a, b) => a.index - b.index)
        .map(column => ({
            name: column.name,
            type: String(column.type),
        }));
}

function normalizeParams(sqlText: string, params?: DriverQueryParams) {
    const compiled = compileParams(SqlServerDialect, sqlText, params);
    return {
        sql: compiled.sql,
        values: (compiled.params as Record<string, unknown> | undefined) ?? {},
    };
}

function bindParams(request: Request, params: Record<string, unknown>) {
    for (const [name, value] of Object.entries(params)) {
        request.input(name.replace(/^@/, ''), value);
    }
}

function isSelectLike(sqlText: string) {
    return /^\s*(select|with|exec|execute)\b/i.test(sqlText);
}

function enforceSqlServerSelectLimit(sqlText: string, maxRows = DEFAULT_MAX_RESULT_ROWS): string {
    const original = sqlText;
    let trimmed = sqlText.trim();
    if (trimmed.endsWith(';')) trimmed = trimmed.slice(0, -1);
    if (trimmed.includes(';')) return original;
    if (!/^\s*select\b/i.test(trimmed)) return original;
    if (/\btop\s*\(/i.test(trimmed) || /\boffset\s+\d+\s+rows\b/i.test(trimmed)) return trimmed;
    return trimmed.replace(/^\s*select\s+(distinct\s+)?/i, match => `${match}TOP (${maxRows}) `);
}

export function quoteSqlServerIdentifier(value: string): string {
    return `[${value.replace(/]/g, ']]')}]`;
}

export function quoteSqlServerQualifiedName(schema: string, name: string): string {
    return `${quoteSqlServerIdentifier(schema)}.${quoteSqlServerIdentifier(name)}`;
}

export function parseSqlServerTableReference(table: string): { schema?: string; table: string } {
    const sanitized = table
        .trim()
        .replace(/^\[/, '')
        .replace(/\]$/g, '')
        .replace(/\]\.\[/g, '.');
    const parts = sanitized.split('.');
    if (parts.length >= 2) {
        return {
            schema: parts[parts.length - 2] || undefined,
            table: parts[parts.length - 1] || table.trim(),
        };
    }
    return { table: sanitized };
}

export function resolveSqlServerPort(config: BaseConfig): number {
    const hostConfig = parseHostInput(config.host, config.port);
    return hostConfig.port ?? 1433;
}

export async function createSqlServerPool(config: BaseConfig, databaseOverride?: string, connectionOverride?: SqlServerConnectionOverride): Promise<ConnectionPool> {
    const pool = new sql.ConnectionPool(buildSqlServerPoolConfig(config, databaseOverride, connectionOverride));
    return pool.connect();
}

export async function pingSqlServer(pool: ConnectionPool): Promise<HealthInfo & { version?: string }> {
    const started = Date.now();
    const result = await pool.request().query<{ version?: string }>("SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS version");

    return {
        ok: true,
        tookMs: Date.now() - started,
        version: result.recordset?.[0]?.version,
    };
}

export async function executeSqlServerQuery<Row>(
    pool: ConnectionPool,
    sqlText: string,
    params?: DriverQueryParams,
    options?: {
        context?: ConnectionQueryContext;
        trackQuery?: (request: Request) => void;
        untrackQuery?: () => void;
    },
): Promise<QueryResult<Row>> {
    const { sql: compiledSql, values } = normalizeParams(sqlText, params);
    const request = pool.request();
    bindParams(request, values);
    const started = Date.now();

    try {
        if (options?.trackQuery && options.context?.queryId) {
            options.trackQuery(request);
        }

        const result = await request.query<Row>(enforceSqlServerSelectLimit(compiledSql));
        const rows = Array.isArray(result.recordset) ? result.recordset : [];
        const rowCount = result.rowsAffected?.reduce((sum, value) => sum + value, 0);

        return {
            rows,
            rowCount: rowCount ?? rows.length,
            columns: normalizeColumns(result),
            limited: isSelectLike(compiledSql) && rows.length >= DEFAULT_MAX_RESULT_ROWS,
            limit: isSelectLike(compiledSql) ? DEFAULT_MAX_RESULT_ROWS : undefined,
            tookMs: Date.now() - started,
            statistics: result.rowsAffected?.length
                ? {
                      rowsAffected: result.rowsAffected,
                  }
                : undefined,
        };
    } finally {
        options?.untrackQuery?.();
    }
}

export async function executeSqlServerQueryRowStream<Row>(
    pool: ConnectionPool,
    sqlText: string,
    params?: DriverQueryParams,
    options?: {
        context?: ConnectionQueryContext;
        trackQuery?: (request: Request) => void;
        untrackQuery?: () => void;
    },
): Promise<DriverRowCursor<Row>> {
    const { sql: compiledSql, values } = normalizeParams(sqlText, params);
    const request = pool.request();
    request.arrayRowMode = true;
    bindParams(request, values);
    const started = Date.now();

    if (options?.trackQuery && options.context?.queryId) {
        options.trackQuery(request);
    }

    const readable = request.toReadableStream({ highWaterMark: 1000 }) as AsyncIterable<Row> & { destroy?: (error?: Error) => void };
    const cleanup = onceAsync(() => options?.untrackQuery?.());
    let columns: ReturnType<typeof normalizeColumnMap> | undefined;
    request.on('recordset', recordset => {
        columns = normalizeColumnMap(recordset);
    });
    void request.query<Row>(compiledSql).catch(error => {
        readable.destroy?.(error instanceof Error ? error : new Error(String(error)));
    });

    return {
        rows: asyncIterableWithCleanup(readable, cleanup),
        rowCount: null,
        get columns() {
            return columns;
        },
        limited: false,
        tookMs: Date.now() - started,
        close: async () => {
            request.cancel();
            readable.destroy?.();
            await cleanup();
        },
    };
}

export async function executeSqlServerCommand(pool: ConnectionPool, sqlText: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<void> {
    await executeSqlServerQuery(pool, sqlText, params, { context });
}
