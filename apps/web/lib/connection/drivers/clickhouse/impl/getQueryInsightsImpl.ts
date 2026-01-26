import { Pagination } from '@/lib/connection/type';
import type { QueryInsightsFilters, QueryInsightsRow, QueryInsightsSummary, QueryTimelinePoint, QueryType, TimeRange } from '@/types/monitoring';
import { ClickhouseDatasource } from '../ClickhouseDatasource';

type TimeRangePreset = {
    windowSql: string;
    bucketSql: string;
    bucketSeconds: number;
};

const TIME_RANGE_PRESETS: Record<TimeRange, TimeRangePreset> = {
    '1h': { windowSql: 'INTERVAL 1 HOUR', bucketSql: 'INTERVAL 1 MINUTE', bucketSeconds: 60 },
    '6h': { windowSql: 'INTERVAL 6 HOUR', bucketSql: 'INTERVAL 10 MINUTE', bucketSeconds: 600 },
    '24h': { windowSql: 'INTERVAL 1 DAY', bucketSql: 'INTERVAL 30 MINUTE', bucketSeconds: 1800 },
    '7d': { windowSql: 'INTERVAL 7 DAY', bucketSql: 'INTERVAL 6 HOUR', bucketSeconds: 21600 },
};

const DEFAULT_PRESET = TIME_RANGE_PRESETS['1h'];
const NORMALIZED_QUERY_KIND = "lowerUTF8(coalesce(query_kind, ''))";
const DDL_KINDS = ['create', 'alter', 'drop', 'truncate', 'rename'];
const CLASSIFIED_KINDS = ['select', 'insert', ...DDL_KINDS];

// Slow query threshold (ms)
const SLOW_QUERY_THRESHOLD_MS = 100;

const QUERY_LOG_TABLE = 'system.query_log';
const DEFAULT_ROW_LIMIT = 200;
const DEFAULT_RECENT_LIMIT = 8;
const MAX_RECENT_LIMIT = 50;

const EXECUTED_QUERY_TYPES_CONDITION = `type IN ('QueryFinish', 'ExceptionWhileProcessing')`;
const ERROR_CONDITION = `exception != '' AND exception IS NOT NULL`;

type SummaryRow = {
    totalQueries: number;
    slowQueries: number;
    errorQueries: number;
    activeUsers: number;
    p95_ms: number;
};

type TimelineRow = {
    bucket_ts: number; // Unix seconds
    p50_ms: number;
    p95_ms: number;
    // Queries per minute (QPM)
    qpm: number;
    // Error count per bucket
    error_count: number;
    // Slow query count per bucket
    slow_count: number;
};

type RawQueryRow = {
    queryId: string;
    eventTime: string;
    user: string;
    address: string;
    database: string | null;
    durationMs: number;
    readRows: number;
    readBytes: number;
    writtenBytes: number;
    memoryUsage: number;
    query: string;
    exception: string | null;
};

type WhereClauseResult = {
    clause: string;
    params: Record<string, unknown>;
};

export type QueryInsightsImpl = {
    summary: (filters: QueryInsightsFilters) => Promise<QueryInsightsSummary>;
    timeline: (filters: QueryInsightsFilters) => Promise<QueryTimelinePoint[]>;
    queryLogs: (filters: QueryInsightsFilters, pagination?: Pagination) => Promise<{ rows: QueryInsightsRow[]; total: number }>;
    recentQueries: (filters: QueryInsightsFilters, options?: { limit?: number }) => Promise<QueryInsightsRow[]>;
    slowQueries: (filters: QueryInsightsFilters, pagination?: Pagination) => Promise<{ rows: QueryInsightsRow[]; total: number }>;
    errorQueries: (filters: QueryInsightsFilters, pagination?: Pagination) => Promise<{ rows: QueryInsightsRow[]; total: number }>;
};

function ensurePreset(range: TimeRange): TimeRangePreset {
    return TIME_RANGE_PRESETS[range] ?? DEFAULT_PRESET;
}

function buildQueryTypeCondition(queryType: QueryType): string | null {
    if (queryType === 'all') return null;
    const expr = NORMALIZED_QUERY_KIND;

    if (queryType === 'select') return `${expr} = 'select'`;
    if (queryType === 'insert') return `${expr} = 'insert'`;

    if (queryType === 'ddl') {
        return `${expr} IN (${DDL_KINDS.map(k => `'${k}'`).join(', ')})`;
    }

    if (queryType === 'other') {
        return `${expr} NOT IN (${CLASSIFIED_KINDS.map(k => `'${k}'`).join(', ')})`;
    }

    return null;
}

