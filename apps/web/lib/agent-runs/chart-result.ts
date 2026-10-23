import { buildResultAutoChartProfile, toChartResultPart } from '@dory/analysis/core/result-chart-profile';
import type { ChartResultPart } from '@/components/@dory/ui/ai/charts-result';
import { getSqlResultFromPart, isSqlToolPart, record, toolResultValue } from './sql-result';

type Message = { role: string; content?: unknown; parts?: unknown[] };
type ChartConfig = Omit<ChartResultPart, 'type' | 'data'>;

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
                    artifactId: typeof artifacts[0] === 'string' ? artifacts[0] : undefined,
                },
            };
        }
    }
    return null;
}

export function buildQueryChart(config: ChartConfig, messages: readonly Message[], requireExplicitFields = false): ChartResultPart {
    const query = latestChartQuery(messages);
    const base: ChartResultPart = { ...config, type: 'chart', data: [], source: query?.source };
    if (!query?.result?.ok) return { ...base, dataState: 'missing' };
    const rows = query.result.previewRows ?? [];
    if (!rows.length) return { ...base, dataState: 'empty' };
    const x = config.xKey ?? config.categoryKey;
    const ys = config.yKeys?.length ? config.yKeys.map(series => series.key) : config.valueKey ? [config.valueKey] : [];
    const fields = [x, ...ys].filter((key): key is string => Boolean(key));
    if ((requireExplicitFields && (!x || !ys.length)) || fields.some(key => !rows.some(row => Object.hasOwn(row, key)))) {
        return { ...base, dataState: 'invalid-fields' };
    }
    if (ys.some(key => !rows.some(row => row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '' && Number.isFinite(Number(row[key]))))) {
        return { ...base, dataState: 'invalid-fields' };
    }
    // Explicit axes already describe the SQL result. Do not aggregate it again:
    // a real column named "count" also happens to be the auto-chart row-count key.
    if (x && ys.length)
        return {
            ...base,
            data: rows.map(row => ({
                ...row,
                ...Object.fromEntries(
                    ys.map(key => [
                        key,
                        row[key] === null || row[key] === undefined || String(row[key]).trim() === '' || !Number.isFinite(Number(row[key])) ? null : Number(row[key]),
                    ]),
                ),
            })),
            dataState: 'ready',
        };
    const profile = buildResultAutoChartProfile({ rows, overrides: config });
    const chart = toChartResultPart(profile, { title: config.title, description: config.description });
    return chart ? { ...chart, source: query.source, dataState: 'ready' } : { ...base, dataState: 'invalid-fields' };
}

export function getChartResultFromPart(value: unknown, precedingMessages?: readonly Message[]): ChartResultPart | null {
    const candidate = toolResultValue(value);
    if (candidate.type !== 'chart' || !['bar', 'line', 'area', 'pie'].includes(String(candidate.chartType))) return null;
    const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
    const source = record(candidate.source);
    const chart: ChartResultPart = {
        type: 'chart',
        chartType: candidate.chartType as ChartResultPart['chartType'],
        title: text(candidate.title),
        description: text(candidate.description),
        data: Array.isArray(candidate.data) ? candidate.data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row)) : [],
        xKey: text(candidate.xKey),
        yKeys: Array.isArray(candidate.yKeys)
            ? candidate.yKeys
                  .map(record)
                  .filter(series => typeof series.key === 'string')
                  .map(series => ({ key: String(series.key), label: text(series.label), color: text(series.color) }))
            : undefined,
        categoryKey: text(candidate.categoryKey),
        valueKey: text(candidate.valueKey),
        options: candidate.options && typeof candidate.options === 'object' ? { stacked: record(candidate.options).stacked === true } : undefined,
        source: candidate.source ? { toolCallId: text(source.toolCallId), artifactId: text(source.artifactId) } : undefined,
        dataState: ['ready', 'empty', 'missing', 'invalid-fields'].includes(String(candidate.dataState)) ? (candidate.dataState as ChartResultPart['dataState']) : undefined,
    };
    const normalized = chart;
    // Explicit new empty/error states must never be replaced by a different query.
    if (normalized.data.length || chart.dataState || !precedingMessages) return normalized;
    const query = latestChartQuery(precedingMessages);
    if (chart.source && (chart.source.toolCallId !== query?.source.toolCallId || chart.source.artifactId !== query?.source.artifactId)) return normalized;
    return buildQueryChart(chart, precedingMessages, true);
}
