export type ResultAutoChartColumnInput = {
    name?: unknown;
    normalizedType?: unknown;
    semanticRole?: unknown;
    type?: unknown;
    dbType?: unknown;
};

export type ResultAutoChartStatsInput = {
    summary?: {
        recommendedChart?: 'table' | 'bar' | 'line' | 'pie' | 'metric' | 'scatter' | null;
        isGoodForChart?: boolean;
        primaryTimeColumn?: string | null;
        primaryMeasureColumns?: string[] | null;
        primaryDimensionColumns?: string[] | null;
    } | null;
} | null;

export type ResultAutoChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'heatmap';
export type ResultAutoChartMetricKind = 'count' | 'count_true' | 'sum' | 'avg' | 'max' | 'min' | 'count_distinct';
export type ResultAutoChartRow = { rowData: Record<string, unknown> };
export type ResultAutoChartColumnKind = 'date' | 'numeric' | 'category';

export type ResultAutoChartState = {
    chartType: ResultAutoChartType;
    xKey: string;
    yKey: string;
    groupKey: string;
};

export type ResultAutoChartMetricOption = {
    key: string;
    label: string;
    kind: ResultAutoChartMetricKind;
    column?: string;
};

export type ResultAutoChartSeries = {
    key: string;
    label: string;
};

export type ResultAutoChartFilterSpec =
    | {
          col: string;
          kind: 'exact';
          raw: unknown;
      }
    | {
          col: string;
          kind: 'range';
          from: string;
          to: string;
          valueType: 'number' | 'date';
          label: string;
      };

export type ResultAutoChartAggregatedData = {
    data: Array<Record<string, unknown>>;
    series: ResultAutoChartSeries[];
    bucketHint?: string | null;
};

export type ResultAutoChartColumnProfile = {
    name: string;
    kind: ResultAutoChartColumnKind;
    distinctCount: number;
    metricScore: number;
    isBooleanLike: boolean;
    isIdLike: boolean;
    semanticRole?: string;
};

export type ResultAutoChartProfile = {
    version: 1;
    chartState: ResultAutoChartState;
    metricOptions: ResultAutoChartMetricOption[];
    aggregated: ResultAutoChartAggregatedData;
    columnNames: string[];
    columnProfiles: ResultAutoChartColumnProfile[];
    emptyReason?: string | null;
    confidence: number;
};

export type ResultAutoChartOverrides = Omit<Partial<ResultAutoChartState>, 'chartType'> & {
    chartType?: ResultAutoChartType | 'area';
    yKeys?: Array<{ key: string; label?: string; color?: string }>;
    valueKey?: string;
    categoryKey?: string;
};

export type ResultAutoChartPart = {
    type: 'chart';
    chartType: 'bar' | 'line' | 'area' | 'pie';
    title?: string;
    description?: string;
    data: Array<Record<string, unknown>>;
    xKey?: string;
    yKeys?: Array<{ key: string; label?: string; color?: string }>;
    categoryKey?: string;
    valueKey?: string;
    options?: {
        stacked?: boolean;
        xKeyType?: 'time' | 'category' | 'number';
        sortBy?: 'x' | 'value';
    };
};

type RawColumn = Partial<ResultAutoChartColumnInput> & {
    normalizedType?: unknown;
    semanticRole?: unknown;
    type?: unknown;
    name?: unknown;
};

type BucketStrategy = {
    getBucketLabel: (value: unknown) => string;
    getSortValue: (value: unknown) => number;
    getFilterSpec: (value: unknown) => ResultAutoChartFilterSpec | null;
    getBrushFilterSpec: (value: unknown) => Extract<ResultAutoChartFilterSpec, { kind: 'range' }> | null;
    bucketHint: string | null;
};

export const RESULT_AUTO_CHART_PROFILE_VERSION = 1;
export const RESULT_AUTO_CHART_NONE_VALUE = '__none__';
export const RESULT_AUTO_CHART_ALL_SERIES_KEY = '__value__';

const MAX_GROUP_SERIES = 5;
const OTHERS_SERIES_LABEL = 'Others';
const MAX_BUCKETS = 30;
const TOP_CATEGORY_BUCKETS = 20;
const NUMERIC_BIN_COUNT = 20;

function isNumericValue(value: unknown) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return Number.isFinite(Number(trimmed));
}

function toNumericValue(value: unknown) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function toBooleanLikeValue(value: unknown) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
        return null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim().toLowerCase();
    if (trimmed === '1' || trimmed === 'true' || trimmed === 'yes') return true;
    if (trimmed === '0' || trimmed === 'false' || trimmed === 'no') return false;
    return null;
}

