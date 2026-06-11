import type { QueryInsightsFilters, QueryInsightsRow, QueryInsightsSummary, QueryTimelinePoint, QueryType, TimeRange } from '@dory/drivers/types';
import type { Pagination, QueryInsightsAPI } from '@dory/drivers/types';
import type { ClickhouseDatasource } from '../datasource';

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
const SLOW_QUERY_THRESHOLD_MS = 100;
const QUERY_LOG_TABLE = 'system.query_log';
const DEFAULT_ROW_LIMIT = 200;
const MAX_ROW_LIMIT = 200;
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
    bucket_ts: number;
    p50_ms: number;
    p95_ms: number;
    qpm: number;
    error_count: number;
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

function ensurePreset(range: TimeRange): TimeRangePreset {
    return TIME_RANGE_PRESETS[range] ?? DEFAULT_PRESET;
}

function normalizePagination(pagination?: Pagination): { pageSize: number; pageIndex: number; offset: number } {
    const rawPageSize = Number(pagination?.pageSize);
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(Math.floor(rawPageSize), MAX_ROW_LIMIT) : DEFAULT_ROW_LIMIT;
    const rawPageIndex = Number(pagination?.pageIndex);
    const pageIndex = Number.isFinite(rawPageIndex) && rawPageIndex > 0 ? Math.floor(rawPageIndex) : 0;

    return {
        pageSize,
        pageIndex,
        offset: pageIndex * pageSize,
    };
}

function buildQueryTypeCondition(queryType: QueryType): string | null {
    if (queryType === 'all') return null;
    const expr = NORMALIZED_QUERY_KIND;
    if (queryType === 'select') return `${expr} = 'select'`;
    if (queryType === 'insert') return `${expr} = 'insert'`;
    if (queryType === 'ddl') return `${expr} IN (${DDL_KINDS.map(k => `'${k}'`).join(', ')})`;
    if (queryType === 'other') return `${expr} NOT IN (${CLASSIFIED_KINDS.map(k => `'${k}'`).join(', ')})`;
    return null;
}

