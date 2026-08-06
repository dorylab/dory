import { createPool, type FieldPacket, type Pool, type PoolConnection, type PoolOptions, type ResultSetHeader, type SslOptions } from 'mysql2/promise';
import { DEFAULT_MAX_RESULT_ROWS } from '@dory/drivers/types';
import { enforceSelectLimit } from '@dory/drivers/core';
import { compileParams } from '@dory/drivers/core';
import { asyncIterableWithCleanup, onceAsync } from '@dory/drivers/core';
import type { DriverQueryParams } from '@dory/drivers/core';
import type { BaseConfig, ConnectionQueryContext, DriverRowCursor, HealthInfo, QueryResult } from '@dory/drivers/types';
import { buildMysqlTlsOptions, getDriverTlsOptions } from '@dory/drivers/core/tls';
import { MySqlDialect } from './dialect';

type MySqlRuntimeOptions = {
    ssl?: SslOptions;
    queryTimeoutMs?: number;
    connectTimeoutMs?: number;
    charset?: string;
    timezone?: string;
};

type MySqlConnectionOverride = {
    host: string;
    port: number;
};

type QuerySessionOptions = {
    context?: ConnectionQueryContext;
    trackQuery?: (threadId: number) => void;
    untrackQuery?: () => void;
};

type ParsedHostInput = {
    host: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean;
};

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

function parseHostInput(host: string, fallbackPort?: number | string): ParsedHostInput {
    const trimmedHost = host.trim();
    const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedHost);

    const parseWithScheme = (scheme: string) => {
        const url = new URL(hasProtocol ? trimmedHost : `${scheme}://${trimmedHost}`);
        if (!/^(mysql|mariadb)s?:$/i.test(url.protocol)) {
            throw new Error('unsupported protocol');
        }

        return {
            host: url.hostname || trimmedHost,
            port: url.port ? Number(url.port) : normalizePort(fallbackPort),
            database: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) || undefined : undefined,
            user: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            ssl: ['mysqls:', 'mariadbs:'].includes(url.protocol.toLowerCase()),
        };
    };

    try {
        return parseWithScheme('mysql');
    } catch {
        try {
            return parseWithScheme('mariadb');
        } catch {
            return {
                host: trimmedHost,
                port: normalizePort(fallbackPort),
            };
        }
    }
}

function extractRuntimeOptions(config: BaseConfig): MySqlRuntimeOptions {
    const options = (config.options ?? {}) as Record<string, unknown>;
    const sslOption = options.ssl;
    const hostConfig = parseHostInput(config.host, config.port);
    const tlsOption = getDriverTlsOptions(options);

    let ssl: SslOptions | undefined;
    const tlsSsl = buildMysqlTlsOptions(tlsOption);
    if (tlsSsl) {
        ssl = tlsSsl as SslOptions;
    } else if (typeof tlsOption?.mode === 'string' && tlsOption.mode === 'disable') {
        ssl = undefined;
    } else if (typeof sslOption === 'boolean') {
        ssl = sslOption ? { rejectUnauthorized: false } : undefined;
    } else if (sslOption && typeof sslOption === 'object') {
        ssl = sslOption as SslOptions;
    } else if (hostConfig.ssl) {
        ssl = { rejectUnauthorized: false };
    }

    return {
        ssl,
        queryTimeoutMs: parsePositiveInt(options.request_timeout ?? options.query_timeout),
        connectTimeoutMs: parsePositiveInt(options.connect_timeout),
        charset: typeof options.charset === 'string' && options.charset.trim() ? options.charset.trim() : undefined,
        timezone: typeof options.timezone === 'string' && options.timezone.trim() ? options.timezone.trim() : undefined,
    };
}

