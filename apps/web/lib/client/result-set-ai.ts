'use client';

import { buildResultAutoChartProfile, type ResultAutoChartProfile } from '@dory/analysis/core/result-chart-profile';

export type NormalizedColumnType = 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'array' | 'unknown';

export type ResultColumnSemanticRole = 'identifier' | 'dimension' | 'measure' | 'time' | 'text' | 'json' | 'unknown';

export interface ResultColumnMeta {
    name: string;
    displayName?: string;
    type?: string | null;
    dbType?: string | null;
    normalizedType: NormalizedColumnType;
    nullable?: boolean;
    semanticRole?: ResultColumnSemanticRole;
    isPrimaryKeyLike?: boolean;
    isHighCardinality?: boolean;
    isCategorical?: boolean;
}

export interface ResultSetSummary {
    kind: 'detail_table' | 'aggregated_table' | 'time_series' | 'single_value' | 'unknown';
    rowCount: number | null;
    columnCount: number;
    limited: boolean;
    limit: number | null;
    numericColumnCount: number;
    dimensionColumnCount: number;
    timeColumnCount: number;
    identifierColumnCount: number;
    nullCellRatio?: number | null;
    duplicateRowRatio?: number | null;
    isGoodForChart: boolean;
    recommendedChart?: 'table' | 'bar' | 'line' | 'pie' | 'metric' | 'scatter' | null;
    primaryTimeColumn?: string | null;
    primaryMeasureColumns?: string[];
    primaryDimensionColumns?: string[];
}

export interface ColumnProfile {
    name: string;
    normalizedType: NormalizedColumnType;
    semanticRole: ResultColumnSemanticRole;
    nullCount: number;
    nonNullCount: number;
    nullRatio?: number | null;
    distinctCount?: number | null;
    distinctRatio?: number | null;
    entropy?: number | null;
    topValueShare?: number | null;
    informationDensity?: 'none' | 'low' | 'medium' | 'high';
    sampleValues: unknown[];
    topK?: Array<{ value: string; count: number }>;
    min?: number | null;
    max?: number | null;
    sum?: number | null;
    avg?: number | null;
    p50?: number | null;
    p95?: number | null;
    zeroCount?: number | null;
    negativeCount?: number | null;
    minTime?: string | null;
    maxTime?: string | null;
    inferredTimeGrain?: string;
    isHighCardinality?: boolean;
    isCategorical?: boolean;
}

export interface ResultSampleInfo {
    sampleStrategy: 'head' | 'head_tail' | 'reservoir';
    sampleRowCount: number;
    truncatedForAI: boolean;
}

export interface ResultSetStatsV1 {
    summary: ResultSetSummary;
    columns: Record<string, ColumnProfile>;
    sample: ResultSampleInfo;
    autoChartProfile?: ResultAutoChartProfile | null;
}

export interface ResultSetViewState {
    searchText?: string;
    sorts?: Array<{ column: string; direction: 'asc' | 'desc' }>;
    filters?: Array<{
        column: string;
        op: string;
        value?: unknown;
    }>;
    hiddenColumns?: string[];
    pinnedColumns?: string[];
    selectedRowIndexes?: number[];
}

export interface AIResultContextPayload {
    sqlText: string;
    summary: ResultSetSummary;
    columns: Array<{
        name: string;
        normalizedType: NormalizedColumnType;
        semanticRole: ResultColumnSemanticRole;
        nullCount: number;
        distinctCount?: number | null;
        sampleValues: unknown[];
        topK?: Array<{ value: string; count: number }>;
    }>;
    sampleRows: Array<Record<string, unknown>>;
}

type RawColumnMeta = {
    name?: unknown;
    displayName?: unknown;
    type?: unknown;
    dbType?: unknown;
};

const AI_SAMPLE_LIMIT = 100;
const TOP_K_LIMIT = 8;
const SAMPLE_VALUES_LIMIT = 5;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDbType(dbType?: string | null) {
    return String(dbType ?? '')
        .trim()
        .toLowerCase();
}

function isDateOnlyString(value: string) {
    return /^\d{4}-\d{1,2}-\d{1,2}$/.test(value.trim());
}