/**
 * Shared filters:
 * - time window
 * - user / database
 * - minDuration
 * - search
 * - queryType
 * Avoid type here so summary/timeline/queryLogs stay independent.
 */
function buildWhereClause(filters: QueryInsightsFilters, preset: TimeRangePreset): WhereClauseResult {
    const conditions: string[] = [`event_time >= now() - ${preset.windowSql}`];
    const params: Record<string, unknown> = {};

    if (filters.user && filters.user !== 'all') {
        conditions.push(`user = {user:String}`);
        params.user = filters.user;
    }

    if (filters.database && filters.database !== 'all') {
        // system.query_log uses current_database
        conditions.push(`current_database = {current_database:String}`);
        params.current_database = filters.database;
    }

    if (filters.minDurationMs && filters.minDurationMs > 0) {
        conditions.push(`query_duration_ms >= {minDuration:UInt64}`);
        params.minDuration = Math.max(0, Math.floor(filters.minDurationMs));
    }

    const searchValue = filters.search?.trim();
    if (searchValue) {
        conditions.push(
            `(
                positionCaseInsensitive(query, {search:String}) > 0 OR
                positionCaseInsensitive(user, {search:String}) > 0 OR
                positionCaseInsensitive(ifNull(IPv6NumToString(address), ''), {search:String}) > 0 OR
                positionCaseInsensitive(ifNull(current_database, ''), {search:String}) > 0
            )`,
        );
        params.search = searchValue;
    }

    const queryTypeCondition = buildQueryTypeCondition(filters.queryType);
    if (queryTypeCondition) {
        conditions.push(queryTypeCondition);
    }

    return { clause: conditions.join(' AND '), params };
}

function ensureSlowQueryFilters(filters: QueryInsightsFilters): QueryInsightsFilters {
    const current = filters.minDurationMs ?? 0;
    const effectiveMinDuration = Math.max(current, SLOW_QUERY_THRESHOLD_MS);

    if (effectiveMinDuration === filters.minDurationMs) {
        return filters;
    }

    return {
        ...filters,
        minDurationMs: effectiveMinDuration,
    };
}

/**
 * Summary:
 * - Only count executed queries: type IN ('QueryFinish', 'ExceptionWhileProcessing')
 * - errorQueries: exception is non-empty (parse-phase type=3 excluded)
 */
async function fetchSummary(datasource: ClickhouseDatasource, filters: QueryInsightsFilters): Promise<QueryInsightsSummary> {
    const preset = ensurePreset(filters.timeRange);
    const { clause, params } = buildWhereClause(filters, preset);

    const summarySql = `
        SELECT
            count()                                              AS totalQueries,
            countIf(query_duration_ms >= {slowThreshold:UInt64}) AS slowQueries,
            countIf(${ERROR_CONDITION})                          AS errorQueries,
            uniqExact(user)                                      AS activeUsers,
            quantileTiming(0.95)(query_duration_ms)              AS p95_ms
        FROM ${QUERY_LOG_TABLE}
        WHERE ${clause}
          AND ${EXECUTED_QUERY_TYPES_CONDITION}
    `;

    const result = await datasource.query<SummaryRow>(summarySql, {
        ...params,
        slowThreshold: SLOW_QUERY_THRESHOLD_MS,
    });
    const row = result.rows[0];

    return {
        totalQueries: Number(row?.totalQueries ?? 0),
        slowQueries: Number(row?.slowQueries ?? 0),
        errorQueries: Number(row?.errorQueries ?? 0),
        activeUsers: Number(row?.activeUsers ?? 0),
        p95DurationMs: Number(row?.p95_ms ?? 0),
    };
}

/**
 * Timeline:
 * - Only count type IN ('QueryFinish', 'ExceptionWhileProcessing')
 * - p50 / p95: computed over executed queries
 * - qpm: queries per minute (count() * 60 / bucketSeconds) for comparability
 * - error_count: error queries per bucket
 * - slow_count: slow queries per bucket
 */
