export type Id = string;
export type Timestamp = number;

export const UNKNOWN_ID = "unknown";

export type ConnectionDialect = 'clickhouse' | 'duckdb' | 'mysql' | 'postgres' | 'unknown';