function tryParseDate(value: unknown) {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value : null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    if (!/^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed) && !trimmed.includes('T') && !/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(trimmed)) {
        return null;
    }

    const timestamp = Date.parse(trimmed);
    return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function toComparableNumber(value: unknown) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function toSafeSampleValue(value: unknown) {
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

function valueKey(value: unknown) {
    if (value == null) {
        return 'null';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return `${typeof value}:${String(value)}`;
    }

    if (value instanceof Date) {
        return `date:${value.toISOString()}`;
    }

    try {
        return `json:${JSON.stringify(value)}`;
    } catch {
        return `string:${String(value)}`;
    }
}

function shannonEntropy(counts: number[]) {
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return 0;

    return counts.reduce((sum, count) => {
        if (count <= 0) return sum;
        const probability = count / total;
        return sum - probability * Math.log2(probability);
    }, 0);
}

function informationDensityFor(params: { nonNullCount: number; distinctCount: number; distinctRatio: number; entropy: number; topValueShare: number | null }) {
    const { nonNullCount, distinctCount, distinctRatio, entropy, topValueShare } = params;

    if (nonNullCount <= 0 || distinctCount <= 1 || entropy <= 0 || topValueShare === 1) {
        return 'none' as const;
    }

    if (topValueShare != null && topValueShare >= 0.9) {
        return 'low' as const;
    }

    if (distinctRatio < 0.02 || entropy < 1) {
        return 'low' as const;
    }

    if (distinctRatio < 0.35 || entropy < 3) {
        return 'medium' as const;
    }

    return 'high' as const;
}

function inferNormalizedTypeFromValue(value: unknown): NormalizedColumnType {
    if (value == null) return 'unknown';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
    if (Array.isArray(value)) return 'array';
    if (isPlainObject(value)) return 'json';
    if (value instanceof Date) return 'datetime';
    if (typeof value === 'string') {
        const asDate = tryParseDate(value);
        if (asDate) {
            return isDateOnlyString(value) ? 'date' : 'datetime';
        }

        const numeric = toComparableNumber(value);
        if (numeric != null && value.trim() !== '') {
            return Number.isInteger(numeric) ? 'integer' : 'number';
        }

        return 'string';
    }
    return 'unknown';
}

function normalizeColumnType(dbType?: string | null, sampleValues: unknown[] = []): NormalizedColumnType {
    const normalizedDbType = normalizeDbType(dbType);

    if (/(json|jsonb|variant|object)/.test(normalizedDbType)) return 'json';
    if (/(array|\[\])/.test(normalizedDbType)) return 'array';
    if (/(bool)/.test(normalizedDbType)) return 'boolean';
    if (/(timestamp|datetime|timestamptz)/.test(normalizedDbType)) return 'datetime';
    if (/(^date$)/.test(normalizedDbType)) return 'date';
    if (/(int|integer|bigint|smallint|tinyint|serial)/.test(normalizedDbType)) return 'integer';
    if (/(float|double|decimal|numeric|real|money)/.test(normalizedDbType)) return 'number';
    if (/(char|text|uuid|enum|citext|string)/.test(normalizedDbType)) return 'string';

    const counts = new Map<NormalizedColumnType, number>();
    for (const value of sampleValues) {
        const inferred = inferNormalizedTypeFromValue(value);
        if (inferred === 'unknown') continue;
        counts.set(inferred, (counts.get(inferred) ?? 0) + 1);
    }

    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'unknown';
}

function percentile(values: number[], ratio: number) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index] ?? null;
}

function inferTimeGrain(timestamps: number[]) {
    if (timestamps.length < 2) return undefined;

    const sorted = [...timestamps].sort((left, right) => left - right);
    let minDelta = Number.POSITIVE_INFINITY;

    for (let index = 1; index < sorted.length; index += 1) {
        const delta = sorted[index]! - sorted[index - 1]!;
        if (delta > 0) {
            minDelta = Math.min(minDelta, delta);
        }
    }

    if (!Number.isFinite(minDelta)) return undefined;
    if (minDelta < 60_000) return 'second';
    if (minDelta < 3_600_000) return 'minute';
    if (minDelta < 86_400_000) return 'hour';
    if (minDelta < 7 * 86_400_000) return 'day';
    if (minDelta < 32 * 86_400_000) return 'week';
    if (minDelta < 366 * 86_400_000) return 'month';
    return 'year';
}

function buildSampleRows(rows: Array<Record<string, unknown>>) {
    if (rows.length <= AI_SAMPLE_LIMIT) {
        return rows.slice();
    }

    const headCount = Math.ceil(AI_SAMPLE_LIMIT / 2);
    const tailCount = Math.max(0, AI_SAMPLE_LIMIT - headCount);
    return [...rows.slice(0, headCount), ...rows.slice(rows.length - tailCount)];
}