function parseDateValue(value: unknown) {
    if (value instanceof Date) {
        const timestamp = value.getTime();
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const looksDateLike = /^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(trimmed) || trimmed.includes('T');
    if (!looksDateLike) {
        return null;
    }

    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function toDimensionLabel(value: unknown) {
    if (value == null) return 'NULL';
    if (typeof value === 'string') return value || '(empty)';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function toSeriesId(label: string) {
    const normalized = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized ? `series-${normalized}` : 'series-empty';
}

function formatNumberLabel(value: number) {
    if (!Number.isFinite(value)) return '0';
    if (Math.abs(value) >= 100 || Number.isInteger(value)) return String(Math.round(value * 100) / 100);
    return String(Number(value.toFixed(2)));
}

function startOfWeek(timestamp: number) {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + diff);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
}

function startOfMonth(timestamp: number) {
    const date = new Date(timestamp);
    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
}

function formatDateBucketLabel(timestamp: number, granularity: 'minute' | 'hour' | 'day' | 'week' | 'month') {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');

    if (granularity === 'minute') return `${year}-${month}-${day} ${hour}:${minute}`;
    if (granularity === 'hour') return `${year}-${month}-${day} ${hour}:00`;
    if (granularity === 'day') return `${year}-${month}-${day}`;
    if (granularity === 'week') return `Week of ${year}-${month}-${day}`;
    return `${year}-${month}`;
}

function getDateBucketStart(timestamp: number, granularity: 'minute' | 'hour' | 'day' | 'week' | 'month') {
    const date = new Date(timestamp);

    if (granularity === 'minute') {
        date.setUTCSeconds(0, 0);
        return date.getTime();
    }
    if (granularity === 'hour') {
        date.setUTCMinutes(0, 0, 0);
        return date.getTime();
    }
    if (granularity === 'day') {
        date.setUTCHours(0, 0, 0, 0);
        return date.getTime();
    }
    if (granularity === 'week') {
        return startOfWeek(timestamp);
    }
    return startOfMonth(timestamp);
}

function getMetricContribution(value: unknown, metric: ResultAutoChartMetricOption) {
    if (metric.kind === 'count') {
        return 1;
    }

    if (metric.kind === 'count_true') {
        return toBooleanLikeValue(value) ? 1 : 0;
    }

    if (metric.kind === 'count_distinct') {
        return value == null || value === '' ? 0 : 1;
    }

    const numericValue = toNumericValue(value);
    return numericValue ?? 0;
}

function getRawDistinctCount(rows: ResultAutoChartRow[], key: string) {
    const values = new Set<string>();

    for (const row of rows) {
        const value = row.rowData?.[key];
        if (value == null || value === '') {
            continue;
        }
        values.add(toDimensionLabel(value));
    }

    return values.size;
}

function normalizeRows(rows: Array<ResultAutoChartRow | Record<string, unknown>>) {
    return rows
        .map(row => {
            if (row && typeof row === 'object' && 'rowData' in row && row.rowData && typeof row.rowData === 'object' && !Array.isArray(row.rowData)) {
                return row as ResultAutoChartRow;
            }
            if (row && typeof row === 'object' && !Array.isArray(row)) {
                return { rowData: row as Record<string, unknown> };
            }
            return null;
        })
        .filter((row): row is ResultAutoChartRow => !!row);
}

export function getResultAutoChartColumnNames(columnsRaw: unknown, rows: ResultAutoChartRow[]) {
    if (Array.isArray(columnsRaw)) {
        const names = columnsRaw.map(column => (column && typeof column === 'object' && 'name' in column ? String((column as { name?: unknown }).name ?? '') : '')).filter(Boolean);
        if (names.length > 0) return names;
    }

    const firstRow = rows[0]?.rowData;
    if (firstRow && typeof firstRow === 'object' && !Array.isArray(firstRow)) {
        return Object.keys(firstRow);
    }

    return [];
}

function matchedColumn(columnsRaw: unknown, columnName: string): RawColumn | undefined {
    if (!Array.isArray(columnsRaw)) {
        return undefined;
    }

    return columnsRaw.find(column => column && typeof column === 'object' && 'name' in column && String((column as { name?: unknown }).name ?? '') === columnName) as
        | RawColumn
        | undefined;
}

export function getResultAutoChartColumnType(columnsRaw: unknown, columnName: string) {
    const matched = matchedColumn(columnsRaw, columnName);
    const result = matched?.normalizedType ?? matched?.type;
    return result == null ? null : String(result);
}

function inferSingleValueRange(value: unknown, valueType: 'number' | 'date') {
    if (valueType === 'number') {
        const numericValue = toNumericValue(value);
        if (numericValue == null) return null;
        return {
            from: String(numericValue),
            to: String(numericValue + Number.EPSILON),
        };
    }

    if (value instanceof Date) {
        const from = value.getTime();
        return {
            from: new Date(from).toISOString(),
            to: new Date(from + 1).toISOString(),
        };
    }

    const raw = String(value ?? '');
    const parsed = parseDateValue(raw);
    if (parsed == null) return null;
    const next = new Date(parsed);
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw.trim())) next.setUTCDate(next.getUTCDate() + 1);
    else if (/^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}$/.test(raw.trim())) next.setUTCMinutes(next.getUTCMinutes() + 1);
    else next.setUTCMilliseconds(next.getUTCMilliseconds() + 1);
    return {
        from: new Date(parsed).toISOString(),
        to: next.toISOString(),
    };
}

