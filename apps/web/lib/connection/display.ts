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

    const rawHost = connection.host?.trim();
    const port = connection.port;
    if (!rawHost && !port) return null;
    if (rawHost && port) return `${rawHost}:${port}`;
    if (rawHost) return rawHost;
    if (typeof port === 'number') return `:${port}`;
    return null;
}
