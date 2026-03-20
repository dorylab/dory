'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';

import { type ChartConfig } from '@/registry/new-york-v4/ui/chart';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { ChartView } from './chart-view';
import { type AggregatedChartData, ALL_SERIES_KEY, CHART_COLOR_PRESETS, type ChartColorPreset, type ChartRow, type ChartState, type ChartType, type MetricOption, NONE_VALUE } from './chart-shared';
import { buildEqualsFilterFromCell } from '../../vtable/filter';
import { type ColumnFilter } from '../../vtable/type';

type ChartsProps = {
    rows: ChartRow[];
    columnsRaw?: unknown;
    className?: string;
    onApplyFilters?: (filters: ColumnFilter[], options?: { append?: boolean }) => void;
    onResetState?: () => void;
    stateKey?: string;
    initialState?: Partial<ChartState>;
    onStateChange?: (state: ChartState) => void;
    stateSyncEnabled?: boolean;
};

type ColumnKind = 'date' | 'numeric' | 'category';

type ColumnProfile = {
    name: string;
    kind: ColumnKind;
    distinctCount: number;
    metricScore: number;
    isBooleanLike: boolean;
    isIdLike: boolean;
};

type SuggestedChartState = {
    chartType: ChartType;
    xKey: string;
    yKey: string;
    groupKey: string;
};

type ChartFilterSpec =
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

type ChartApplyMode = {
    append?: boolean;
};

type BucketStrategy = {
    getBucketLabel: (value: unknown) => string;
    getSortValue: (value: unknown) => number;
    getFilterSpec: (value: unknown) => ChartFilterSpec | null;
    getBrushFilterSpec: (value: unknown) => Extract<ChartFilterSpec, { kind: 'range' }> | null;
    bucketHint: string | null;
};

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