export function buildResultAutoChartMetricOptions(columnProfiles: ResultAutoChartColumnProfile[]) {
    const options: ResultAutoChartMetricOption[] = [{ key: 'count', label: 'Count', kind: 'count' }];

    for (const profile of columnProfiles) {
        if (profile.kind !== 'numeric') {
            continue;
        }

        if (profile.isBooleanLike) {
            options.push({
                key: `count_true:${profile.name}`,
                label: `Count(${profile.name})`,
                kind: 'count_true',
                column: profile.name,
            });
            continue;
        }

        if (profile.isIdLike) {
            options.push({
                key: `count_distinct:${profile.name}`,
                label: `Count Distinct(${profile.name})`,
                kind: 'count_distinct',
                column: profile.name,
            });
            continue;
        }

        options.push(
            {
                key: `sum:${profile.name}`,
                label: `Sum(${profile.name})`,
                kind: 'sum',
                column: profile.name,
            },
            {
                key: `avg:${profile.name}`,
                label: `Avg(${profile.name})`,
                kind: 'avg',
                column: profile.name,
            },
            {
                key: `max:${profile.name}`,
                label: `Max(${profile.name})`,
                kind: 'max',
                column: profile.name,
            },
            {
                key: `min:${profile.name}`,
                label: `Min(${profile.name})`,
                kind: 'min',
                column: profile.name,
            },
            {
                key: `count_distinct:${profile.name}`,
                label: `Count Distinct(${profile.name})`,
                kind: 'count_distinct',
                column: profile.name,
            },
        );
    }

    return options;
}

export function analyzeResultAutoChartColumns(columnNames: string[], rows: ResultAutoChartRow[], columnsRaw?: unknown) {
    return columnNames.map<ResultAutoChartColumnProfile>(columnName => {
        let nonNullCount = 0;
        let numericCount = 0;
        let dateCount = 0;
        let booleanLikeCount = 0;
        const distinctValues = new Set<string>();

        for (const row of rows) {
            const value = row.rowData?.[columnName];
            if (value == null || value === '') {
                continue;
            }

            nonNullCount += 1;
            distinctValues.add(toDimensionLabel(value));

            if (isNumericValue(value)) {
                numericCount += 1;
            }

            if (parseDateValue(value) != null) {
                dateCount += 1;
            }

            if (toBooleanLikeValue(value) != null) {
                booleanLikeCount += 1;
            }
        }

        const normalizedName = columnName.toLowerCase();
        const dateNameHint = /(date|time|day|week|month|year|created|updated|timestamp|_at$|at$)/.test(normalizedName);
        const metricNameHint =
            /(^|[_\W])(revenue|sales|amount|total|count|users?|sessions?|orders?|duration|value|score|price|cost|profit|qty|quantity|size|avg|average)([_\W]|$)/.test(
                normalizedName,
            );
        const idNameHint = /(^id$|_id$|^id_|identifier|uuid|guid|parent_id$)/.test(normalizedName);
        const dateRatio = nonNullCount > 0 ? dateCount / nonNullCount : 0;
        const numericRatio = nonNullCount > 0 ? numericCount / nonNullCount : 0;
        const booleanRatio = nonNullCount > 0 ? booleanLikeCount / nonNullCount : 0;
        const matched = matchedColumn(columnsRaw, columnName);
        const normalizedType = String(matched?.normalizedType ?? '');
        const semanticRole = matched?.semanticRole == null ? undefined : String(matched.semanticRole);

        let kind: ResultAutoChartColumnKind = 'category';
        if (semanticRole === 'time' || normalizedType === 'date' || normalizedType === 'datetime' || (dateNameHint && dateRatio >= 0.4) || dateRatio >= 0.8) {
            kind = 'date';
        } else if (semanticRole === 'measure' || normalizedType === 'integer' || normalizedType === 'number' || numericRatio >= 0.8) {
            kind = 'numeric';
        }

        return {
            name: columnName,
            kind,
            distinctCount: distinctValues.size,
            metricScore: (metricNameHint ? 10 : 0) + (kind === 'numeric' ? 1 : 0) - (idNameHint ? 5 : 0),
            isBooleanLike: kind === 'numeric' && booleanRatio >= 0.95,
            isIdLike: semanticRole === 'identifier' || (kind === 'numeric' && idNameHint),
            semanticRole,
        };
    });
}

function pickBestMetricColumn(columnProfiles: ResultAutoChartColumnProfile[]) {
    return [...columnProfiles]
        .filter(profile => profile.kind === 'numeric' && !profile.isIdLike)
        .sort((left, right) => right.metricScore - left.metricScore || left.distinctCount - right.distinctCount)[0];
}

function pickBestCategoryColumn(columnProfiles: ResultAutoChartColumnProfile[]) {
    return [...columnProfiles]
        .filter(profile => profile.kind === 'category')
        .sort((left, right) => {
            const leftFits = left.distinctCount > 0 && left.distinctCount <= 24 ? 1 : 0;
            const rightFits = right.distinctCount > 0 && right.distinctCount <= 24 ? 1 : 0;
            return rightFits - leftFits || left.distinctCount - right.distinctCount;
        })[0];
}

