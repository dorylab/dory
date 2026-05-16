export const DEMO_SQLITE_CONNECTION_PATH = 'dory://demo-sqlite';
export const DEMO_DUCKDB_CONNECTION_PATH = 'dory://demo-duckdb';

export function isDemoSqliteConnectionPath(value: string | null | undefined): boolean {
    return value?.trim() === DEMO_SQLITE_CONNECTION_PATH;
}

export function isDemoDuckDbConnectionPath(value: string | null | undefined): boolean {
    return value?.trim() === DEMO_DUCKDB_CONNECTION_PATH;
}
