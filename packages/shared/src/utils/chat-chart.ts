import type { ChartOptions, ChartOverride, ChartPresentation, ChartResultPart, ChartValueFormat } from '../types/chat-chart';

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

export function chartNumber(value: unknown): number | null {
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
}

/** Only explicit calendar formats; never feed arbitrary identifiers to Date.parse. */
export function chartTime(value: unknown): number | null {
    const label = String(value ?? '').trim();
    const shortFiscal = label.match(/^FY(\d{2})[- ]?Q([1-4])$/i);
    if (shortFiscal) return (2000 + Number(shortFiscal[1])) * 12 + (Number(shortFiscal[2]) - 1) * 3;
    const period = label.match(/^(?:FY)?(\d{4})(?:[- ]?Q([1-4]))?$/i);
    if (period) return Number(period[1]) * 12 + (Number(period[2] ?? 1) - 1) * 3;
    const month = label.match(/^(\d{4})-(\d{2})$/);
    if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) return Number(month[1]) * 12 + Number(month[2]) - 1;
    const iso = label.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if (!iso) return null;
    const calendarDay = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    if (calendarDay.getUTCMonth() !== Number(iso[2]) - 1 || calendarDay.getUTCDate() !== Number(iso[3])) return null;
    const timestamp = Date.parse(label);
    if (!Number.isFinite(timestamp)) return null;
    const date = new Date(timestamp);
    return (
        date.getUTCFullYear() * 12 +
        date.getUTCMonth() +
        (date.getUTCDate() - 1 + (date.getUTCHours() + date.getUTCMinutes() / 60 + (date.getUTCSeconds() + date.getUTCMilliseconds() / 1000) / 3600) / 24) / 32
    );
}

export function chartAxis(result: ChartPresentation) {
    return result.chartType === 'pie' ? (result.categoryKey ?? result.xKey) : (result.xKey ?? result.categoryKey);
}
export function chartSeries(result: ChartPresentation) {
    return result.yKeys?.length ? result.yKeys : result.valueKey ? [{ key: result.valueKey }] : [];
}

export function isChartTimeAxis(result: ChartPresentation, rows: Record<string, unknown>[]) {
    if (result.options?.xKeyType) return result.options.xKeyType === 'time';
    const key = chartAxis(result);
    if (!key || /(?:^|_)(?:id|code|编号)(?:$|_)/i.test(key)) return false;
    const values = rows.map(row => row[key]).filter(value => value != null && value !== '');
    if (!values.length || !values.every(value => chartTime(value) !== null)) return false;
    // Bare years require a temporal column name, so customer codes stay categorical.
    return /year|date|time|month|quarter|period|fiscal|年|月|季|日期/i.test(key) || values.every(value => /[-T]|FY|Q/i.test(String(value)));
}

export function chartRows(result: ChartResultPart, normalizeValues = true): Record<string, unknown>[] {
    const x = chartAxis(result);
    const ys = chartSeries(result);
    const rows = result.data.map(row => ({
        ...row,
        ...(normalizeValues ? Object.fromEntries(ys.map(series => [series.key, chartNumber(row[series.key])])) : {}),
        // Recharts categorical axes accept strings/numbers, not boolean SQL columns.
        ...(normalizeValues && x && typeof row[x] === 'boolean' ? { [x]: String(row[x]) } : {}),
    }));
    if (!x || result.options?.sortDirection === 'none') return rows;
    const time = isChartTimeAxis(result, rows);
    if (!time && !result.options?.sortBy) return rows;
    const key = result.options?.sortBy === 'value' ? ys[0]?.key : x;
    if (!key) return rows;
    const numeric = result.options?.sortBy === 'value' || result.options?.xKeyType === 'number';
    const direction = result.options?.sortDirection === 'desc' ? -1 : 1;
    return rows.sort((a, b) => {
        const av = time && key === x ? chartTime(a[key]) : numeric ? chartNumber(a[key]) : a[key];
        const bv = time && key === x ? chartTime(b[key]) : numeric ? chartNumber(b[key]) : b[key];
        if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1;
        return direction * (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'en', { numeric: true }));
    });
}