async function fetchTimeline(datasource: ClickhouseDatasource, filters: QueryInsightsFilters): Promise<QueryTimelinePoint[]> {
    const preset = ensurePreset(filters.timeRange);
    const { clause, params } = buildWhereClause(filters, preset);

    const timelineSql = `
        SELECT
            toUnixTimestamp(
                toStartOfInterval(event_time, ${preset.bucketSql})
            )                                       AS bucket_ts,
            quantileTiming(0.5)(query_duration_ms)  AS p50_ms,
            quantileTiming(0.95)(query_duration_ms) AS p95_ms,
            count() * 60 / {bucketSeconds:Float64}  AS qpm,
            countIf(${ERROR_CONDITION})             AS error_count,
            countIf(query_duration_ms >= {slowThreshold:UInt64})
                                                    AS slow_count
        FROM ${QUERY_LOG_TABLE}
        WHERE ${clause}
          AND ${EXECUTED_QUERY_TYPES_CONDITION}
        GROUP BY bucket_ts
        ORDER BY bucket_ts
    `;

    const result = await datasource.query<TimelineRow>(timelineSql, {
        ...params,
        bucketSeconds: preset.bucketSeconds,
        slowThreshold: SLOW_QUERY_THRESHOLD_MS,
    });

    return result.rows.map(row => ({
        ts: row.bucket_ts * 1000,
        p50Ms: Number(row.p50_ms ?? 0),
        p95Ms: Number(row.p95_ms ?? 0),
        qpm: Number(row.qpm ?? 0),
        errorCount: Number(row.error_count ?? 0),
        slowCount: Number(row.slow_count ?? 0),
    }));
}

/**
 * Query log list:
 * - Pagination via LIMIT + OFFSET
 * - Returns rows + total
 */
async function fetchQueryLogs(datasource: ClickhouseDatasource, filters: QueryInsightsFilters, pagination?: Pagination): Promise<{ rows: QueryInsightsRow[]; total: number }> {
    const preset = ensurePreset(filters.timeRange);
    const { clause, params } = buildWhereClause(filters, preset);

    const pageSize = pagination?.pageSize && pagination.pageSize > 0 ? pagination.pageSize : DEFAULT_ROW_LIMIT;
    const pageIndex = pagination?.pageIndex && pagination.pageIndex > 0 ? pagination.pageIndex : 0;
    const offset = pageIndex * pageSize;

    // 1) Get total (no LIMIT)
    const countSql = `
        SELECT count() AS total
        FROM ${QUERY_LOG_TABLE}
        WHERE ${clause}
          AND type != 'QueryStart'
    `;

    const countResult = await datasource.query<{ total: number }>(countSql, params);
    const total = Number(countResult.rows[0]?.total ?? 0);

    // 2) Get rows for current page
    const rowsSql = `
        SELECT
            query_id                                        AS queryId,
            formatDateTime(event_time, '%Y-%m-%d %H:%i:%S') AS eventTime,
            user,
            ifNull(IPv6NumToString(address), '')            AS address,
            current_database                                AS database,
            query_duration_ms                               AS durationMs,
            read_rows                                       AS readRows,
            read_bytes                                      AS readBytes,
            written_bytes                                   AS writtenBytes,
            memory_usage                                    AS memoryUsage,
            query,
            nullIf(exception, '')                           AS exception
        FROM ${QUERY_LOG_TABLE}
        WHERE ${clause}
          AND type != 'QueryStart'
        ORDER BY event_time DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt64}
    `;

    const rowsResult = await datasource.query<RawQueryRow>(rowsSql, {
        ...params,
        limit: pageSize,
        offset,
    });

    const rows = rowsResult.rows.map(row => ({
        queryId: row.queryId ?? '',
        eventTime: row.eventTime ?? '',
        user: row.user,
        address: row.address ?? '',
        database: row.database ?? null,
        durationMs: Number(row.durationMs ?? 0),
        readRows: Number(row.readRows ?? 0),
        readBytes: Number(row.readBytes ?? 0),
        writtenBytes: Number(row.writtenBytes ?? 0),
        memoryUsage: Number(row.memoryUsage ?? 0),
        query: row.query,
        exception: row.exception ?? null,
    }));

    return { rows, total };
}