export function buildMySqlPoolConfig(config: BaseConfig, databaseOverride?: string, connectionOverride?: MySqlConnectionOverride): PoolOptions {
    const hostConfig = parseHostInput(config.host, config.port);
    const runtime = extractRuntimeOptions(config);

    return {
        host: connectionOverride?.host ?? hostConfig.host,
        port: connectionOverride?.port ?? hostConfig.port ?? 3306,
        user: config.username ?? hostConfig.user,
        password: config.password ?? hostConfig.password,
        database: databaseOverride ?? config.database ?? hostConfig.database,
        ssl: runtime.ssl,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: false,
        connectTimeout: runtime.connectTimeoutMs ?? 20_000,
        charset: runtime.charset,
        timezone: runtime.timezone,
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: true,
        enableKeepAlive: true,
    };
}

function normalizeColumns(fields?: FieldPacket[]) {
    return (fields ?? []).map(field => ({
        name: field.name,
        type: mysqlColumnType(field),
    }));
}

function mysqlColumnType(field: FieldPacket) {
    const unsigned = typeof field.flags === 'number' ? (field.flags & 32) !== 0 : field.flags.includes('UNSIGNED');
    const integerType = unsigned ? 'BIGINT UNSIGNED' : 'BIGINT';
    switch (field.columnType) {
        case 0:
        case 246: {
            const scale = Math.max(0, Number(field.decimals ?? 0));
            const precision = Math.max(1, Number(field.columnLength ?? 0) - (scale > 0 ? 1 : 0) - (unsigned ? 0 : 1));
            return precision <= 38 ? `DECIMAL(${precision},${Math.min(scale, precision)})` : 'DECIMAL';
        }
        case 1:
        case 2:
        case 3:
        case 8:
        case 9:
        case 13:
            return integerType;
        case 4:
        case 5:
            return 'DOUBLE';
        case 7:
        case 12:
            return 'DATETIME';
        case 10:
            return 'DATE';
        case 11:
            return 'TIME';
        case 16:
            return 'BINARY';
        case 245:
            return 'JSON';
        case 249:
        case 250:
        case 251:
        case 252:
            return field.characterSet === 63 ? 'BLOB' : 'TEXT';
        default:
            return 'VARCHAR';
    }
}

function normalizeParams(sql: string, params?: DriverQueryParams) {
    const compiled = compileParams(MySqlDialect, sql, params);
    return {
        sql: compiled.sql,
        values: (compiled.params as unknown[] | undefined) ?? [],
    };
}

function isSelectLike(sql: string) {
    return /^\s*(select|with|show|describe|desc|explain)\b/i.test(sql);
}

function isResultSetHeader(value: unknown): value is ResultSetHeader {
    return Boolean(value && typeof value === 'object' && 'affectedRows' in value);
}

export function quoteMysqlIdentifier(value: string): string {
    return `\`${value.replace(/`/g, '``')}\``;
}

export function quoteMysqlQualifiedTable(database: string, table: string): string {
    return `${quoteMysqlIdentifier(database)}.${quoteMysqlIdentifier(table)}`;
}