export function chartTimeRange(result: ChartResultPart): [string, string] | null {
    const x = chartAxis(result);
    if (!x || !isChartTimeAxis(result, result.data)) return null;
    const periods = result.data.filter(row => chartTime(row[x]) !== null).sort((a, b) => chartTime(a[x])! - chartTime(b[x])!);
    return periods.length ? [String(periods[0][x]), String(periods.at(-1)![x])] : null;
}

export function hasDuplicateChartX(result: ChartResultPart) {
    const key = chartAxis(result);
    if (!key) return false;
    const values = result.data.map(row => String(row[key] ?? ''));
    return new Set(values).size !== values.length;
}

/** Bounded, factual guidance for the agent; this never changes source rows. */
export function chartGrainDiagnostic(rows: Record<string, unknown>[], xKey: string): string | null {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
        const key = String(row[xKey] ?? '');
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
    }
    const duplicates = [...groups.values()].filter(group => group.length > 1);
    if (!duplicates.length) return null;
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const varying = columns.filter(key => key !== xKey && duplicates.some(group => new Set(group.map(row => JSON.stringify(row[key]))).size > 1));
    return `Repeated X values in ${JSON.stringify(xKey)}: ${duplicates.length} repeated groups. Columns varying within those groups: ${JSON.stringify(varying.slice(0, 12))}. Query one row per X and one column per metric before charting; filter to comparable periods and pivot long-form metrics in SQL. Do not silently sum or discard rows.`;
}

export function validateChartPresentation(result: ChartResultPart): 'invalid-fields' | 'duplicate-x' | 'incomplete' | null {
    const x = chartAxis(result);
    const ys = chartSeries(result);
    if (
        !x ||
        !ys.length ||
        !result.data.length ||
        !result.data.every(row => Object.hasOwn(row, x)) ||
        ys.some(series => !result.data.some(row => chartNumber(row[series.key]) !== null))
    )
        return 'invalid-fields';
    if (hasDuplicateChartX(result)) return 'duplicate-x';
    if (result.chartType === 'pie') {
        if (result.source?.truncated) return 'incomplete';
        if (
            ys.length !== 1 ||
            result.data.some(row => chartNumber(row[ys[0].key]) === null || Number(row[ys[0].key]) < 0) ||
            result.data.reduce((sum, row) => sum + Number(row[ys[0].key]), 0) <= 0
        )
            return 'invalid-fields';
    }
    return null;
}

export function formatChartNumber(value: unknown, format?: ChartValueFormat, locale = 'en', compact = false) {
    const number = chartNumber(value);
    if (number === null) return '—';
    const scale = format?.scale && format.scale > 0 ? format.scale : 1;
    const precision = format?.precision ?? 2;
    const formatted = new Intl.NumberFormat(locale, {
        minimumFractionDigits: compact ? 0 : precision,
        maximumFractionDigits: precision,
        notation: compact && !format?.scale ? 'compact' : 'standard',
    }).format(number / scale);
    return `${format?.prefix ?? ''}${formatted}${format?.suffix ?? ''}`;
}

export function readChartOptions(value: unknown): ChartOptions | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const input = record(value);
    const format = record(input.valueFormat);
    return {
        ...(typeof input.stacked === 'boolean' ? { stacked: input.stacked } : {}),
        ...(['time', 'category', 'number'].includes(String(input.xKeyType)) ? { xKeyType: input.xKeyType as ChartOptions['xKeyType'] } : {}),
        ...(['x', 'value'].includes(String(input.sortBy)) ? { sortBy: input.sortBy as ChartOptions['sortBy'] } : {}),
        ...(['asc', 'desc', 'none'].includes(String(input.sortDirection)) ? { sortDirection: input.sortDirection as ChartOptions['sortDirection'] } : {}),
        xAxisLabel: text(input.xAxisLabel),
        yAxisLabel: text(input.yAxisLabel),
        ...(input.valueFormat
            ? {
                  valueFormat: {
                      scale: typeof format.scale === 'number' && Number.isFinite(format.scale) && format.scale > 0 ? format.scale : undefined,
                      precision:
                          typeof format.precision === 'number' && Number.isInteger(format.precision) && format.precision >= 0 && format.precision <= 12
                              ? format.precision
                              : undefined,
                      prefix: text(format.prefix),
                      suffix: text(format.suffix),
                  },
              }
            : {}),
    };
}