async function fetchRecentQueries(
    datasource: ClickhouseDatasource,
    filters: QueryInsightsFilters,
    options?: { limit?: number },
): Promise<QueryInsightsRow[]> {
    const preset = ensurePreset(filters.timeRange);
    const { clause, params } = buildWhereClause(filters, preset);

    const rawLimit = typeof options?.limit === 'number' && Number.isFinite(options.limit) ? Math.floor(options.limit) : DEFAULT_RECENT_LIMIT;
    const limit = Math.min(Math.max(rawLimit, 1), MAX_RECENT_LIMIT);

    const rowsSql = `
        SELECT
            query_id                                        AS queryId,
            formatDateTime(event_time, '%Y-%m-%d %H:%i:%S') AS eventTime,
            user,
            ifNull(IPv6NumToString(address), '')            AS address,
            current_database                                AS database,
            query_duration_ms                               AS durationMs,
            read_rows                                       AS readRows,
            read_bytes                                      AS readBytes,
            written_bytes                                   AS writtenBytes,
            memory_usage                                    AS memoryUsage,
            query,
            nullIf(exception, '')                           AS exception
        FROM ${QUERY_LOG_TABLE}
        WHERE ${clause}
          AND ${EXECUTED_QUERY_TYPES_CONDITION}
        ORDER BY event_time DESC
        LIMIT {limit:UInt32}
    `;

    const rowsResult = await datasource.query<RawQueryRow>(rowsSql, {
        ...params,
        limit,
    });

    return rowsResult.rows.map(row => ({
        queryId: row.queryId ?? '',
        eventTime: row.eventTime ?? '',
        user: row.user,
        address: row.address ?? '',
        database: row.database ?? null,
        durationMs: Number(row.durationMs ?? 0),
        readRows: Number(row.readRows ?? 0),
        readBytes: Number(row.readBytes ?? 0),
        writtenBytes: Number(row.writtenBytes ?? 0),
        memoryUsage: Number(row.memoryUsage ?? 0),
        query: row.query,
        exception: row.exception ?? null,
    }));
}

async function fetchSlowQueries(datasource: ClickhouseDatasource, filters: QueryInsightsFilters, pagination?: Pagination): Promise<{ rows: QueryInsightsRow[]; total: number }> {
    const preset = ensurePreset(filters.timeRange);

    let effectiveFilters = { ...filters };

    if (filters.thresholdMode === 'dynamic') {
        // Avoid trimming p95 by existing minDurationMs
        const { clause: p95Clause, params: p95Params } = buildWhereClause({ ...filters, minDurationMs: 0 }, preset);

        const p95Sql = `
            SELECT quantileTiming(0.95)(query_duration_ms) AS p95_ms
            FROM ${QUERY_LOG_TABLE}
            WHERE ${p95Clause}
              AND ${EXECUTED_QUERY_TYPES_CONDITION}
        `;

        const p95Result = await datasource.query<{ p95_ms: number }>(p95Sql, p95Params);
        const p95 = Number(p95Result.rows[0]?.p95_ms ?? 0);

        const dynamicThreshold = p95 > 0 ? p95 : SLOW_QUERY_THRESHOLD_MS;

        effectiveFilters = {
            ...filters,
            minDurationMs: dynamicThreshold,
        };
    }

    const enforcedFilters = ensureSlowQueryFilters(effectiveFilters);
    const { clause, params } = buildWhereClause(enforcedFilters, preset);

    const pageSize = pagination?.pageSize && pagination.pageSize > 0 ? pagination.pageSize : DEFAULT_ROW_LIMIT;
    const pageIndex = pagination?.pageIndex && pagination.pageIndex > 0 ? pagination.pageIndex : 0;
    const offset = pageIndex * pageSize;

    const countSql = `
        SELECT count() AS total
        FROM ${QUERY_LOG_TABLE}
        WHERE ${clause}
          AND ${EXECUTED_QUERY_TYPES_CONDITION}
    `;

    const countResult = await datasource.query<{ total: number }>(countSql, params);
    const total = Number(countResult.rows[0]?.total ?? 0);

    const rowsSql = `
        SELECT
            query_id                                        AS queryId,
            formatDateTime(event_time, '%Y-%m-%d %H:%i:%S') AS eventTime,
            user,
            ifNull(IPv6NumToString(address), '')            AS address,
            current_database                                AS database,
            query_duration_ms                               AS durationMs,
            read_rows                                       AS readRows,
            read_bytes                                      AS readBytes,
            written_bytes                                   AS writtenBytes,
            memory_usage                                    AS memoryUsage,
            query,
            nullIf(exception, '')                           AS exception
        FROM ${QUERY_LOG_TABLE}
        WHERE ${clause}
          AND ${EXECUTED_QUERY_TYPES_CONDITION}
        ORDER BY query_duration_ms DESC, event_time DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt64}
    `;

    const rowsResult = await datasource.query<RawQueryRow>(rowsSql, {
        ...params,
        limit: pageSize,
        offset,
    });

    const rows = rowsResult.rows.map(row => ({
        queryId: row.queryId ?? '',
        eventTime: row.eventTime ?? '',
        user: row.user,
        address: row.address ?? '',
        database: row.database ?? null,
        durationMs: Number(row.durationMs ?? 0),
        readRows: Number(row.readRows ?? 0),
        readBytes: Number(row.readBytes ?? 0),
        writtenBytes: Number(row.writtenBytes ?? 0),
        memoryUsage: Number(row.memoryUsage ?? 0),
        query: row.query,
        exception: row.exception ?? null,
    }));

    return { rows, total };
}