export function parseMysqlTableReference(table: string): { database?: string; table: string } {
    const trimmed = table.trim();
    const sanitized = trimmed.replace(/`/g, '');
    const parts = sanitized.split('.');

    if (parts.length >= 2) {
        return {
            database: parts[0] || undefined,
            table: parts.slice(1).join('.'),
        };
    }

    return { table: sanitized };
}

export function resolveMysqlPort(config: BaseConfig): number {
    const hostConfig = parseHostInput(config.host, config.port);
    return hostConfig.port ?? 3306;
}

export function createMySqlPool(config: BaseConfig, databaseOverride?: string, connectionOverride?: MySqlConnectionOverride): Pool {
    return createPool(buildMySqlPoolConfig(config, databaseOverride, connectionOverride));
}

export async function pingMySql(pool: Pool): Promise<HealthInfo & { version?: string }> {
    const started = Date.now();
    const [rows] = await pool.query('SELECT VERSION() AS version');
    const versionRows = rows as Array<{ version?: string }>;

    return {
        ok: true,
        tookMs: Date.now() - started,
        version: Array.isArray(versionRows) ? versionRows[0]?.version : undefined,
    };
}

export async function executeMySqlQuery<Row>(pool: Pool, config: BaseConfig, sql: string, params?: DriverQueryParams, options?: QuerySessionOptions): Promise<QueryResult<Row>> {
    const { sql: compiledSql, values } = normalizeParams(sql, params);
    const connection = await pool.getConnection();
    const runtime = extractRuntimeOptions(config);
    const queryTimeoutMs = options?.context?.statementTimeoutMs ?? runtime.queryTimeoutMs;
    const started = Date.now();

    try {
        if (options?.trackQuery && options?.context?.queryId) {
            options.trackQuery(connection.threadId);
        }

        const [rows, fields] = await connection.query({
            sql: enforceSelectLimit(compiledSql, DEFAULT_MAX_RESULT_ROWS),
            values,
            timeout: queryTimeoutMs,
        });

        if (Array.isArray(rows)) {
            return {
                rows: rows as Row[],
                rowCount: rows.length,
                columns: normalizeColumns(fields as FieldPacket[] | undefined),
                limited: isSelectLike(compiledSql) && rows.length >= DEFAULT_MAX_RESULT_ROWS,
                limit: isSelectLike(compiledSql) ? DEFAULT_MAX_RESULT_ROWS : undefined,
                tookMs: Date.now() - started,
            };
        }

        if (isResultSetHeader(rows)) {
            return {
                rows: rows as any,
                rowCount: typeof rows.affectedRows === 'number' ? rows.affectedRows : undefined,
                columns: normalizeColumns(fields as FieldPacket[] | undefined),
                tookMs: Date.now() - started,
                statistics: {
                    affectedRows: rows.affectedRows,
                    insertId: rows.insertId,
                    warningStatus: rows.warningStatus,
                },
            };
        }

        return {
            rows: [] as Row[],
            rowCount: 0,
            columns: normalizeColumns(fields as FieldPacket[] | undefined),
            tookMs: Date.now() - started,
        };
    } finally {
        options?.untrackQuery?.();
        connection.release();
    }
}

export async function executeMySqlQueryRowStream<Row>(
    pool: Pool,
    config: BaseConfig,
    sql: string,
    params?: DriverQueryParams,
    options?: QuerySessionOptions,
): Promise<DriverRowCursor<Row>> {
    const { sql: compiledSql, values } = normalizeParams(sql, params);
    const connection = await pool.getConnection();
    const runtime = extractRuntimeOptions(config);
    const queryTimeoutMs = options?.context?.statementTimeoutMs ?? runtime.queryTimeoutMs;
    const started = Date.now();
    let stream: ({ destroy?: (error?: Error) => void } & AsyncIterable<Row>) | null = null;

    const cleanup = onceAsync(() => {
        options?.untrackQuery?.();
        connection.release();
    });

    try {
        if (options?.trackQuery && options?.context?.queryId) {
            options.trackQuery(connection.threadId);
        }

        const query = (connection as any).connection.query({
            sql: compiledSql,
            values,
            timeout: queryTimeoutMs,
            rowsAsArray: true,
        });
        let columns: ReturnType<typeof normalizeColumns> | undefined;
        query.on?.('fields', (fields: FieldPacket[]) => {
            columns = normalizeColumns(fields);
        });
        const queryStream = query.stream({ highWaterMark: 1000 }) as AsyncIterable<Row> & { destroy?: (error?: Error) => void };
        stream = queryStream;

        return {
            rows: asyncIterableWithCleanup<Row>(queryStream, cleanup),
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

export async function executeMySqlCommand(pool: Pool, config: BaseConfig, sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<void> {
    await executeMySqlQuery(pool, config, sql, params, { context });
}

export async function cancelMySqlQuery(pool: Pool, threadId: number): Promise<void> {
    if (!Number.isFinite(threadId) || threadId <= 0) {
        throw new Error('Invalid MySQL thread id');
    }

    const connection = await pool.getConnection();
    try {
        await connection.query(`KILL QUERY ${Math.trunc(threadId)}`);
    } finally {
        connection.release();
    }
}
