import { createClient, type ClickHouseClient, type ClickHouseClientConfigOptions, type ClickHouseSettings, type ResponseJSON } from '@clickhouse/client';
import { DEFAULT_MAX_RESULT_ROWS } from '@dory/drivers/types';
import { enforceSelectLimit } from '@dory/drivers/core';
import { compileParams } from '@dory/drivers/core';
import { asyncIterableWithCleanup, onceAsync } from '@dory/drivers/core';
import { buildClickhouseTlsOptions, getDriverTlsOptions, normalizeTlsMode } from '@dory/drivers/core/tls';
import type { BaseConfig, ConnectionQueryContext, DriverRowCursor, HealthInfo, QueryResult } from '@dory/drivers/types';
import type { DriverQueryParams } from '@dory/drivers/core';
import { ClickhouseDialect } from './dialect';

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildUrl(host: string, httpPort?: number | string, useTls?: boolean): string {
    const trimmedHost = host.trim();
    const preferredScheme = useTls ? 'https' : 'http';

    try {
        const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedHost) ? trimmedHost : `${preferredScheme}://${trimmedHost}`);
        url.protocol = `${preferredScheme}:`;

        if (typeof httpPort !== 'undefined' && httpPort !== null && httpPort !== '') {
            url.port = String(httpPort);
        } else if (!url.port) {
            url.port = useTls ? '8443' : '8123';
        }

        return url.origin;
    } catch {
        const port = typeof httpPort !== 'undefined' && httpPort !== null && httpPort !== '' ? `:${httpPort}` : '';
        return `${preferredScheme}://${trimmedHost}${port}`;
    }
}

export function resolveClickhouseHttpPort(config: BaseConfig): number | undefined {
    const options = config.options as Record<string, unknown> | undefined;
    const fromOptions = options && 'httpPort' in options ? (options as any).httpPort : undefined;

    if (typeof fromOptions === 'number') return fromOptions;
    if (typeof fromOptions === 'string' && fromOptions.trim() !== '') return Number(fromOptions);
    try {
        const parsed = new URL(config.host);
        if (parsed.port) return Number(parsed.port);
    } catch {
        // Ignore invalid URL input and fall back to config fields.
    }
    if (typeof config.port === 'number') return config.port;
    if (typeof config.port === 'string' && config.port.trim() !== '') return Number(config.port);
    return undefined;
}

export function isClickhouseTlsEnabled(config: BaseConfig): boolean {
    const raw = config.options as Record<string, unknown> | undefined;
    const tlsMode = normalizeTlsMode(getDriverTlsOptions(raw)?.mode);
    if (tlsMode) {
        return tlsMode !== 'disable';
    }

    if (raw) {
        if (typeof raw.ssl === 'boolean') return raw.ssl;
        if (typeof raw.useSSL === 'boolean') return raw.useSSL;
        if (typeof raw.protocol === 'string') {
            return raw.protocol.toLowerCase().startsWith('https');
        }
    }
    try {
        return new URL(config.host).protocol === 'https:';
    } catch {
        return false;
    }
}

function resolveRequestTimeout(config: BaseConfig): number | undefined {
    const raw = config.options as Record<string, unknown> | undefined;
    if (!raw || !('request_timeout' in raw)) {
        return undefined;
    }

    const value = raw.request_timeout;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.max(1000, Math.trunc(value));
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.max(1000, Math.trunc(parsed));
        }
    }
    return undefined;
}