async function fetchErrorQueries(datasource: ClickhouseDatasource, filters: QueryInsightsFilters, pagination?: Pagination): Promise<{ rows: QueryInsightsRow[]; total: number }> {
    const preset = ensurePreset(filters.timeRange);
    const { clause, params } = buildWhereClause(filters, preset);

    const pageSize = pagination?.pageSize && pagination.pageSize > 0 ? pagination.pageSize : DEFAULT_ROW_LIMIT;
    const pageIndex = pagination?.pageIndex && pagination.pageIndex > 0 ? pagination.pageIndex : 0;
    const offset = pageIndex * pageSize;

    const countSql = `
        SELECT count() AS total
        FROM ${QUERY_LOG_TABLE}
        WHERE ${clause}
          AND ${EXECUTED_QUERY_TYPES_CONDITION}
          AND ${ERROR_CONDITION}
    `;

    const countResult = await datasource.query<{ total: number }>(countSql, params);
    const total = Number(countResult.rows[0]?.total ?? 0);

    const rowsSql = `
        SELECT
            query_id                                        AS queryId,
            formatDateTime(event_time, '%Y-%m-%d %H:%i:%S') AS eventTime,
            user,
            ifNull(IPv6NumToString(address), '')            AS address,
            current_database                                AS database,
            query_duration_ms                               AS durationMs,
            read_rows                                       AS readRows,
            read_bytes                                      AS readBytes,
            written_bytes                                   AS writtenBytes,
            memory_usage                                    AS memoryUsage,
            query,
            nullIf(exception, '')                           AS exception
        FROM ${QUERY_LOG_TABLE}
        WHERE ${clause}
          AND ${EXECUTED_QUERY_TYPES_CONDITION}
          AND ${ERROR_CONDITION}
        ORDER BY event_time DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt64}
    `;

    const rowsResult = await datasource.query<RawQueryRow>(rowsSql, {
        ...params,
        limit: pageSize,
        offset,
    });

    const rows = rowsResult.rows.map(row => ({
        queryId: row.queryId ?? '',
        eventTime: row.eventTime ?? '',
        user: row.user,
        address: row.address ?? '',
        database: row.database ?? null,
        durationMs: Number(row.durationMs ?? 0),
        readRows: Number(row.readRows ?? 0),
        readBytes: Number(row.readBytes ?? 0),
        writtenBytes: Number(row.writtenBytes ?? 0),
        memoryUsage: Number(row.memoryUsage ?? 0),
        query: row.query,
        exception: row.exception ?? null,
    }));

    return { rows, total };
}

export function getQueryInsightsImpl(datasource: ClickhouseDatasource): QueryInsightsImpl {
    return {
        summary: filters => fetchSummary(datasource, filters),
        timeline: filters => fetchTimeline(datasource, filters),
        queryLogs: (filters, pagination) => fetchQueryLogs(datasource, filters, pagination),
        recentQueries: (filters, options) => fetchRecentQueries(datasource, filters, options),
        slowQueries: (filters, pagination) => fetchSlowQueries(datasource, filters, pagination),
        errorQueries: (filters, pagination) => fetchErrorQueries(datasource, filters, pagination),
    };
}