function pickBestMetricKey(metricColumn: ResultAutoChartColumnProfile | undefined) {
    if (!metricColumn) return 'count';
    return metricColumn.isBooleanLike ? `count_true:${metricColumn.name}` : `sum:${metricColumn.name}`;
}

function getSuggestedState(columnProfiles: ResultAutoChartColumnProfile[], resultStats?: ResultAutoChartStatsInput): ResultAutoChartState {
    const summary = resultStats?.summary;
    const primaryTimeColumn = summary?.primaryTimeColumn ?? undefined;
    const primaryMeasureColumn = summary?.primaryMeasureColumns?.[0];
    const primaryDimensionColumn = summary?.primaryDimensionColumns?.[0];

    if (summary?.recommendedChart === 'line' && primaryTimeColumn) {
        return {
            chartType: 'line',
            xKey: primaryTimeColumn,
            yKey: primaryMeasureColumn ? `sum:${primaryMeasureColumn}` : 'count',
            groupKey: RESULT_AUTO_CHART_NONE_VALUE,
        };
    }

    if ((summary?.recommendedChart === 'bar' || summary?.recommendedChart === 'pie') && primaryDimensionColumn) {
        return {
            chartType: summary.recommendedChart === 'pie' ? 'pie' : 'bar',
            xKey: primaryDimensionColumn,
            yKey: primaryMeasureColumn ? `sum:${primaryMeasureColumn}` : 'count',
            groupKey: RESULT_AUTO_CHART_NONE_VALUE,
        };
    }

    const dateColumn = columnProfiles.find(profile => profile.kind === 'date');
    const metricColumn = pickBestMetricColumn(columnProfiles);
    const categoryColumn = pickBestCategoryColumn(columnProfiles);
    const metricKey = pickBestMetricKey(metricColumn);

    if (dateColumn && metricColumn) {
        return {
            chartType: 'line',
            xKey: dateColumn.name,
            yKey: metricKey,
            groupKey: RESULT_AUTO_CHART_NONE_VALUE,
        };
    }

    if (dateColumn) {
        return {
            chartType: 'line',
            xKey: dateColumn.name,
            yKey: 'count',
            groupKey: RESULT_AUTO_CHART_NONE_VALUE,
        };
    }

    if (categoryColumn && metricColumn) {
        return {
            chartType: 'bar',
            xKey: categoryColumn.name,
            yKey: metricKey,
            groupKey: RESULT_AUTO_CHART_NONE_VALUE,
        };
    }

    if (categoryColumn) {
        return {
            chartType: 'bar',
            xKey: categoryColumn.name,
            yKey: 'count',
            groupKey: RESULT_AUTO_CHART_NONE_VALUE,
        };
    }

    if (metricColumn) {
        return {
            chartType: 'bar',
            xKey: metricColumn.name,
            yKey: 'count',
            groupKey: RESULT_AUTO_CHART_NONE_VALUE,
        };
    }

    return {
        chartType: 'bar',
        xKey: columnProfiles[0]?.name ?? '',
        yKey: 'count',
        groupKey: RESULT_AUTO_CHART_NONE_VALUE,
    };
}

function isMetricKeyCompatibleWithColumns(metricKey: string, columnNames: string[]) {
    if (metricKey === 'count') {
        return true;
    }

    const separatorIndex = metricKey.indexOf(':');
    if (separatorIndex < 0) {
        return true;
    }

    const column = metricKey.slice(separatorIndex + 1);
    return column ? columnNames.includes(column) : true;
}

function normalizeChartType(value: unknown): ResultAutoChartType | null {
    if (value === 'bar' || value === 'line' || value === 'pie' || value === 'scatter' || value === 'histogram' || value === 'heatmap') {
        return value;
    }
    if (value === 'area') {
        return 'line';
    }
    return null;
}

function normalizeOverrideMetricKey(metricKey: string | undefined, metricOptions: ResultAutoChartMetricOption[]) {
    if (!metricKey) return undefined;
    if (metricOptions.some(option => option.key === metricKey)) return metricKey;
    if (metricKey.includes(':')) return metricKey;
    return (
        metricOptions.find(option => option.column === metricKey && option.kind === 'sum')?.key ??
        metricOptions.find(option => option.column === metricKey && option.kind === 'count_true')?.key ??
        metricOptions.find(option => option.column === metricKey && option.kind === 'count_distinct')?.key ??
        metricKey
    );
}

function applyOverrides(
    state: ResultAutoChartState,
    columnNames: string[],
    metricOptions: ResultAutoChartMetricOption[],
    overrides?: ResultAutoChartOverrides,
): ResultAutoChartState {
    if (!overrides) return state;

    const overrideYKey = normalizeOverrideMetricKey(overrides.yKey ?? overrides.valueKey ?? overrides.yKeys?.[0]?.key, metricOptions);
    const overrideXKey = overrides.xKey ?? overrides.categoryKey;
    const nextChartType = normalizeChartType(overrides.chartType) ?? state.chartType;
    const nextXKey = overrideXKey && columnNames.includes(overrideXKey) ? overrideXKey : state.xKey;
    const nextYKey =
        overrideYKey && metricOptions.some(option => option.key === overrideYKey)
            ? overrideYKey
            : overrideYKey && isMetricKeyCompatibleWithColumns(overrideYKey, columnNames)
              ? overrideYKey
              : state.yKey;
    const nextGroupKey =
        overrides.groupKey && (overrides.groupKey === RESULT_AUTO_CHART_NONE_VALUE || columnNames.includes(overrides.groupKey)) ? overrides.groupKey : state.groupKey;

    return {
        chartType: nextChartType,
        xKey: nextXKey,
        yKey: nextChartType === 'histogram' ? 'count' : nextYKey,
        groupKey: nextChartType === 'pie' || nextChartType === 'histogram' || nextChartType === 'scatter' ? RESULT_AUTO_CHART_NONE_VALUE : nextGroupKey,
    };
}