function buildWhereClause(filters: QueryInsightsFilters, preset: TimeRangePreset): WhereClauseResult {
    const conditions: string[] = [`event_time >= now() - ${preset.windowSql}`];
    const params: Record<string, unknown> = {};

    if (filters.user && filters.user !== 'all') {
        conditions.push(`user = {user:String}`);
        params.user = filters.user;
    }

    if (filters.database && filters.database !== 'all') {
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
    return effectiveMinDuration === filters.minDurationMs ? filters : { ...filters, minDurationMs: effectiveMinDuration };
}

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

async function fetchTimeline(datasource: ClickhouseDatasource, filters: QueryInsightsFilters): Promise<QueryTimelinePoint[]> {
    const preset = ensurePreset(filters.timeRange);
    const { clause, params } = buildWhereClause(filters, preset);

    const timelineSql = `
        SELECT
            toUnixTimestamp(toStartOfInterval(event_time, ${preset.bucketSql})) AS bucket_ts,
            quantileTiming(0.5)(query_duration_ms)  AS p50_ms,
            quantileTiming(0.95)(query_duration_ms) AS p95_ms,
            count() * 60 / {bucketSeconds:Float64}  AS qpm,
            countIf(${ERROR_CONDITION})             AS error_count,
            countIf(query_duration_ms >= {slowThreshold:UInt64}) AS slow_count
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

async function fetchQueryRows(datasource: ClickhouseDatasource, sql: string, params: Record<string, unknown>): Promise<QueryInsightsRow[]> {
    const rowsResult = await datasource.query<RawQueryRow>(sql, params);
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

async function fetchQueryLogs(datasource: ClickhouseDatasource, filters: QueryInsightsFilters, pagination?: Pagination): Promise<{ rows: QueryInsightsRow[]; total: number }> {
    const preset = ensurePreset(filters.timeRange);
    const { clause, params } = buildWhereClause(filters, preset);
    const { pageSize, offset } = normalizePagination(pagination);

    const countResult = await datasource.query<{ total: number }>(`SELECT count() AS total FROM ${QUERY_LOG_TABLE} WHERE ${clause} AND type != 'QueryStart'`, params);
    const total = Number(countResult.rows[0]?.total ?? 0);

    const rows = await fetchQueryRows(
        datasource,
        `
            SELECT
                query_id AS queryId,
                formatDateTime(event_time, '%Y-%m-%d %H:%i:%S') AS eventTime,
                user,
                ifNull(IPv6NumToString(address), '') AS address,
                current_database AS database,
                query_duration_ms AS durationMs,
                read_rows AS readRows,
                read_bytes AS readBytes,
                written_bytes AS writtenBytes,
                memory_usage AS memoryUsage,
                query,
                nullIf(exception, '') AS exception
            FROM ${QUERY_LOG_TABLE}
            WHERE ${clause}
              AND type != 'QueryStart'
            ORDER BY event_time DESC
            LIMIT {limit:UInt32} OFFSET {offset:UInt64}
        `,
        { ...params, limit: pageSize, offset },
    );

    return { rows, total };
}

async function fetchRecentQueries(datasource: ClickhouseDatasource, filters: QueryInsightsFilters, options?: { limit?: number }): Promise<QueryInsightsRow[]> {
    const preset = ensurePreset(filters.timeRange);
    const { clause, params } = buildWhereClause(filters, preset);
    const rawLimit = typeof options?.limit === 'number' && Number.isFinite(options.limit) ? Math.floor(options.limit) : DEFAULT_RECENT_LIMIT;
    const limit = Math.min(Math.max(rawLimit, 1), MAX_RECENT_LIMIT);

    return fetchQueryRows(
        datasource,
        `
            SELECT
                query_id AS queryId,
                formatDateTime(event_time, '%Y-%m-%d %H:%i:%S') AS eventTime,
                user,
                ifNull(IPv6NumToString(address), '') AS address,
                current_database AS database,
                query_duration_ms AS durationMs,
                read_rows AS readRows,
                read_bytes AS readBytes,
                written_bytes AS writtenBytes,
                memory_usage AS memoryUsage,
                query,
                nullIf(exception, '') AS exception
            FROM ${QUERY_LOG_TABLE}
            WHERE ${clause}
              AND ${EXECUTED_QUERY_TYPES_CONDITION}
            ORDER BY event_time DESC
            LIMIT {limit:UInt32}
        `,
        { ...params, limit },
    );
}

async function fetchSlowQueries(datasource: ClickhouseDatasource, filters: QueryInsightsFilters, pagination?: Pagination): Promise<{ rows: QueryInsightsRow[]; total: number }> {
    const preset = ensurePreset(filters.timeRange);
    let effectiveFilters = { ...filters };

    if (filters.thresholdMode === 'dynamic') {
        const { clause: p95Clause, params: p95Params } = buildWhereClause({ ...filters, minDurationMs: 0 }, preset);
        const p95Result = await datasource.query<{ p95_ms: number }>(
            `SELECT quantileTiming(0.95)(query_duration_ms) AS p95_ms FROM ${QUERY_LOG_TABLE} WHERE ${p95Clause} AND ${EXECUTED_QUERY_TYPES_CONDITION}`,
            p95Params,
        );
        const p95 = Number(p95Result.rows[0]?.p95_ms ?? 0);
        effectiveFilters = { ...filters, minDurationMs: p95 > 0 ? p95 : SLOW_QUERY_THRESHOLD_MS };
    }

    const enforcedFilters = ensureSlowQueryFilters(effectiveFilters);
    const { clause, params } = buildWhereClause(enforcedFilters, preset);
    const { pageSize, offset } = normalizePagination(pagination);

    const countResult = await datasource.query<{ total: number }>(`SELECT count() AS total FROM ${QUERY_LOG_TABLE} WHERE ${clause} AND ${EXECUTED_QUERY_TYPES_CONDITION}`, params);
    const total = Number(countResult.rows[0]?.total ?? 0);

    const rows = await fetchQueryRows(
        datasource,
        `
            SELECT
                query_id AS queryId,
                formatDateTime(event_time, '%Y-%m-%d %H:%i:%S') AS eventTime,
                user,
                ifNull(IPv6NumToString(address), '') AS address,
                current_database AS database,
                query_duration_ms AS durationMs,
                read_rows AS readRows,
                read_bytes AS readBytes,
                written_bytes AS writtenBytes,
                memory_usage AS memoryUsage,
                query,
                nullIf(exception, '') AS exception
            FROM ${QUERY_LOG_TABLE}
            WHERE ${clause}
              AND ${EXECUTED_QUERY_TYPES_CONDITION}
            ORDER BY query_duration_ms DESC, event_time DESC
            LIMIT {limit:UInt32} OFFSET {offset:UInt64}
        `,
        { ...params, limit: pageSize, offset },
    );

    return { rows, total };
}

async function fetchErrorQueries(datasource: ClickhouseDatasource, filters: QueryInsightsFilters, pagination?: Pagination): Promise<{ rows: QueryInsightsRow[]; total: number }> {
    const preset = ensurePreset(filters.timeRange);
    const { clause, params } = buildWhereClause(filters, preset);
    const { pageSize, offset } = normalizePagination(pagination);

    const countResult = await datasource.query<{ total: number }>(
        `SELECT count() AS total FROM ${QUERY_LOG_TABLE} WHERE ${clause} AND ${EXECUTED_QUERY_TYPES_CONDITION} AND ${ERROR_CONDITION}`,
        params,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const rows = await fetchQueryRows(
        datasource,
        `
            SELECT
                query_id AS queryId,
                formatDateTime(event_time, '%Y-%m-%d %H:%i:%S') AS eventTime,
                user,
                ifNull(IPv6NumToString(address), '') AS address,
                current_database AS database,
                query_duration_ms AS durationMs,
                read_rows AS readRows,
                read_bytes AS readBytes,
                written_bytes AS writtenBytes,
                memory_usage AS memoryUsage,
                query,
                nullIf(exception, '') AS exception
            FROM ${QUERY_LOG_TABLE}
            WHERE ${clause}
              AND ${EXECUTED_QUERY_TYPES_CONDITION}
              AND ${ERROR_CONDITION}
            ORDER BY event_time DESC
            LIMIT {limit:UInt32} OFFSET {offset:UInt64}
        `,
        { ...params, limit: pageSize, offset },
    );

    return { rows, total };
}

export function createClickhouseQueryInsightsCapability(datasource: ClickhouseDatasource): QueryInsightsAPI {
    return {
        summary: filters => fetchSummary(datasource, filters),
        timeline: filters => fetchTimeline(datasource, filters),
        queryLogs: (filters, pagination) => fetchQueryLogs(datasource, filters, pagination),
        recentQueries: (filters, options) => fetchRecentQueries(datasource, filters, options),
        slowQueries: (filters, pagination) => fetchSlowQueries(datasource, filters, pagination),
        errorQueries: (filters, pagination) => fetchErrorQueries(datasource, filters, pagination),
    };
}
