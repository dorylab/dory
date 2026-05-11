import type { ConnectionListItem } from '@dory/shared/types/connections';
import { isDemoSqliteConnectionPath } from '@/lib/demo/connection-path';

export function getConnectionLocationLabel(connection?: ConnectionListItem['connection'] | null) {
    if (!connection) return null;

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