function buildBucketStrategy(props: {
    rows: ResultAutoChartRow[];
    effectiveXKey: string;
    xProfile?: ResultAutoChartColumnProfile;
    selectedMetric: ResultAutoChartMetricOption;
}): BucketStrategy {
    const { rows, effectiveXKey, xProfile, selectedMetric } = props;
    const rawDistinctCount = getRawDistinctCount(rows, effectiveXKey);

    if (!xProfile || rawDistinctCount <= MAX_BUCKETS) {
        const valueType = xProfile?.kind === 'date' ? 'date' : xProfile?.kind === 'numeric' ? 'number' : null;
        return {
            getBucketLabel: value => toDimensionLabel(value),
            getSortValue: value => {
                const timestamp = parseDateValue(value);
                return timestamp ?? Number.MAX_SAFE_INTEGER;
            },
            getFilterSpec: value => ({ col: effectiveXKey, kind: 'exact', raw: value }),
            getBrushFilterSpec: value => {
                if (!valueType) return null;
                const range = inferSingleValueRange(value, valueType);
                if (!range) return null;
                return {
                    col: effectiveXKey,
                    kind: 'range',
                    from: range.from,
                    to: range.to,
                    valueType,
                    label: toDimensionLabel(value),
                };
            },
            bucketHint: null,
        };
    }

    if (xProfile.kind === 'date') {
        const timestamps = rows.map(row => parseDateValue(row.rowData?.[effectiveXKey])).filter((value): value is number => value != null);
        const granularities: Array<'minute' | 'hour' | 'day' | 'week' | 'month'> = ['minute', 'hour', 'day', 'week', 'month'];
        const granularity =
            granularities.find(candidate => {
                const buckets = new Set(timestamps.map(timestamp => getDateBucketStart(timestamp, candidate)));
                return buckets.size <= MAX_BUCKETS;
            }) ?? 'month';
        const bucketStarts = new Set(timestamps.map(timestamp => getDateBucketStart(timestamp, granularity)));

        return {
            getBucketLabel: value => {
                const timestamp = parseDateValue(value);
                if (timestamp == null) return toDimensionLabel(value);
                return formatDateBucketLabel(getDateBucketStart(timestamp, granularity), granularity);
            },
            getSortValue: value => {
                const timestamp = parseDateValue(value);
                return timestamp == null ? Number.MAX_SAFE_INTEGER : getDateBucketStart(timestamp, granularity);
            },
            getFilterSpec: value => {
                const timestamp = parseDateValue(value);
                if (timestamp == null) return null;
                const from = getDateBucketStart(timestamp, granularity);
                const next = new Date(from);

                if (granularity === 'minute') next.setUTCMinutes(next.getUTCMinutes() + 1);
                else if (granularity === 'hour') next.setUTCHours(next.getUTCHours() + 1);
                else if (granularity === 'day') next.setUTCDate(next.getUTCDate() + 1);
                else if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7);
                else next.setUTCMonth(next.getUTCMonth() + 1);

                return {
                    col: effectiveXKey,
                    kind: 'range',
                    from: new Date(from).toISOString(),
                    to: next.toISOString(),
                    valueType: 'date',
                    label: formatDateBucketLabel(from, granularity),
                };
            },
            getBrushFilterSpec: value => {
                const timestamp = parseDateValue(value);
                if (timestamp == null) return null;
                const from = getDateBucketStart(timestamp, granularity);
                const next = new Date(from);
                if (granularity === 'minute') next.setUTCMinutes(next.getUTCMinutes() + 1);
                else if (granularity === 'hour') next.setUTCHours(next.getUTCHours() + 1);
                else if (granularity === 'day') next.setUTCDate(next.getUTCDate() + 1);
                else if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7);
                else next.setUTCMonth(next.getUTCMonth() + 1);
                return {
                    col: effectiveXKey,
                    kind: 'range',
                    from: new Date(from).toISOString(),
                    to: next.toISOString(),
                    valueType: 'date',
                    label: formatDateBucketLabel(from, granularity),
                };
            },
            bucketHint: `Auto-bucketed to ${bucketStarts.size} groups`,
        };
    }

    if (xProfile.kind === 'numeric') {
        const numericValues = rows.map(row => toNumericValue(row.rowData?.[effectiveXKey])).filter((value): value is number => value != null);
        if (numericValues.length === 0) {
            return {
                getBucketLabel: value => toDimensionLabel(value),
                getSortValue: () => Number.MAX_SAFE_INTEGER,
                getFilterSpec: value => ({ col: effectiveXKey, kind: 'exact', raw: value }),
                getBrushFilterSpec: () => null,
                bucketHint: null,
            };
        }

        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        const binCount = Math.min(NUMERIC_BIN_COUNT, MAX_BUCKETS);
        const binSize = min === max ? 1 : (max - min) / binCount;

        return {
            getBucketLabel: value => {
                const numericValue = toNumericValue(value);
                if (numericValue == null) return toDimensionLabel(value);
                if (min === max) return formatNumberLabel(min);
                const rawIndex = Math.floor((numericValue - min) / binSize);
                const index = Math.min(binCount - 1, Math.max(0, rawIndex));
                const start = min + binSize * index;
                const end = index === binCount - 1 ? max : start + binSize;
                return `${formatNumberLabel(start)}-${formatNumberLabel(end)}`;
            },
            getSortValue: value => {
                const numericValue = toNumericValue(value);
                if (numericValue == null || min === max) return min;
                const rawIndex = Math.floor((numericValue - min) / binSize);
                return Math.min(binCount - 1, Math.max(0, rawIndex));
            },
            getFilterSpec: value => {
                const numericValue = toNumericValue(value);
                if (numericValue == null) return null;
                if (min === max) {
                    return { col: effectiveXKey, kind: 'exact', raw: numericValue };
                }
                const rawIndex = Math.floor((numericValue - min) / binSize);
                const index = Math.min(binCount - 1, Math.max(0, rawIndex));
                const start = min + binSize * index;
                const end = index === binCount - 1 ? max + Number.EPSILON : start + binSize;
                return {
                    col: effectiveXKey,
                    kind: 'range',
                    from: String(start),
                    to: String(end),
                    valueType: 'number',
                    label: `${formatNumberLabel(start)}-${formatNumberLabel(index === binCount - 1 ? max : start + binSize)}`,
                };
            },
            getBrushFilterSpec: value => {
                const numericValue = toNumericValue(value);
                if (numericValue == null) return null;
                if (min === max) {
                    return {
                        col: effectiveXKey,
                        kind: 'range',
                        from: String(min),
                        to: String(min + Number.EPSILON),
                        valueType: 'number',
                        label: formatNumberLabel(min),
                    };
                }
                const rawIndex = Math.floor((numericValue - min) / binSize);
                const index = Math.min(binCount - 1, Math.max(0, rawIndex));
                const start = min + binSize * index;
                const end = index === binCount - 1 ? max + Number.EPSILON : start + binSize;
                return {
                    col: effectiveXKey,
                    kind: 'range',
                    from: String(start),
                    to: String(end),
                    valueType: 'number',
                    label: `${formatNumberLabel(start)}-${formatNumberLabel(index === binCount - 1 ? max : start + binSize)}`,
                };
            },
            bucketHint: `Auto-bucketed to ${binCount} groups`,
        };
    }

    const bucketTotals = new Map<string, number>();
    for (const row of rows) {
        const rowData = row.rowData ?? {};
        const bucketLabel = toDimensionLabel(rowData[effectiveXKey]);
        const metricRawValue = selectedMetric.column ? rowData[selectedMetric.column] : null;
        bucketTotals.set(bucketLabel, (bucketTotals.get(bucketLabel) ?? 0) + getMetricContribution(metricRawValue, selectedMetric));
    }

    const topBuckets = new Set(
        [...bucketTotals.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, TOP_CATEGORY_BUCKETS)
            .map(([label]) => label),
    );

    return {
        getBucketLabel: value => {
            const label = toDimensionLabel(value);
            return topBuckets.has(label) ? label : OTHERS_SERIES_LABEL;
        },
        getSortValue: value => {
            const label = toDimensionLabel(value);
            if (label === OTHERS_SERIES_LABEL || !topBuckets.has(label)) return TOP_CATEGORY_BUCKETS;
            return [...topBuckets].indexOf(label);
        },
        getFilterSpec: value => {
            const label = toDimensionLabel(value);
            if (!topBuckets.has(label)) return null;
            return { col: effectiveXKey, kind: 'exact', raw: value };
        },
        getBrushFilterSpec: () => null,
        bucketHint: `Auto-bucketed to ${Math.min(TOP_CATEGORY_BUCKETS, topBuckets.size) + (bucketTotals.size > TOP_CATEGORY_BUCKETS ? 1 : 0)} groups`,
    };
}

