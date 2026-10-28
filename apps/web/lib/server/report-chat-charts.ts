import { createHash } from 'node:crypto';
import type { WorkVisual } from '@dory/shared/types/work-document';

import { getChartResultFromPart } from '@/lib/agent-runs/chart-result';
import { record } from '@/lib/agent-runs/sql-result';
import { workVisualSchema } from '@/lib/work-documents/schema';

/** Convert only complete chart tool results from this conversation, never copied preview rows. */
export function resolveReportChatCharts(body: string, visuals: WorkVisual[], messages: readonly unknown[], mdx: boolean) {
    const matches = new Map<string, WorkVisual[]>();
    for (const value of messages) {
        const message = record(value);
        if (message.role !== 'assistant' && message.role !== 'tool') continue;
        const parts = Array.isArray(message.parts) ? message.parts : Array.isArray(message.content) ? message.content : [];
        for (const value of parts) {
            const part = record(value);
            if ((part.toolName ?? part.type) !== 'chartBuilder' && part.type !== 'tool-chartBuilder') continue;
            if (typeof part.toolCallId !== 'string' || part.state === 'output-error') continue;
            const chart = getChartResultFromPart(part);
            const xKey = chart?.xKey ?? chart?.categoryKey;
            const yKeys = chart?.yKeys?.length ? chart.yKeys.map(({ key, label }) => ({ key, ...(label ? { label } : {}) })) : chart?.valueKey ? [{ key: chart.valueKey }] : [];
            if (!chart || chart.dataState !== 'ready' || !chart.source?.artifactId || !xKey || !yKeys.length) continue;
            const id = `chat-chart-${createHash('sha256').update(part.toolCallId).digest('hex').slice(0, 32)}`;
            const visual = workVisualSchema.safeParse({
                id,
                type: 'chart',
                title: (chart.title || 'Chart').slice(0, 300),
                evidenceId: chart.source.artifactId,
                chart: { type: chart.chartType, xKey, yKeys },
            });
            if (!visual.success) continue;
            const prior = matches.get(part.toolCallId) ?? [];
            if (!prior.some(item => JSON.stringify(item) === JSON.stringify(visual.data))) prior.push(visual.data);
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
            const visual = candidates[0];
            const existing = resolved.get(visual.id);
            if (existing && JSON.stringify(existing) !== JSON.stringify(visual)) return line;
            resolved.set(visual.id, visual);
            return mdx ? `<Chart source="${visual.id}" />` : `![Chart](dory://visual/${visual.id})`;
        })
        .join('\n');
    return { body: result, visuals: [...resolved.values()] };
}
