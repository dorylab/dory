import type { ChartResultPart } from '@dory/shared/types/chat-chart';
import { chartNumber, isChartTimeAxis, readStoredChart, validateChartPresentation } from '@dory/shared/utils/chat-chart';

import { getSqlResultFromPart, isSqlToolPart, record, toolResultValue } from './sql-result';

type Message = { role: string; content?: unknown; parts?: unknown[] };
type ChartConfig = Omit<ChartResultPart, 'type' | 'data'>;
export type ChartQuery = NonNullable<ReturnType<typeof latestChartQuery>>;

/** Stop at the latest query, even if it failed, is pending, or returned no rows. */
export function latestChartQuery(messages: readonly Message[]) {
    for (const message of [...messages].reverse()) {
        if (message.role === 'user') break;
        const parts = message.parts ?? message.content;
        if (!Array.isArray(parts)) continue;
        for (const value of [...parts].reverse()) {
            if (!isSqlToolPart(value)) continue;
            const part = record(value);
            const output = toolResultValue(part);
            const artifacts = Array.isArray(output.artifactIds) ? output.artifactIds : Array.isArray(output.artifacts) ? output.artifacts.map(item => record(item).artifactId) : [];
            return {
                result: getSqlResultFromPart(part),
                source: {
                    toolCallId: typeof part.toolCallId === 'string' ? part.toolCallId : undefined,
                    artifactId: typeof output.artifactId === 'string' ? output.artifactId : typeof artifacts[0] === 'string' ? artifacts[0] : undefined,
                },
            };
        }
    }
    return null;
}

export function buildQueryChart(config: ChartConfig, messages: readonly Message[], requireExplicitFields = false): ChartResultPart {
    const latest = latestChartQuery(messages);
    // Never recover a failed/pending/empty latest query by silently selecting older rows.
    if (!latest?.result?.ok || !latest.result.previewRows?.length) return buildChartFromQuery(config, latest, requireExplicitFields);
    const candidates: ChartQuery[] = [];
    const seen = new Set<string>();
    for (const message of [...messages].reverse()) {
        if (message.role === 'user') break;
        const parts = message.parts ?? message.content;
        if (!Array.isArray(parts)) continue;
        for (const part of parts) {
            if (!isSqlToolPart(part)) continue;
            const query = latestChartQuery([{ role: 'tool', parts: [part] }]);
            if (!query?.result?.ok) continue;
            const identity = query.source.artifactId ?? query.source.toolCallId;
            if (identity && seen.has(identity)) continue;
            if (identity) seen.add(identity);
            if (buildChartFromQuery(config, query, requireExplicitFields).dataState === 'ready') candidates.push(query);
        }
    }
    // Ambiguity must be resolved with an explicit Artifact, not message ordering.
    return candidates.length > 1 ? { ...config, type: 'chart', data: [], dataState: 'missing' } : buildChartFromQuery(config, candidates[0] ?? latest, requireExplicitFields);
}

export function buildChartFromQuery(config: ChartConfig, query: ChartQuery | null, requireExplicitFields = false): ChartResultPart {
    const base: ChartResultPart = {
        ...config,
        type: 'chart',
        data: [],
        source: query
            ? {
                  ...query.source,
                  rowCount: query.result?.rowCount,
                  truncated: query.result?.truncated,
                  columns: query.result?.columns?.map(column => column.name),
                  sql: query.result?.sql ?? undefined,
                  database: query.result?.database ?? undefined,
              }
            : undefined,
    };
    if (config.chartType === 'pie' && query?.result?.truncated) return { ...base, dataState: 'incomplete' };
    if (!query?.result?.ok) return { ...base, dataState: 'missing' };
    const rows = query.result.previewRows ?? [];
    if (!rows.length) return { ...base, dataState: 'empty' };
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const x =
        config.xKey ??
        config.categoryKey ??
        columns.find(key => isChartTimeAxis({ ...config, xKey: key }, rows)) ??
        columns.find(key => rows.some(row => row[key] != null && chartNumber(row[key]) === null)) ??
        columns[0];
    const ys = config.yKeys?.length
        ? config.yKeys.map(series => series.key)
        : config.valueKey
          ? [config.valueKey]
          : columns.filter(key => key !== x && !/(?:^|_)id$/i.test(key) && rows.some(row => chartNumber(row[key]) !== null)).slice(0, 10);
    const fields = [x, ...ys].filter((key): key is string => Boolean(key));
    if (
        (requireExplicitFields && (!(config.xKey ?? config.categoryKey) || !(config.yKeys?.length || config.valueKey))) ||
        fields.some(key => !rows.some(row => Object.hasOwn(row, key)))
    ) {
        return { ...base, dataState: 'invalid-fields' };
    }
    if (ys.some(key => !rows.some(row => row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '' && Number.isFinite(Number(row[key]))))) {
        return { ...base, dataState: 'invalid-fields' };
    }
    if (
        config.chartType === 'pie' &&
        (ys.length !== 1 ||
            rows.some(
                row => row[ys[0]] === null || row[ys[0]] === undefined || String(row[ys[0]]).trim() === '' || !Number.isFinite(Number(row[ys[0]])) || Number(row[ys[0]]) < 0,
            ) ||
            rows.reduce((sum, row) => sum + Number(row[ys[0]]), 0) <= 0)
    ) {
        return { ...base, dataState: 'invalid-fields' };
    }
    const chart: ChartResultPart = {
        ...base,
        xKey: x,
        yKeys: ys.map(key => config.yKeys?.find(series => series.key === key) ?? { key }),
        categoryKey: config.chartType === 'pie' ? x : config.categoryKey,
        valueKey: config.chartType === 'pie' ? ys[0] : config.valueKey,
        data: rows,
        options: { ...config.options },
        dataState: 'ready',
    };
    if (isChartTimeAxis(chart, rows)) chart.options = { xKeyType: 'time', sortBy: 'x', sortDirection: 'asc', ...chart.options };
    const invalid = validateChartPresentation(chart);
    return invalid ? { ...chart, data: [], dataState: invalid } : chart;
}

export function getChartResultFromPart(value: unknown, precedingMessages?: readonly Message[]): ChartResultPart | null {
    const chart = readStoredChart({ output: toolResultValue(value) });
    if (!chart) return null;
    const normalized = chart;
    // Explicit new empty/error states must never be replaced by a different query.
    if (normalized.data.length || chart.dataState || !precedingMessages) return normalized;
    const query = latestChartQuery(precedingMessages);
    if (chart.source && (chart.source.toolCallId !== query?.source.toolCallId || chart.source.artifactId !== query?.source.artifactId)) return normalized;
    return buildQueryChart(chart, precedingMessages, true);
}
