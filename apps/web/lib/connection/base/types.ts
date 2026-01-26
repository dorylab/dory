import { QueryInsightsFilters, QueryInsightsSummary, QueryTimelinePoint, QueryInsightsRow } from '@/types/monitoring';
import { ResponseJSON } from '@clickhouse/client';
import { Pagination } from '../type';
import { TablePropertiesRow, TableStats } from '@/types/table-info';

export type ConnectionType = 'clickhouse';

export interface BaseConfig {
    id: string; // datasource_id
    type: ConnectionType;
    host: string;
    port?: number | string;
    username?: string;
    password?: string;
    database?: string; // Default database
    options?: Record<string, any>; // Extra driver options (TLS, schema, account, settings)
    configVersion?: string | number; // ✅ Optional: version awareness
    updatedAt?: string | number; // ✅ Optional: version awareness
}

export type SQLParams = unknown[] | Record<string, unknown>;

export interface QueryResult<Row = any> {
    rows: Row[];
    rowCount?: number;
    limited?: boolean;
    limit?: number;
    columns?: Array<{ name: string; type?: string }>;
    tookMs?: number;
    statistics?: ResponseJSON['statistics'];
}

export interface HealthInfo {
    ok: boolean;
    message?: string;
    tookMs?: number;
}

export interface DatabaseMeta {
    label: string;
    value: string;
}

export interface TableMeta {
    label: string;
    value: string;
    database?: string;
}

export type QueryInsightsImpl = {
    summary: (filters: QueryInsightsFilters) => Promise<QueryInsightsSummary>;
    timeline: (filters: QueryInsightsFilters) => Promise<QueryTimelinePoint[]>;
    queryLogs: (
        filters: QueryInsightsFilters,
        pagination?: Pagination,
    ) => Promise<{ rows: QueryInsightsRow[]; total: number }>;
    recentQueries: (filters: QueryInsightsFilters, options?: { limit?: number }) => Promise<QueryInsightsRow[]>;
    slowQueries: (
        filters: QueryInsightsFilters,
        pagination?: Pagination,
    ) => Promise<{ rows: QueryInsightsRow[]; total: number }>;
    errorQueries: (
        filters: QueryInsightsFilters,
        pagination?: Pagination,
    ) => Promise<{ rows: QueryInsightsRow[]; total: number }>;
};

export type QueryInsightsAPI = QueryInsightsImpl;
export type GetTableInfoAPI = {
    properties: (database: string, table: string) => Promise<TablePropertiesRow | null>;
    ddl: (database: string, table: string) => Promise<string | null>;
    stats: (database: string, table: string) => Promise<TableStats | null>;
};