function inferSemanticRole(params: { column: ResultColumnMeta; distinctCount: number; nonNullCount: number; normalizedType: NormalizedColumnType }) {
    const { column, distinctCount, nonNullCount, normalizedType } = params;
    const lowerName = column.name.toLowerCase();
    const distinctRatio = nonNullCount > 0 ? distinctCount / nonNullCount : 0;
    const idHint = /(^id$|_id$|^id_|identifier|uuid|guid|key$)/.test(lowerName);
    const timeHint = /(date|time|timestamp|created|updated|_at$|at$|day|week|month|year)/.test(lowerName);
    const measureHint = /(^|[_\W])(count|sum|amount|total|price|revenue|cost|score|avg|average|qty|quantity|size|rate)([_\W]|$)/.test(lowerName);

    if (idHint) {
        return 'identifier' satisfies ResultColumnSemanticRole;
    }

    if (normalizedType === 'date' || normalizedType === 'datetime' || timeHint) {
        return 'time' satisfies ResultColumnSemanticRole;
    }

    if ((normalizedType === 'integer' || normalizedType === 'number') && (measureHint || !idHint)) {
        return 'measure' satisfies ResultColumnSemanticRole;
    }

    if (distinctRatio >= 0.95 && normalizedType === 'string' && nonNullCount >= 20) {
        return 'identifier' satisfies ResultColumnSemanticRole;
    }

    if (normalizedType === 'string') {
        if (measureHint) {
            return 'measure' satisfies ResultColumnSemanticRole;
        }
        if (distinctCount <= 24 || distinctRatio <= 0.3) {
            return 'dimension' satisfies ResultColumnSemanticRole;
        }
        return 'text' satisfies ResultColumnSemanticRole;
    }

    if (normalizedType === 'json' || normalizedType === 'array') {
        return 'json' satisfies ResultColumnSemanticRole;
    }

    return 'unknown' satisfies ResultColumnSemanticRole;
}

export function normalizeResultColumns(rawColumns: unknown, rows: Array<Record<string, unknown>>): ResultColumnMeta[] {
    const rowKeys = new Set<string>();

    for (const row of rows) {
        Object.keys(row ?? {}).forEach(key => rowKeys.add(key));
    }

    const normalizedFromSchema: ResultColumnMeta[] = Array.isArray(rawColumns)
        ? rawColumns.reduce<ResultColumnMeta[]>((acc, column) => {
              if (!isPlainObject(column)) return acc;
              const raw = column as RawColumnMeta;
              const name = String(raw.name ?? '').trim();
              if (!name) return acc;
              const values = rows.map(row => row?.[name]).filter(value => value !== undefined);
              acc.push({
                  name,
                  displayName: raw.displayName == null ? undefined : String(raw.displayName),
                  type: raw.type == null ? null : String(raw.type),
                  dbType: raw.dbType == null ? (raw.type == null ? null : String(raw.type)) : String(raw.dbType),
                  normalizedType: normalizeColumnType(raw.dbType == null ? (raw.type == null ? null : String(raw.type)) : String(raw.dbType), values),
              });
              return acc;
          }, [])
        : [];

    const known = new Set(normalizedFromSchema.map(column => column.name));
    const inferredColumns = [...rowKeys]
        .filter(name => !known.has(name))
        .map(name => {
            const values = rows.map(row => row?.[name]).filter(value => value !== undefined);
            return {
                name,
                displayName: name,
                type: null,
                dbType: null,
                normalizedType: normalizeColumnType(null, values),
            } satisfies ResultColumnMeta;
        });

    return [...normalizedFromSchema, ...inferredColumns];
}

