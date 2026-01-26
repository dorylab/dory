import { BaseConnection } from "./base/base-connection";

export type Id = string;

export type DataSourceType = 'clickhouse';

export type Field = { name: string; dataTypeID?: number; type?: string };
export interface QueryResult<T = any> {
    rows: T[];
    fields?: Field[];
    rowCount?: number;
    durationMs?: number;
    errorMessage?: string;
}

export interface TableSchema {
    name: string;
    schema?: string;
    columns: Array<{ name: string; type: string; nullable: boolean; default?: string | null }>;
    indexes?: Array<{ name: string[]; columns: string[]; unique?: boolean }>;
}

export type SchemaMap = Record<string, string[]>;

export interface BaseGetSchemaOptions {
    type: DataSourceType;
    database: string;
    cacheTTL?: number;
}

export type Pagination = {
    pageIndex: number;
    pageSize: number;
};