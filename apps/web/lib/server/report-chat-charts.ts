import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { buildResultAutoChartProfile, RESULT_AUTO_CHART_NONE_VALUE, toChartResultPart } from '@dory/analysis/core/result-chart-profile';
import type { WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import { chartAxis, chartSeries, effectiveChart, getChartOverride } from '@dory/shared/utils/chat-chart';

import { getChartResultFromPart } from '@/lib/agent-runs/chart-result';
import { record } from '@/lib/agent-runs/sql-result';
import { workVisualSchema } from '@/lib/work-documents/schema';

type ChatChart = {
    chart: NonNullable<ReturnType<typeof getChartResultFromPart>>;
    input: Record<string, unknown>;
    presentation?: WorkVisual['chart'];
};

function sameVisual(left: WorkVisual, right: WorkVisual) {
    // Persisted JSON drops undefined properties and may reorder object keys.
    return isDeepStrictEqual(JSON.parse(JSON.stringify(left)), JSON.parse(JSON.stringify(right)));
}

/** Recover original axes only when the automatic chart is a lossless view of the verified snapshot. */
export function reportChatChartAxes(source: ChatChart, evidence: WorkEvidence): WorkVisual['chart'] | undefined {
    const { chart, input, presentation } = source;
    if (chart.source?.artifactId !== evidence.artifactId || chart.xKey !== 'xLabel' || chart.yKeys?.length !== 1 || chart.yKeys[0].key !== '__value__' || evidence.truncated)
        return;
    if (presentation && (presentation.xKey !== 'xLabel' || presentation.yKeys?.length !== 1 || presentation.yKeys[0].key !== '__value__')) return;
    const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
    const profile = buildResultAutoChartProfile({
        rows: evidence.rows,
        overrides: {
            chartType: chart.chartType,
            xKey: text(input.xKey),
            categoryKey: text(input.categoryKey),
            valueKey: text(input.valueKey),
            yKeys: Array.isArray(input.yKeys)
                ? input.yKeys
                      .map(record)
                      .filter(series => typeof series.key === 'string')
                      .map(series => ({ key: String(series.key) }))
                : undefined,
        },
    });
    const metric = profile.metricOptions.find(option => option.key === profile.chartState.yKey);
    const xKey = profile.chartState.xKey;
    if (
        profile.chartState.groupKey !== RESULT_AUTO_CHART_NONE_VALUE ||
        !metric?.column ||
        !['sum', 'avg', 'min', 'max'].includes(metric.kind) ||
        profile.aggregated.data.length !== evidence.rows.length ||
        profile.aggregated.data.some(row => {
            const filter = record(row.__xFilter);
            return filter.kind !== 'exact' || filter.col !== xKey;
        })
    )
        return;
    const rebuilt = toChartResultPart(profile);
    const values = (rows: Record<string, unknown>[]) => JSON.stringify(rows.map(row => [row.xLabel, row.__value__]));
    if (!rebuilt || rebuilt.yKeys?.[0].label !== chart.yKeys[0].label || values(rebuilt.data) !== values(chart.data)) return;
    const label = presentation ? presentation.yKeys?.[0]?.label : chart.yKeys[0].label;
    const options = presentation ? presentation.options : chart.options;
    return { type: presentation?.type ?? chart.chartType, xKey, yKeys: [{ key: metric.column, ...(label ? { label } : {}) }], ...(options ? { options } : {}) };
}

/** Convert only complete chart tool results from this conversation, never copied preview rows. */
export function resolveReportChatCharts(body: string, visuals: WorkVisual[], messages: readonly unknown[], mdx: boolean, evidence: WorkEvidence[] = []) {
    // Persisted metadata is also applied to repeated model-history copies of the same tool output.
    const overrides = new Map<string, unknown>();
    for (const value of messages) {
        const metadata = record(value).metadata;
        for (const id of Object.keys(record(record(metadata).chartOverrides))) {
            if (getChartOverride(metadata, id).version > getChartOverride(overrides.get(id), id).version) overrides.set(id, metadata);
        }
    }
    const matches = new Map<string, Array<{ visual: WorkVisual; source: ChatChart }>>();
    const charts = new Map<string, ChatChart>();
    for (const value of messages) {
        const message = record(value);
        if (message.role !== 'assistant' && message.role !== 'tool') continue;
        const parts = Array.isArray(message.parts) ? message.parts : Array.isArray(message.content) ? message.content : [];
        for (const value of parts) {
            const part = record(value);
            if ((part.toolName ?? part.type) !== 'chartBuilder' && part.type !== 'tool-chartBuilder') continue;
            if (typeof part.toolCallId !== 'string' || part.state === 'output-error') continue;
            const original = getChartResultFromPart(part);
            if (!original) continue;
            const chart = effectiveChart(original, overrides.get(part.toolCallId) ?? message.metadata, part.toolCallId);
            const xKey = chartAxis(chart);
            const yKeys = chartSeries(chart).map(({ key, label }) => ({ key, ...(label ? { label } : {}) }));
            if (chart.dataState !== 'ready' || !chart.source?.artifactId || !xKey || !yKeys.length) continue;
            const id = `chat-chart-${createHash('sha256').update(part.toolCallId).digest('hex').slice(0, 32)}`;
            const visual = workVisualSchema.safeParse({
                id,
                type: 'chart',
                title: (chart.title || 'Chart').slice(0, 300),
                evidenceId: chart.source.artifactId,
                chart: { type: chart.chartType, xKey, yKeys, ...(chart.options ? { options: chart.options } : {}) },
            });
            if (!visual.success) continue;
            const source = { chart: original, input: record(part.input ?? part.args), presentation: visual.data.chart };
            const prior = matches.get(part.toolCallId) ?? [];
            const copy = prior.find(item => sameVisual(item.visual, visual.data));
            if (!copy) prior.push({ visual: visual.data, source });
            else if (!Object.keys(copy.source.input).length && Object.keys(source.input).length) copy.source = source;
            matches.set(part.toolCallId, prior);
        }
    }
    const resolved = new Map(visuals.map(visual => [visual.id, visual]));
    let fence: { character: string; length: number } | undefined;
    const result = body
        .split('\n')
        .map(line => {
            const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
            if (delimiter) {
                if (!fence) fence = { character: delimiter[1][0], length: delimiter[1].length };
                else if (delimiter[1][0] === fence.character && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = undefined;
                return line;
            }
            const match = !fence && line.match(/^ {0,3}!\[[^\]]*\]\(dory:\/\/chart\/([^\s)]+)\)[ \t]*$/);
            if (!match) return line;
            let id: string;
            try {
                id = decodeURIComponent(match[1]);
            } catch {
                return line;
            }
            const candidates = matches.get(id);
            if (candidates?.length !== 1) return line;
            const { visual, source } = candidates[0];
            const snapshot = evidence.find(item => item.artifactId === visual.evidenceId);
            const axes = snapshot && visual.chart && !snapshot.columns.includes(visual.chart.xKey) ? reportChatChartAxes(source, snapshot) : undefined;
            const converted = axes ? { ...visual, chart: axes } : visual;
            const existing = resolved.get(visual.id);
            if (existing && !sameVisual(existing, converted)) return line;
            resolved.set(visual.id, existing ?? converted);
            charts.set(visual.id, source);
            return mdx ? `<Chart source="${visual.id}" />` : `![Chart](dory://visual/${visual.id})`;
        })
        .join('\n');
    return { body: result, visuals: [...resolved.values()], charts };
}