export function aggregateAutoChart(params: {
    rows: Array<ResultAutoChartRow | Record<string, unknown>>;
    profile: Pick<ResultAutoChartProfile, 'chartState' | 'columnProfiles' | 'metricOptions'>;
    overrides?: ResultAutoChartOverrides;
}): ResultAutoChartAggregatedData {
    const rows = normalizeRows(params.rows);
    const columnNames = params.profile.columnProfiles.map(profile => profile.name);
    const chartState = applyOverrides(params.profile.chartState, columnNames, params.profile.metricOptions, params.overrides);
    const effectiveXKey = columnNames.includes(chartState.xKey) ? chartState.xKey : params.profile.chartState.xKey;
    const effectiveGroupKey =
        chartState.groupKey !== RESULT_AUTO_CHART_NONE_VALUE && columnNames.includes(chartState.groupKey) ? chartState.groupKey : RESULT_AUTO_CHART_NONE_VALUE;
    const selectedMetric = params.profile.metricOptions.find(option => option.key === chartState.yKey) ?? params.profile.metricOptions[0] ?? null;

    if (!effectiveXKey || !selectedMetric) {
        return { data: [], series: [], bucketHint: null };
    }

    const xProfile = params.profile.columnProfiles.find(profile => profile.name === effectiveXKey);
    const bucketStrategy = buildBucketStrategy({
        rows,
        effectiveXKey,
        xProfile,
        selectedMetric,
    });
    const groupTotals = new Map<string, number>();
    const dataMap = new Map<string, Record<string, unknown>>();
    const sortMap = new Map<string, number>();
    const seriesMap = new Map<string, string>();
    const avgState = new Map<string, { sum: number; count: number }>();
    const distinctState = new Map<string, Set<string>>();

    if (effectiveGroupKey !== RESULT_AUTO_CHART_NONE_VALUE) {
        for (const row of rows) {
            const rowData = row.rowData ?? {};
            const groupLabel = toDimensionLabel(rowData[effectiveGroupKey]);
            const metricRawValue = selectedMetric.column ? rowData[selectedMetric.column] : null;
            groupTotals.set(groupLabel, (groupTotals.get(groupLabel) ?? 0) + getMetricContribution(metricRawValue, selectedMetric));
        }
    }

    const allowedGroups =
        effectiveGroupKey === RESULT_AUTO_CHART_NONE_VALUE
            ? null
            : new Set(
                  [...groupTotals.entries()]
                      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
                      .slice(0, MAX_GROUP_SERIES)
                      .map(([label]) => label),
              );

    for (const row of rows) {
        const rowData = row.rowData ?? {};
        const rawXValue = rowData[effectiveXKey];
        const xLabel = bucketStrategy.getBucketLabel(rawXValue);
        const rawSeriesLabel = effectiveGroupKey === RESULT_AUTO_CHART_NONE_VALUE ? RESULT_AUTO_CHART_ALL_SERIES_KEY : toDimensionLabel(rowData[effectiveGroupKey]);
        const seriesLabel = effectiveGroupKey !== RESULT_AUTO_CHART_NONE_VALUE && allowedGroups && !allowedGroups.has(rawSeriesLabel) ? OTHERS_SERIES_LABEL : rawSeriesLabel;
        const seriesKey = effectiveGroupKey === RESULT_AUTO_CHART_NONE_VALUE ? RESULT_AUTO_CHART_ALL_SERIES_KEY : toSeriesId(seriesLabel);
        const datumKey = `${xLabel}::${seriesKey}`;
        const metricRawValue = selectedMetric.column ? rowData[selectedMetric.column] : null;

        let datum = dataMap.get(xLabel);
        if (!datum) {
            const sortValue = bucketStrategy.getSortValue(rawXValue);
            datum = {
                xLabel,
                __xSort: sortValue,
                __xFilter: bucketStrategy.getFilterSpec(rawXValue),
                __xBrushFilter: bucketStrategy.getBrushFilterSpec(rawXValue),
            };
            dataMap.set(xLabel, datum);
            sortMap.set(xLabel, sortValue);
        }

        if (selectedMetric.kind === 'count') {
            datum[seriesKey] = typeof datum[seriesKey] === 'number' ? Number(datum[seriesKey]) + 1 : 1;
            seriesMap.set(seriesKey, seriesLabel);
        } else if (selectedMetric.kind === 'count_true') {
            const truthy = toBooleanLikeValue(metricRawValue);
            if (truthy == null) {
                continue;
            }
            datum[seriesKey] = typeof datum[seriesKey] === 'number' ? Number(datum[seriesKey]) + (truthy ? 1 : 0) : truthy ? 1 : 0;
            seriesMap.set(seriesKey, seriesLabel);
        } else if (selectedMetric.kind === 'count_distinct') {
            if (metricRawValue == null || metricRawValue === '') {
                continue;
            }
            let distinctValues = distinctState.get(datumKey);
            if (!distinctValues) {
                distinctValues = new Set<string>();
                distinctState.set(datumKey, distinctValues);
            }
            distinctValues.add(toDimensionLabel(metricRawValue));
            datum[seriesKey] = distinctValues.size;
            seriesMap.set(seriesKey, seriesLabel);
        } else {
            const numericValue = selectedMetric.column ? toNumericValue(metricRawValue) : null;
            if (numericValue == null) {
                continue;
            }

            if (selectedMetric.kind === 'sum') {
                datum[seriesKey] = typeof datum[seriesKey] === 'number' ? Number(datum[seriesKey]) + numericValue : numericValue;
            } else if (selectedMetric.kind === 'avg') {
                const state = avgState.get(datumKey) ?? { sum: 0, count: 0 };
                state.sum += numericValue;
                state.count += 1;
                avgState.set(datumKey, state);
                datum[seriesKey] = state.sum / state.count;
            } else if (selectedMetric.kind === 'max') {
                datum[seriesKey] = typeof datum[seriesKey] === 'number' ? Math.max(Number(datum[seriesKey]), numericValue) : numericValue;
            } else if (selectedMetric.kind === 'min') {
                datum[seriesKey] = typeof datum[seriesKey] === 'number' ? Math.min(Number(datum[seriesKey]), numericValue) : numericValue;
            }

            seriesMap.set(seriesKey, seriesLabel);
        }
    }

    return {
        data: Array.from(dataMap.values())
            .sort((left, right) => {
                const leftSort = sortMap.get(String(left.xLabel)) ?? 0;
                const rightSort = sortMap.get(String(right.xLabel)) ?? 0;
                return leftSort - rightSort;
            })
            .slice(0, MAX_BUCKETS),
        series: Array.from(seriesMap.entries()).map(([key, label]) => ({ key, label })),
        bucketHint: bucketStrategy.bucketHint,
    };
}

