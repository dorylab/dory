import type { ConnectionType } from '@dory/shared/types/connections';

export const DATA_IMPORT_CONNECTION_TYPES = [
    'clickhouse',
    'cloudflare-d1',
    'duckdb',
    'mariadb',
    'mysql',
    'neon',
    'oracle',
    'postgres',
    'sqlite',
    'snowflake',
    'supabase',
    'sqlserver',
] as const satisfies readonly ConnectionType[];

const DATA_IMPORT_CONNECTION_TYPE_SET = new Set<string>(DATA_IMPORT_CONNECTION_TYPES);

export function driverSupportsDataImport(connectionType?: string | null): boolean {
    return Boolean(connectionType && DATA_IMPORT_CONNECTION_TYPE_SET.has(connectionType));
}