export function readStoredChart(value: unknown): ChartResultPart | null {
    const part = record(value);
    const wrapped = record(part.output ?? part.result ?? part.data ?? part.value);
    const candidate = wrapped.type === 'json' ? record(wrapped.value) : wrapped;
    if (candidate.type !== 'chart' || !['bar', 'line', 'area', 'pie'].includes(String(candidate.chartType))) return null;
    const source = record(candidate.source);
    const result: ChartResultPart = {
        type: 'chart',
        chartType: candidate.chartType as ChartResultPart['chartType'],
        title: text(candidate.title),
        description: text(candidate.description),
        xKey: text(candidate.xKey),
        categoryKey: text(candidate.categoryKey),
        valueKey: text(candidate.valueKey),
        yKeys: Array.isArray(candidate.yKeys)
            ? candidate.yKeys
                  .map(record)
                  .filter(series => typeof series.key === 'string')
                  .map(series => ({ key: String(series.key), label: text(series.label), color: text(series.color) }))
            : undefined,
        options: readChartOptions(candidate.options),
        data: Array.isArray(candidate.data) ? candidate.data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row)) : [],
        dataState: ['ready', 'empty', 'missing', 'invalid-fields', 'incomplete', 'duplicate-x'].includes(String(candidate.dataState))
            ? (candidate.dataState as ChartResultPart['dataState'])
            : undefined,
        source: candidate.source
            ? {
                  artifactId: text(source.artifactId),
                  toolCallId: text(source.toolCallId),
                  rowCount: typeof source.rowCount === 'number' ? source.rowCount : undefined,
                  truncated: source.truncated === true,
                  columns: Array.isArray(source.columns) ? source.columns.filter((v): v is string => typeof v === 'string') : undefined,
                  sql: text(source.sql),
                  database: text(source.database),
              }
            : undefined,
    };
    // Older tool outputs omitted fields and relied on renderer defaults. Infer
    // only field mappings; never aggregate, filter, or replace their evidence.
    const x = chartAxis(result) ?? Object.keys(result.data[0] ?? {})[0];
    if (x && !chartAxis(result)) result.xKey = x;
    if (!chartSeries(result).length) {
        const y = Object.keys(result.data[0] ?? {}).find(key => key !== x && result.data.some(row => chartNumber(row[key]) !== null));
        if (y) result.yKeys = [{ key: y }];
    }
    return result;
}

export function getChartOverride(metadata: unknown, toolCallId: string): ChartOverride {
    const entry = record(record(record(metadata).chartOverrides)[toolCallId]);
    const version = typeof entry.version === 'number' && Number.isInteger(entry.version) && entry.version >= 0 ? entry.version : 0;
    const parsed = readStoredChart({ output: { ...record(entry.presentation), type: 'chart', data: [] } });
    return { version, presentation: parsed ? chartPresentation(parsed) : null };
}
export function chartPresentation(result: ChartPresentation): ChartPresentation {
    const { chartType, title, description, xKey, yKeys, categoryKey, valueKey, options } = result;
    return { chartType, title, description, xKey, yKeys, categoryKey, valueKey, options };
}
export function effectiveChart(result: ChartResultPart, metadata: unknown, toolCallId: string): ChartResultPart {
    const override = getChartOverride(metadata, toolCallId);
    return override.presentation ? { ...result, ...override.presentation } : result;
}