export function buildResultAutoChartProfile(params: {
    rows: Array<ResultAutoChartRow | Record<string, unknown>>;
    columns?: unknown;
    stats?: ResultAutoChartStatsInput;
    overrides?: ResultAutoChartOverrides;
}): ResultAutoChartProfile {
    const rows = normalizeRows(params.rows);
    const columnNames = getResultAutoChartColumnNames(params.columns, rows);
    const columnProfiles = analyzeResultAutoChartColumns(columnNames, rows, params.columns);
    const metricOptions = buildResultAutoChartMetricOptions(columnProfiles);
    const suggestedState = getSuggestedState(columnProfiles, params.stats);
    const chartState = applyOverrides(suggestedState, columnNames, metricOptions, params.overrides);
    const profileBase = {
        version: RESULT_AUTO_CHART_PROFILE_VERSION,
        chartState,
        metricOptions,
        columnNames,
        columnProfiles,
    } satisfies Omit<ResultAutoChartProfile, 'aggregated' | 'emptyReason' | 'confidence'>;
    const aggregated = aggregateAutoChart({
        rows,
        profile: profileBase,
    });
    const emptyReason = getAutoChartEmptyReason({
        columnNames,
        effectiveXKey: chartState.xKey,
        hasRenderableData: aggregated.data.length > 0 && aggregated.series.length > 0,
        selectedMetric: metricOptions.find(option => option.key === chartState.yKey) ?? metricOptions[0] ?? null,
    });

    return {
        ...profileBase,
        aggregated,
        emptyReason,
        confidence: emptyReason ? 0.2 : params.stats?.summary?.isGoodForChart ? 0.95 : 0.75,
    };
}