export function profileResultSet(params: {
    sqlText: string;
    rawColumns: unknown;
    rows: Array<Record<string, unknown>>;
    rowCount: number | null;
    limited: boolean;
    limit: number | null;
}): { columns: ResultColumnMeta[]; stats: ResultSetStatsV1; sampleRows: Array<Record<string, unknown>> } {
    const sourceRows = params.rows.map(row => (isPlainObject(row) ? row : {}));
    const normalizedColumns = normalizeResultColumns(params.rawColumns, sourceRows);
    const columnProfiles: Record<string, ColumnProfile> = {};

    let totalNullCells = 0;

    for (const column of normalizedColumns) {
        const values = sourceRows.map(row => row?.[column.name]);
        let nullCount = 0;
        const sampleValues: unknown[] = [];
        const distinctValues = new Set<string>();
        const topKMap = new Map<string, { value: string; count: number }>();
        const numericValues: number[] = [];
        const timeValues: Date[] = [];
        let zeroCount = 0;
        let negativeCount = 0;

        for (const value of values) {
            if (value == null || value === '') {
                nullCount += 1;
                continue;
            }

            distinctValues.add(valueKey(value));

            if (sampleValues.length < SAMPLE_VALUES_LIMIT) {
                sampleValues.push(toSafeSampleValue(value));
            }

            const label = typeof value === 'string' ? value : value instanceof Date ? value.toISOString() : JSON.stringify(toSafeSampleValue(value));
            const topKEntry = topKMap.get(label);
            if (topKEntry) {
                topKEntry.count += 1;
            } else {
                topKMap.set(label, { value: label, count: 1 });
            }

            const numericValue = toComparableNumber(value);
            if (numericValue != null && (column.normalizedType === 'integer' || column.normalizedType === 'number')) {
                numericValues.push(numericValue);
                if (numericValue === 0) zeroCount += 1;
                if (numericValue < 0) negativeCount += 1;
            }

            const asDate = tryParseDate(value);
            if (asDate && (column.normalizedType === 'date' || column.normalizedType === 'datetime')) {
                timeValues.push(asDate);
            }
        }

        totalNullCells += nullCount;

        const nonNullCount = values.length - nullCount;
        const distinctCount = distinctValues.size;
        const topK = [...topKMap.values()].sort((left, right) => right.count - left.count || left.value.localeCompare(right.value)).slice(0, TOP_K_LIMIT);
        const distinctRatio = nonNullCount > 0 ? distinctCount / nonNullCount : 0;
        const nullRatio = values.length > 0 ? nullCount / values.length : 0;
        const entropy = shannonEntropy([...topKMap.values()].map(item => item.count));
        const topValueShare = nonNullCount > 0 && topK[0] ? topK[0].count / nonNullCount : null;
        const semanticRole = inferSemanticRole({
            column,
            distinctCount,
            nonNullCount,
            normalizedType: column.normalizedType,
        });
        const isHighCardinality = nonNullCount > 0 && distinctRatio >= 0.75;
        const isCategorical = nonNullCount > 0 && distinctCount > 0 && distinctRatio <= 0.3;

        column.semanticRole = semanticRole;
        column.isPrimaryKeyLike = semanticRole === 'identifier';
        column.isHighCardinality = isHighCardinality;
        column.isCategorical = isCategorical;
        column.nullable = nullCount > 0;

        columnProfiles[column.name] = {
            name: column.name,
            normalizedType: column.normalizedType,
            semanticRole,
            nullCount,
            nonNullCount,
            nullRatio,
            distinctCount,
            distinctRatio,
            entropy,
            topValueShare,
            informationDensity: informationDensityFor({
                nonNullCount,
                distinctCount,
                distinctRatio,
                entropy,
                topValueShare,
            }),
            sampleValues,
            topK: column.normalizedType === 'string' ? topK : undefined,
            min: numericValues.length > 0 ? Math.min(...numericValues) : null,
            max: numericValues.length > 0 ? Math.max(...numericValues) : null,
            sum: numericValues.length > 0 ? numericValues.reduce((sum, value) => sum + value, 0) : null,
            avg: numericValues.length > 0 ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : null,
            p50: percentile(numericValues, 0.5),
            p95: percentile(numericValues, 0.95),
            zeroCount: numericValues.length > 0 ? zeroCount : null,
            negativeCount: numericValues.length > 0 ? negativeCount : null,
            minTime: timeValues.length > 0 ? new Date(Math.min(...timeValues.map(value => value.getTime()))).toISOString() : null,
            maxTime: timeValues.length > 0 ? new Date(Math.max(...timeValues.map(value => value.getTime()))).toISOString() : null,
            inferredTimeGrain: timeValues.length > 1 ? inferTimeGrain(timeValues.map(value => value.getTime())) : undefined,
            isHighCardinality,
            isCategorical,
        };
    }

    const stats = summarizeResultSet({
        columns: normalizedColumns,
        columnProfiles,
        rows: sourceRows,
        rowCount: params.rowCount,
        limited: params.limited,
        limit: params.limit,
        totalNullCells,
    });

    return {
        columns: normalizedColumns,
        stats,
        sampleRows: buildSampleRows(sourceRows),
    };
}