function extractSettings(config: BaseConfig): ClickHouseSettings | undefined {
    const raw = config.options as Record<string, unknown> | undefined;
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

type ClickhouseClientRuntimeOptions = {
    database?: string;
    hostOverride?: string;
    httpPortOverride?: number;
};

export function buildClickhouseClientConfigOptions(config: BaseConfig, options?: ClickhouseClientRuntimeOptions): ClickHouseClientConfigOptions {
    const httpPort = options?.httpPortOverride ?? resolveClickhouseHttpPort(config);
    const useTls = isClickhouseTlsEnabled(config);
    const useHttps = useTls && !options?.hostOverride;
    const url = buildUrl(options?.hostOverride ?? config.host, httpPort, useHttps);
    const requestTimeout = resolveRequestTimeout(config);
    const rawOptions = (config.options ?? {}) as Record<string, unknown>;

    const clientOptions: ClickHouseClientConfigOptions = {
        url,
        username: config.username || 'default',
        password: config.password || '',
        database: options?.database || config.database || 'default',
        request_timeout: requestTimeout,
    };

    const tls = useHttps ? buildClickhouseTlsOptions(getDriverTlsOptions(rawOptions)) : undefined;
    if (tls) {
        clientOptions.tls = tls;
    }

    const settings = extractSettings(config);
    if (settings) {
        clientOptions.clickhouse_settings = settings;
    }

    return clientOptions;
}

export function createClickhouseClient(config: BaseConfig, options?: ClickhouseClientRuntimeOptions): ClickHouseClient {
    return createClient(buildClickhouseClientConfigOptions(config, options));
}

export async function pingClickhouse(client: ClickHouseClient): Promise<HealthInfo & { version?: string }> {
    const started = Date.now();
    await client.ping();

    const versionRes = await client.query({
        query: 'SELECT version() AS version',
        format: 'JSON',
    });

    const { data } = (await versionRes.json()) as any;

    return {
        ok: true,
        tookMs: Date.now() - started,
        version: data?.[0]?.version ?? undefined,
    };
}

function normalizeParams(params?: DriverQueryParams): Record<string, unknown> | undefined {
    if (!params) return undefined;
    const compiled = compileParams(ClickhouseDialect, '', params);
    return compiled.params as Record<string, unknown> | undefined;
}

const CLICKHOUSE_RESULT_STATEMENT_KEYWORDS = new Set(['SELECT', 'WITH', 'FROM', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'EXISTS', 'CHECK', 'WATCH', 'KILL']);

function firstClickhouseStatementKeyword(sql: string): string | null {
    let offset = 0;

    while (offset < sql.length) {
        const remaining = sql.slice(offset);
        const whitespace = remaining.match(/^[\s\uFEFF]+/u);
        if (whitespace) {
            offset += whitespace[0].length;
            continue;
        }

        if (remaining.startsWith('--') || remaining.startsWith('#')) {
            const newlineIndex = remaining.search(/[\r\n]/);
            if (newlineIndex < 0) return null;
            offset += newlineIndex + 1;
            continue;
        }

        if (remaining.startsWith('/*')) {
            const commentEnd = remaining.indexOf('*/', 2);
            if (commentEnd < 0) return null;
            offset += commentEnd + 2;
            continue;
        }

        return remaining.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? null;
    }

    return null;
}

function isClickhouseResultStatement(sql: string): boolean {
    const keyword = firstClickhouseStatementKeyword(sql);
    return keyword !== null && CLICKHOUSE_RESULT_STATEMENT_KEYWORDS.has(keyword);
}

export async function executeClickhouseQuery<Row>(client: ClickHouseClient, sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
    const started = Date.now();

    // The ClickHouse query API appends an output FORMAT clause. Only use it for
    // statements that return rows; commands must be sent to ClickHouse verbatim.
    if (!isClickhouseResultStatement(sql)) {
        await executeClickhouseCommand(client, sql, params, context);
        return {
            rows: [],
            rowCount: 0,
            columns: [],
            tookMs: Date.now() - started,
        };
    }

    const resultSet = await client.query({
        query: enforceSelectLimit(sql, DEFAULT_MAX_RESULT_ROWS),
        format: 'JSON',
        query_params: normalizeParams(params),
        query_id: context?.queryId,
    });

    let payload: ResponseJSON<Row> | undefined;

    try {
        payload = (await resultSet.json()) as ResponseJSON<Row>;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes('response length exceeds the maximum allowed size of V8 String')) {
            console.error('Query result too large for JSON parsing', err);
            throw new Error('RESULT_TOO_LARGE');
        }

        if (err instanceof SyntaxError) {
            console.warn('ClickHouse returned an empty or non-JSON result', err);
            return {
                rows: [],
                rowCount: 0,
                columns: [],
                tookMs: Date.now() - started,
            };
        }

        throw err;
    }

    const rows = (payload?.data ?? []) as Row[];
    const columns = payload?.meta?.map(meta => ({ name: meta.name, type: meta.type })) ?? [];
    const rowCount = typeof payload?.rows === 'number' ? payload.rows : rows.length;

    return {
        rows,
        rowCount,
        columns,
        limited: rowCount >= DEFAULT_MAX_RESULT_ROWS,
        limit: DEFAULT_MAX_RESULT_ROWS,
        tookMs: Date.now() - started,
        statistics: payload?.statistics ? { ...payload.statistics } : undefined,
    };
}

export async function executeClickhouseQueryRowStream<Row>(
    client: ClickHouseClient,
    sql: string,
    params?: DriverQueryParams,
    context?: ConnectionQueryContext,
): Promise<DriverRowCursor<Row>> {
    const started = Date.now();
    const resultSet = await client.query({
        query: sql,
        format: 'JSONCompactEachRowWithNamesAndTypes',
        query_params: normalizeParams(params),
        query_id: context?.queryId,
    });
    const cleanup = onceAsync(() => resultSet.close());

    const chunks = resultSet.stream() as AsyncIterable<Array<{ json(): unknown }>>;
    const rawRows = (async function* () {
        for await (const chunk of chunks) {
            for (const row of chunk) {
                yield row.json();
            }
        }
    })();
    const iterator = rawRows[Symbol.asyncIterator]();
    let namesResult: IteratorResult<unknown>;
    let typesResult: IteratorResult<unknown>;
    try {
        namesResult = await iterator.next();
        typesResult = await iterator.next();
    } catch (error) {
        await cleanup();
        throw error;
    }
    const names = !namesResult.done && Array.isArray(namesResult.value) ? namesResult.value.map(String) : [];
    const types = !typesResult.done && Array.isArray(typesResult.value) ? typesResult.value.map(String) : [];
    const rows = (async function* () {
        for (;;) {
            const next = await iterator.next();
            if (next.done) return;
            yield next.value as Row;
        }
    })();

    return {
        rows: asyncIterableWithCleanup(rows, cleanup),
        rowCount: null,
        columns: names.map((name, index) => ({ name, type: types[index] })),
        limited: false,
        tookMs: Date.now() - started,
        statistics: {
            clickhouse: {
                queryId: resultSet.query_id,
                streamingMode: 'json-compact-with-names-and-types',
            },
        },
        close: cleanup,
    };
}

export async function executeClickhouseCommand(client: ClickHouseClient, sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<void> {
    await client.command({
        query: sql,
        query_params: normalizeParams(params),
        query_id: context?.queryId,
    });
}

export async function cancelClickhouseQuery(client: ClickHouseClient, queryId: string): Promise<void> {
    if (!queryId) {
        throw new Error('CLICKHOUSE_MISSING_QUERY_ID');
    }
    try {
        await executeClickhouseCommand(client, 'KILL QUERY WHERE query_id = {qid:String} SYNC', { qid: queryId });
    } catch (error: any) {
        const message = String(error?.message ?? error ?? '');
        if (/is not running/i.test(message) || /unknown query/i.test(message) || /was cancelled/i.test(message)) {
            return;
        }
        throw error;
    }
}