export function getAutoChartEmptyReason(props: { columnNames: string[]; effectiveXKey: string; hasRenderableData: boolean; selectedMetric: ResultAutoChartMetricOption | null }) {
    const { columnNames, effectiveXKey, hasRenderableData, selectedMetric } = props;

    if (columnNames.length === 0) {
        return 'No columns available for charting.';
    }

    if (!selectedMetric || !effectiveXKey) {
        return 'Choose chart dimensions to preview.';
    }

    if (!hasRenderableData) {
        return 'No chartable values for the current selection.';
    }

    return null;
}

function chartResultType(chartType: ResultAutoChartType): ResultAutoChartPart['chartType'] {
    if (chartType === 'line') return 'line';
    if (chartType === 'pie') return 'pie';
    return 'bar';
}

function xKeyType(profile: ResultAutoChartProfile): 'time' | 'category' | 'number' | undefined {
    const xProfile = profile.columnProfiles.find(column => column.name === profile.chartState.xKey);
    if (!xProfile) return undefined;
    if (xProfile.kind === 'date') return 'time';
    if (xProfile.kind === 'numeric') return 'number';
    return 'category';
}

export function toChartResultPart(profile: ResultAutoChartProfile, options?: { title?: string; description?: string }): ResultAutoChartPart | null {
    if (profile.emptyReason || !profile.aggregated.data.length || !profile.aggregated.series.length) {
        return null;
    }

    const chartType = chartResultType(profile.chartState.chartType);
    const yKeys = profile.aggregated.series.map(series => ({
        key: series.key,
        label: series.label === RESULT_AUTO_CHART_ALL_SERIES_KEY ? (profile.metricOptions.find(option => option.key === profile.chartState.yKey)?.label ?? 'Value') : series.label,
    }));

    return {
        type: 'chart',
        chartType,
        title: options?.title,
        description: options?.description ?? profile.aggregated.bucketHint ?? undefined,
        data: profile.aggregated.data,
        xKey: 'xLabel',
        yKeys,
        categoryKey: chartType === 'pie' ? 'xLabel' : undefined,
        valueKey: chartType === 'pie' ? yKeys[0]?.key : undefined,
        options: {
            xKeyType: xKeyType(profile),
            sortBy: xKeyType(profile) === 'time' || xKeyType(profile) === 'number' ? 'x' : undefined,
        },
    };
}