export function summarizeResultSet(params: {
    columns: ResultColumnMeta[];
    columnProfiles: Record<string, ColumnProfile>;
    rows: Array<Record<string, unknown>>;
    rowCount: number | null;
    limited: boolean;
    limit: number | null;
    totalNullCells?: number;
}): ResultSetStatsV1 {
    const { columns, columnProfiles, rows, rowCount, limited, limit } = params;
    const primaryTimeColumn = columns.find(column => column.semanticRole === 'time')?.name ?? null;
    const primaryMeasureColumns = columns.filter(column => column.semanticRole === 'measure').map(column => column.name);
    const primaryDimensionColumns = columns.filter(column => column.semanticRole === 'dimension').map(column => column.name);
    const identifierColumns = columns.filter(column => column.semanticRole === 'identifier').map(column => column.name);
    const rowKeys = new Set<string>();

    for (const row of rows) {
        try {
            rowKeys.add(JSON.stringify(row));
        } catch {
            rowKeys.add(String(rowKeys.size));
        }
    }

    const duplicateRowRatio = rows.length > 0 ? 1 - rowKeys.size / rows.length : null;
    const totalCells = rows.length * columns.length;
    const nullCellRatio = totalCells > 0 ? (params.totalNullCells ?? 0) / totalCells : null;

    let kind: ResultSetSummary['kind'] = 'detail_table';
    if (rows.length === 1 && columns.length === 1) {
        const singleProfile = columnProfiles[columns[0]!.name];
        if (singleProfile && (singleProfile.normalizedType === 'integer' || singleProfile.normalizedType === 'number')) {
            kind = 'single_value';
        }
    } else if (primaryTimeColumn && primaryMeasureColumns.length > 0) {
        kind = 'time_series';
    } else if (primaryDimensionColumns.length > 0 && primaryMeasureColumns.length > 0) {
        kind = 'aggregated_table';
    }

    let recommendedChart: ResultSetSummary['recommendedChart'] = 'table';
    let isGoodForChart = false;

    if (kind === 'single_value') {
        recommendedChart = 'metric';
        isGoodForChart = true;
    } else if (kind === 'time_series') {
        recommendedChart = 'line';
        isGoodForChart = true;
    } else if (kind === 'aggregated_table') {
        const dimensionDistinctCount = primaryDimensionColumns.length > 0 ? (columnProfiles[primaryDimensionColumns[0]!]?.distinctCount ?? 0) : 0;
        recommendedChart = dimensionDistinctCount > 0 && dimensionDistinctCount <= 8 ? 'pie' : 'bar';
        isGoodForChart = true;
    } else if (primaryMeasureColumns.length >= 2) {
        recommendedChart = 'scatter';
        isGoodForChart = true;
    }

    const summary: ResultSetStatsV1['summary'] = {
        kind,
        rowCount,
        columnCount: columns.length,
        limited,
        limit,
        numericColumnCount: columns.filter(column => column.normalizedType === 'integer' || column.normalizedType === 'number').length,
        dimensionColumnCount: primaryDimensionColumns.length,
        timeColumnCount: columns.filter(column => column.semanticRole === 'time').length,
        identifierColumnCount: identifierColumns.length,
        nullCellRatio,
        duplicateRowRatio,
        isGoodForChart,
        recommendedChart,
        primaryTimeColumn,
        primaryMeasureColumns,
        primaryDimensionColumns,
    };
    const baseStats: ResultSetStatsV1 = {
        summary: {
            ...summary,
        },
        columns: columnProfiles,
        sample: {
            sampleStrategy: rows.length > AI_SAMPLE_LIMIT ? 'head_tail' : 'head',
            sampleRowCount: Math.min(rows.length, AI_SAMPLE_LIMIT),
            truncatedForAI: rows.length > AI_SAMPLE_LIMIT,
        },
    };

    return {
        ...baseStats,
        autoChartProfile: buildResultAutoChartProfile({
            rows,
            columns,
            stats: baseStats,
        }),
    };
}

export function createAIResultContextPayload(params: {
    sqlText: string;
    stats: ResultSetStatsV1 | null | undefined;
    sampleRows: Array<Record<string, unknown>>;
}): AIResultContextPayload | null {
    const { sqlText, stats, sampleRows } = params;
    if (!stats) {
        return null;
    }

    return {
        sqlText,
        summary: stats.summary,
        columns: Object.values(stats.columns).map(profile => ({
            name: profile.name,
            normalizedType: profile.normalizedType,
            semanticRole: profile.semanticRole,
            nullCount: profile.nullCount,
            distinctCount: profile.distinctCount,
            sampleValues: profile.sampleValues,
            topK: profile.topK,
        })),
        sampleRows: buildSampleRows(sampleRows),
    };
}
