import type { DatabaseObjectRow, QueryInsightsFilters, QueryType, TableColumnInfo, TimeRange } from '@dory/drivers/types';

export const MAX_DORY_TOOL_RESULT_ROWS = 100;
export const MAX_DORY_SCHEMA_SEARCH_DATABASES = 20;
export const DEFAULT_DORY_SCHEMA_SEARCH_LIMIT = 25;
export const MAX_DORY_SCHEMA_SEARCH_LIMIT = 100;
export const DEFAULT_DORY_MONITORING_PAGE_SIZE = 10;
export const MAX_DORY_MONITORING_PAGE_SIZE = 100;

export type SchemaSearchItem =
    | {
          kind: 'table' | 'view';
          database: string;
          name: string;
          comment?: string | null;
          totalBytes?: number | null;
          totalRows?: number | null;
          lastModified?: string | null;
      }
    | {
          kind: 'column';
          database: string;
          table: string;
          name: string;
          type?: string | null;
          comment?: string | null;
          isPrimaryKey?: boolean | number | string | null;
      };

export function clampDoryToolLimit(limit: number | null | undefined, defaultValue: number, maxValue: number) {
    if (!Number.isFinite(limit ?? NaN)) return defaultValue;
    return Math.max(1, Math.min(maxValue, Math.floor(limit!)));
}

function isTimeRange(value: unknown): value is TimeRange {
    return value === '1h' || value === '6h' || value === '24h' || value === '7d';
}

function isQueryType(value: unknown): value is QueryType {
    return value === 'all' || value === 'select' || value === 'insert' || value === 'ddl' || value === 'other';
}

export function normalizeMonitoringFilters(input?: Partial<QueryInsightsFilters> | null): QueryInsightsFilters {
    return {
        search: typeof input?.search === 'string' ? input.search : '',
        user: typeof input?.user === 'string' && input.user ? input.user : 'all',
        database: typeof input?.database === 'string' && input.database ? input.database : 'all',
        queryType: isQueryType(input?.queryType) ? input.queryType : 'all',
        minDurationMs: Number.isFinite(input?.minDurationMs) ? Math.max(0, Math.floor(input!.minDurationMs!)) : 0,
        timeRange: isTimeRange(input?.timeRange) ? input.timeRange : '1h',
    };
}

function includesQuery(value: unknown, query: string) {
    return typeof value === 'string' && value.toLowerCase().includes(query);
}

export function matchSchemaSearch(item: SchemaSearchItem, query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    if (item.kind === 'column') {
        return (
            includesQuery(item.database, normalized) ||
            includesQuery(item.table, normalized) ||
            includesQuery(item.name, normalized) ||
            includesQuery(item.type, normalized) ||
            includesQuery(item.comment, normalized)
        );
    }

    return (
        includesQuery(item.database, normalized) || includesQuery(item.name, normalized) || includesQuery(item.comment, normalized) || includesQuery(item.lastModified, normalized)
    );
}

export function toSchemaObject(kind: 'table' | 'view', database: string, item: DatabaseObjectRow): SchemaSearchItem {
    return {
        kind,
        database,
        name: item.name,
        comment: item.comment ?? null,
        totalBytes: item.totalBytes ?? null,
        totalRows: item.totalRows ?? null,
        lastModified: item.lastModified ?? null,
    };
}

export function toSchemaColumn(database: string, table: string, column: TableColumnInfo): SchemaSearchItem {
    return {
        kind: 'column',
        database,
        table,
        name: column.columnName,
        type: column.columnType ?? null,
        comment: column.comment ?? null,
        isPrimaryKey: column.isPrimaryKey ?? null,
    };
}
