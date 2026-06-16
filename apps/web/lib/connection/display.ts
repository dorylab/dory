import type { ConnectionListItem } from '@dory/shared/types/connections';
import { isDemoSqliteConnectionPath } from '@/lib/demo/connection-path';

function parseConnectionOptions(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return {};
}

function parsePort(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function parseHostUrl(rawHost: string) {
    try {
        return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(rawHost) ? rawHost : `http://${rawHost}`);
    } catch {
        return null;
    }
}

function isClickhouseSsl(connection: ConnectionListItem['connection'], options: Record<string, unknown>, parsedUrl: URL | null) {
    if (typeof options.ssl === 'boolean') return options.ssl;
    if (typeof options.useSSL === 'boolean') return options.useSSL;
    if (typeof options.protocol === 'string') return options.protocol.toLowerCase().startsWith('https');
    return parsedUrl?.protocol === 'https:';
}

function getClickhouseLocationLabel(connection: ConnectionListItem['connection']) {
    const rawHost = connection.host?.trim();
    const options = parseConnectionOptions(connection.options);
    const parsedUrl = rawHost ? parseHostUrl(rawHost) : null;
    const ssl = isClickhouseSsl(connection, options, parsedUrl);
    const protocol = ssl ? 'https' : 'http';
    const host = parsedUrl?.hostname || rawHost;
    const port =
        parsePort(connection.httpPort) ??
        parsePort(options.httpPort) ??
        (parsedUrl?.port ? Number(parsedUrl.port) : undefined) ??
        (connection.port && connection.port !== 9000 ? connection.port : undefined) ??
        (ssl ? 8443 : 8123);

    if (!host && !port) return null;
    if (host && port) return `${protocol}://${host}:${port}`;
    if (host) return `${protocol}://${host}`;
    return `:${port}`;
}

export function getConnectionLocationLabel(connection?: ConnectionListItem['connection'] | null) {
    if (!connection) return null;

    if (connection.type === 'duckdb') {
        const options = parseConnectionOptions(connection.options);
        if (options.managedBy === 'local-files' && options.mode === 'localFilesDataset' && typeof options.sourcePath === 'string') {
            return options.sourcePath;
        }
    }

    if (connection.type === 'sqlite') {
        const normalizedPath = connection.path?.trim();
        if (isDemoSqliteConnectionPath(normalizedPath)) {
            return 'Built-in demo.sqlite';
        }
        return normalizedPath || null;
    }

    if (connection.type === 'clickhouse') {
        return getClickhouseLocationLabel(connection);
    }

    if (connection.type === 'cloudflare-d1') {
        const options = parseConnectionOptions(connection.options);
        const accountId = typeof options.accountId === 'string' ? options.accountId.trim() : '';
        const databaseId = connection.database?.trim() ?? '';
        if (accountId && databaseId) return `${accountId}/${databaseId}`;
        return databaseId || accountId || 'api.cloudflare.com';
    }

    const rawHost = connection.host?.trim();
    const port = connection.port;
    if (!rawHost && !port) return null;
    if (rawHost && port) return `${rawHost}:${port}`;
    if (rawHost) return rawHost;
    if (typeof port === 'number') return `:${port}`;
    return null;
}
