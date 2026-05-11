import { createClient, type ClickHouseClient, type ClickHouseClientConfigOptions, type ClickHouseSettings, type ResponseJSON } from '@clickhouse/client';
import { DEFAULT_MAX_RESULT_ROWS } from '@dory/drivers/types';
import { enforceSelectLimit } from '@dory/drivers/core';
import { compileParams } from '@dory/drivers/core';
import type { BaseConfig, ConnectionQueryContext, HealthInfo, QueryResult } from '@dory/drivers/types';
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

export function createClickhouseClient(config: BaseConfig, options?: { database?: string; hostOverride?: string; httpPortOverride?: number }): ClickHouseClient {
    const httpPort = options?.httpPortOverride ?? resolveClickhouseHttpPort(config);
    const useTls = isClickhouseTlsEnabled(config);
    const url = buildUrl(options?.hostOverride ?? config.host, httpPort, useTls && !options?.hostOverride);
    const requestTimeout = resolveRequestTimeout(config);

    const clientOptions: ClickHouseClientConfigOptions = {
        url,
        username: config.username || 'default',
        password: config.password || '',
        database: options?.database || config.database || 'default',
        request_timeout: requestTimeout,
    };

    const settings = extractSettings(config);
    if (settings) {
        clientOptions.clickhouse_settings = settings;
    }

    return createClient(clientOptions);
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

export async function executeClickhouseQuery<Row>(client: ClickHouseClient, sql: string, params?: DriverQueryParams, context?: ConnectionQueryContext): Promise<QueryResult<Row>> {
    const started = Date.now();
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

export async function executeClickhouseCommand(client: ClickHouseClient, sql: string, params?: DriverQueryParams): Promise<void> {
    await client.command({
        query: sql,
        query_params: normalizeParams(params),
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