function getMetricContribution(value: unknown, metric: MetricOption) {
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

function getRawDistinctCount(rows: ChartRow[], key: string) {
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

function getColumnNames(columnsRaw: unknown, rows: ChartRow[]) {
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

function getColumnType(columnsRaw: unknown, columnName: string) {
    if (!Array.isArray(columnsRaw)) {
        return null;
    }

    const matched = columnsRaw.find(column => column && typeof column === 'object' && 'name' in column && String((column as { name?: unknown }).name ?? '') === columnName) as
        | { type?: unknown }
        | undefined;

    return matched?.type == null ? null : String(matched.type);
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

function buildMetricOptions(columnProfiles: ColumnProfile[]) {
    const options: MetricOption[] = [{ key: 'count', label: 'Count', kind: 'count' }];

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

function analyzeColumns(columnNames: string[], rows: ChartRow[]) {
    return columnNames.map<ColumnProfile>(columnName => {
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
        const metricNameHint = /(revenue|sales|amount|total|count|users?|sessions?|orders?|duration|value|score|price|cost|profit|qty|quantity|size|avg|average)/.test(normalizedName);
        const idNameHint = /(^id$|_id$|^id_|identifier|uuid|guid|parent_id$)/.test(normalizedName);
        const dateRatio = nonNullCount > 0 ? dateCount / nonNullCount : 0;
        const numericRatio = nonNullCount > 0 ? numericCount / nonNullCount : 0;
        const booleanRatio = nonNullCount > 0 ? booleanLikeCount / nonNullCount : 0;

        let kind: ColumnKind = 'category';
        if ((dateNameHint && dateRatio >= 0.4) || dateRatio >= 0.8) {
            kind = 'date';
        } else if (numericRatio >= 0.8) {
            kind = 'numeric';
        }

        return {
            name: columnName,
            kind,
            distinctCount: distinctValues.size,
            metricScore: (metricNameHint ? 10 : 0) + (kind === 'numeric' ? 1 : 0) - (idNameHint ? 5 : 0),
            isBooleanLike: kind === 'numeric' && booleanRatio >= 0.95,
            isIdLike: kind === 'numeric' && idNameHint,
        };
    });
}

function pickBestMetricColumn(columnProfiles: ColumnProfile[]) {
    return [...columnProfiles]
        .filter(profile => profile.kind === 'numeric' && !profile.isIdLike)
        .sort((left, right) => right.metricScore - left.metricScore || left.distinctCount - right.distinctCount)[0];
}

function pickBestCategoryColumn(columnProfiles: ColumnProfile[]) {
    return [...columnProfiles]
        .filter(profile => profile.kind === 'category')
        .sort((left, right) => {
            const leftFits = left.distinctCount > 0 && left.distinctCount <= 24 ? 1 : 0;
            const rightFits = right.distinctCount > 0 && right.distinctCount <= 24 ? 1 : 0;
            return rightFits - leftFits || left.distinctCount - right.distinctCount;
        })[0];
}

function getSuggestedState(columnProfiles: ColumnProfile[]): SuggestedChartState {
    const dateColumn = columnProfiles.find(profile => profile.kind === 'date');
    const metricColumn = pickBestMetricColumn(columnProfiles);
    const categoryColumn = pickBestCategoryColumn(columnProfiles);
    const metricKey = metricColumn ? (metricColumn.isBooleanLike ? `count_true:${metricColumn.name}` : `sum:${metricColumn.name}`) : 'count';

    if (dateColumn && metricColumn) {
        return {
            chartType: 'line',
            xKey: dateColumn.name,
            yKey: metricKey,
            groupKey: NONE_VALUE,
        };
    }

    if (dateColumn) {
        return {
            chartType: 'line',
            xKey: dateColumn.name,
            yKey: 'count',
            groupKey: NONE_VALUE,
        };
    }

    if (categoryColumn && metricColumn) {
        return {
            chartType: 'bar',
            xKey: categoryColumn.name,
            yKey: metricKey,
            groupKey: NONE_VALUE,
        };
    }

    if (categoryColumn) {
        return {
            chartType: 'bar',
            xKey: categoryColumn.name,
            yKey: 'count',
            groupKey: NONE_VALUE,
        };
    }

    if (metricColumn) {
        return {
            chartType: 'bar',
            xKey: metricColumn.name,
            yKey: 'count',
            groupKey: NONE_VALUE,
        };
    }

    return {
        chartType: 'bar' as ChartType,
        xKey: columnProfiles[0]?.name ?? '',
        yKey: 'count',
        groupKey: NONE_VALUE,
    };
}

function buildBucketStrategy(props: {
    rows: ChartRow[];
    effectiveXKey: string;
    xProfile?: ColumnProfile;
    selectedMetric: MetricOption;
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

function aggregateByDimension(props: {
    rows: ChartRow[];
    effectiveXKey: string;
    effectiveGroupKey: string;
    selectedMetric: MetricOption;
    columnProfiles: ColumnProfile[];
}): AggregatedChartData {
    const { rows, effectiveXKey, effectiveGroupKey, selectedMetric, columnProfiles } = props;
    const xProfile = columnProfiles.find(profile => profile.name === effectiveXKey);
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

    if (effectiveGroupKey !== NONE_VALUE) {
        for (const row of rows) {
            const rowData = row.rowData ?? {};
            const groupLabel = toDimensionLabel(rowData[effectiveGroupKey]);
            const metricRawValue = selectedMetric.column ? rowData[selectedMetric.column] : null;
            groupTotals.set(groupLabel, (groupTotals.get(groupLabel) ?? 0) + getMetricContribution(metricRawValue, selectedMetric));
        }
    }

    const allowedGroups =
        effectiveGroupKey === NONE_VALUE
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
        const rawSeriesLabel = effectiveGroupKey === NONE_VALUE ? ALL_SERIES_KEY : toDimensionLabel(rowData[effectiveGroupKey]);
        const seriesLabel = effectiveGroupKey !== NONE_VALUE && allowedGroups && !allowedGroups.has(rawSeriesLabel) ? OTHERS_SERIES_LABEL : rawSeriesLabel;
        const seriesKey = effectiveGroupKey === NONE_VALUE ? ALL_SERIES_KEY : toSeriesId(seriesLabel);
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

function mergeChartState(suggestedState: SuggestedChartState, initialState?: Partial<ChartState>): ChartState {
    return {
        chartType: initialState?.chartType ?? suggestedState.chartType,
        xKey: initialState?.xKey ?? suggestedState.xKey,
        yKey: initialState?.yKey ?? suggestedState.yKey,
        groupKey: initialState?.groupKey ?? suggestedState.groupKey,
        chartColorPreset: initialState?.chartColorPreset ?? 'blue',
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

export function Charts({ rows, columnsRaw, className, onApplyFilters, onResetState, stateKey, initialState, onStateChange, stateSyncEnabled = true }: ChartsProps) {
    const { resolvedTheme } = useTheme();
    const columnNames = useMemo(() => getColumnNames(columnsRaw, rows), [columnsRaw, rows]);
    const columnProfiles = useMemo(() => analyzeColumns(columnNames, rows), [columnNames, rows]);
    const suggestedState = useMemo(() => getSuggestedState(columnProfiles), [columnProfiles]);
    const mergedInitialState = useMemo(() => mergeChartState(suggestedState, initialState), [initialState, suggestedState]);
    const hasPersistedState = Boolean(initialState && (initialState.xKey || initialState.yKey || initialState.groupKey || initialState.chartType));
    const lastAppliedStateKeyRef = React.useRef<string | undefined>(stateKey);
    const previousStateKeyRef = React.useRef<string | undefined>(stateKey);
    const skipNextStateEmitRef = React.useRef(false);

    const [chartType, setChartType] = useState<ChartType>(() => mergedInitialState.chartType);
    const [xKey, setXKey] = useState(() => mergedInitialState.xKey);
    const [yKey, setYKey] = useState(() => mergedInitialState.yKey);
    const [groupKey, setGroupKey] = useState(() => mergedInitialState.groupKey);
    const [timelineSliderEnabled, setTimelineSliderEnabled] = useState(false);
    const [chartColorPreset, setChartColorPreset] = useState<ChartColorPreset>(() => (mergedInitialState.chartColorPreset as ChartColorPreset | undefined) ?? 'blue');

    const metricOptions = useMemo<MetricOption[]>(() => buildMetricOptions(columnProfiles), [columnProfiles]);

    const selectedMetric = useMemo(() => metricOptions.find(option => option.key === yKey) ?? metricOptions[0] ?? null, [metricOptions, yKey]);

    const effectiveXKey = columnNames.includes(xKey) ? xKey : suggestedState.xKey;
    const effectiveGroupKey = groupKey !== NONE_VALUE && columnNames.includes(groupKey) ? groupKey : NONE_VALUE;

    useEffect(() => {
        if (previousStateKeyRef.current !== stateKey) {
            skipNextStateEmitRef.current = true;
            previousStateKeyRef.current = stateKey;
        }
    }, [stateKey]);

    useEffect(() => {
        if (lastAppliedStateKeyRef.current === stateKey) {
            return;
        }

        lastAppliedStateKeyRef.current = stateKey;
        setChartType(mergedInitialState.chartType);
        setXKey(mergedInitialState.xKey);
        setYKey(mergedInitialState.yKey);
        setGroupKey(mergedInitialState.groupKey);
        setChartColorPreset((mergedInitialState.chartColorPreset as ChartColorPreset | undefined) ?? 'blue');
        setTimelineSliderEnabled(false);
    }, [mergedInitialState.chartColorPreset, mergedInitialState.chartType, mergedInitialState.groupKey, mergedInitialState.xKey, mergedInitialState.yKey, stateKey]);

    useEffect(() => {
        if (!stateSyncEnabled || hasPersistedState) {
            return;
        }
        if (columnNames.length === 0) {
            return;
        }
        if (!columnNames.includes(xKey)) {
            setXKey(suggestedState.xKey);
        }
    }, [columnNames, hasPersistedState, stateSyncEnabled, suggestedState.xKey, xKey]);

    useEffect(() => {
        if (!stateSyncEnabled || hasPersistedState) {
            return;
        }
        if (columnNames.length === 0) {
            return;
        }
        if (!isMetricKeyCompatibleWithColumns(yKey, columnNames)) {
            setYKey(suggestedState.yKey);
        }
    }, [columnNames, hasPersistedState, stateSyncEnabled, suggestedState.yKey, yKey]);

    useEffect(() => {
        if (!stateSyncEnabled || hasPersistedState) {
            return;
        }
        if (columnNames.length === 0) {
            return;
        }
        if (groupKey !== NONE_VALUE && !columnNames.includes(groupKey)) {
            setGroupKey(suggestedState.groupKey);
        }
    }, [columnNames, groupKey, hasPersistedState, stateSyncEnabled, suggestedState.groupKey]);

    useEffect(() => {
        if (!stateSyncEnabled) {
            return;
        }
        if (skipNextStateEmitRef.current) {
            skipNextStateEmitRef.current = false;
            return;
        }
        onStateChange?.({
            chartType,
            xKey,
            yKey,
            groupKey,
            chartColorPreset,
        });
    }, [chartColorPreset, chartType, groupKey, onStateChange, stateSyncEnabled, xKey, yKey]);

    const chartStateIsAuto = chartType === suggestedState.chartType && xKey === suggestedState.xKey && yKey === suggestedState.yKey && groupKey === suggestedState.groupKey;

    const aggregated = useMemo<AggregatedChartData>(() => {
        if (!effectiveXKey || !selectedMetric) {
            return { data: [], series: [], bucketHint: null };
        }

        return aggregateByDimension({
            rows,
            effectiveXKey,
            effectiveGroupKey,
            selectedMetric,
            columnProfiles,
        });
    }, [columnProfiles, effectiveGroupKey, effectiveXKey, rows, selectedMetric]);

    const activeColorPreset = useMemo(
        () => CHART_COLOR_PRESETS.find(preset => preset.value === chartColorPreset) ?? CHART_COLOR_PRESETS[0],
        [chartColorPreset],
    );
    const chartColors = useMemo(() => {
        const isDark = resolvedTheme === 'dark';
        return isDark ? activeColorPreset.colors.dark : activeColorPreset.colors.light;
    }, [activeColorPreset, resolvedTheme]);

    const chartConfig = useMemo<ChartConfig>(() => {
        const config: ChartConfig = {};

        aggregated.series.forEach((series, index) => {
            config[series.key] = {
                label: series.label === ALL_SERIES_KEY ? (selectedMetric?.label ?? 'Value') : series.label,
                color: chartColors[index % chartColors.length],
            };
        });

        return config;
    }, [aggregated.series, chartColors, selectedMetric]);

    const pickFallbackGroupKey = React.useCallback(
        (nextXKey: string) => {
            const category = columnProfiles.find(profile => profile.kind === 'category' && profile.name !== nextXKey);
            if (category) {
                return category.name;
            }

            const fallback = columnNames.find(columnName => columnName !== nextXKey);
            return fallback ?? NONE_VALUE;
        },
        [columnNames, columnProfiles],
    );

    const handleChartFilter = (filters: ChartFilterSpec[], mode?: ChartApplyMode) => {
        if (!onApplyFilters) {
            return;
        }

        const nextFilters: ColumnFilter[] = [];
        for (const filter of filters) {
            if (filter.kind === 'exact') {
                nextFilters.push(
                    buildEqualsFilterFromCell({
                        colName: filter.col,
                        colType: getColumnType(columnsRaw, filter.col),
                        raw: filter.raw,
                    }),
                );
                continue;
            }

            nextFilters.push({
                col: filter.col,
                kind: 'range',
                op: 'range',
                value: filter.from,
                valueTo: filter.to,
                rangeValueType: filter.valueType,
                label: filter.label,
                caseSensitive: false,
            });
        }

        if (nextFilters.length > 0) {
            onApplyFilters(nextFilters, mode);
        }
    };

    const hasRenderableData = aggregated.data.length > 0 && aggregated.series.length > 0;
    const emptyMessage = getChartEmptyMessage({
        columnNames,
        effectiveXKey,
        hasRenderableData,
        selectedMetric,
    });

    return (
        <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
            <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
                <ChartView
                    chartState={{ chartType, xKey, yKey, groupKey }}
                    chartStateIsAuto={chartStateIsAuto}
                    columnNames={columnNames}
                    metricOptions={metricOptions}
                    effectiveXKey={effectiveXKey}
                    effectiveYLabel={selectedMetric?.label ?? yKey}
                    effectiveGroupKey={effectiveGroupKey}
                    chartColorPreset={chartColorPreset}
                    chartColorPresetOptions={CHART_COLOR_PRESETS.map(option => ({
                        value: option.value,
                        label: option.label,
                        preview: (resolvedTheme === 'dark' ? option.colors.dark : option.colors.light).slice(0, 3),
                    }))}
                    chartColors={chartColors}
                    aggregated={aggregated}
                    chartConfig={chartConfig}
                    emptyMessage={emptyMessage}
                    timelineSliderEnabled={timelineSliderEnabled}
                    onApplyChartFilter={handleChartFilter}
                    onChartTypeChange={value => {
                        if (value === 'bar' || value === 'line' || value === 'pie' || value === 'scatter' || value === 'histogram' || value === 'heatmap') {
                            setChartType(value);
                            if (value === 'pie' || value === 'scatter' || value === 'histogram') {
                                setGroupKey(NONE_VALUE);
                            }
                            if (value === 'histogram') {
                                setYKey('count');
                            }
                            if (value === 'heatmap') {
                                setGroupKey(previous => {
                                    if (previous !== NONE_VALUE && columnNames.includes(previous) && previous !== effectiveXKey) {
                                        return previous;
                                    }
                                    return pickFallbackGroupKey(effectiveXKey);
                                });
                            }
                        }
                    }}
                    onXKeyChange={setXKey}
                    onYKeyChange={setYKey}
                    onGroupKeyChange={setGroupKey}
                    onChartColorPresetChange={value => {
                        const matched = CHART_COLOR_PRESETS.find(option => option.value === value);
                        if (matched) {
                            setChartColorPreset(matched.value);
                        }
                    }}
                    onTimelineSliderEnabledChange={setTimelineSliderEnabled}
                    onResetAuto={() => {
                        if (onResetState) {
                            onResetState();
                            return;
                        }
                        setChartType(suggestedState.chartType);
                        setXKey(suggestedState.xKey);
                        setYKey(suggestedState.yKey);
                        setGroupKey(suggestedState.groupKey);
                    }}
                />
            </div>
        </div>
    );
}

function getChartEmptyMessage(props: {
    columnNames: string[];
    effectiveXKey: string;
    hasRenderableData: boolean;
    selectedMetric: MetricOption | null;
}) {
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
