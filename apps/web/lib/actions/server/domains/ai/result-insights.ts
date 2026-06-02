import { z } from 'zod';

import { buildResultInsightsPrompt } from '@/lib/ai/prompts/tasks/result.insights';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import type { AiActionContext } from './shared';

const resultInsightsResponseSchema = z.object({
    analysisState: z.enum(['invalid', 'weak', 'good', 'actionable']).optional(),
    quickSummary: z
        .object({
            title: z.string(),
            subtitle: z.string().optional(),
        })
        .optional(),
    primaryInsight: z.string().optional(),
    limitations: z.array(z.string()).max(5).optional(),
    items: z
        .array(
            z.object({
                id: z.string().optional(),
                title: z.string().optional(),
                summary: z.string().optional(),
                level: z.enum(['primary', 'secondary', 'info']).optional(),
            }),
        )
        .max(5)
        .optional(),
    insights: z
        .array(
            z.union([
                z.string(),
                z
                    .object({
                        title: z.string().optional(),
                        summary: z.string().optional(),
                        description: z.string().optional(),
                        insight: z.string().optional(),
                    })
                    .passthrough(),
            ]),
        )
        .max(5)
        .optional(),
    reasoning: z
        .object({
            priorities: z.array(z.string()),
        })
        .optional(),
});

type ResultInsightText = string | { title?: string; summary?: string; description?: string; insight?: string };
type ResultInsightItem = {
    id?: string;
    title?: string;
    summary?: string;
    level?: 'primary' | 'secondary' | 'info';
};

function stringifyResultInsight(value: ResultInsightText) {
    if (typeof value === 'string') return value.trim();
    return (value?.summary ?? value?.insight ?? value?.description ?? value?.title ?? '').trim();
}

async function runResultInsightsAction(ctx: AiActionContext, payload: Record<string, any>) {
    if (!Array.isArray(payload?.facts) || !Array.isArray(payload?.patterns)) return null;
    if (!payload.facts.length && !payload.patterns.length) return null;

    try {
        const locale = ctx.locale ?? payload.locale ?? 'en';
        const { runLLMJson } = await import('@/lib/copilot/action/server/llm-json');
        const result = await runLLMJson({
            prompt: buildResultInsightsPrompt({ payload, locale }),
            schema: resultInsightsResponseSchema,
            temperature: 0.2,
            maxOutputTokens: 900,
            maxRetries: 0,
            context: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                feature: 'result_insights',
            },
        });
        const legacyInsights = ((result.insights ?? []) as ResultInsightText[]).map(stringifyResultInsight).filter(Boolean);
        const sourceItems: ResultInsightItem[] = result.items?.length
            ? (result.items as ResultInsightItem[])
            : legacyInsights.map((insight, index) => ({
                  id: `ai-insight-${index + 1}`,
                  title: insight,
                  summary: insight,
                  level: index === 0 ? ('primary' as const) : ('secondary' as const),
              }));
        const facts = payload.facts as Array<{ narrativeHint?: string }>;
        const fallbackItems: ResultInsightItem[] = facts.map((fact, index) => ({ id: `ai-insight-${index + 1}`, title: fact.narrativeHint, summary: fact.narrativeHint }));
        const items = (sourceItems.length ? sourceItems : fallbackItems)
            .flatMap((item, index) => {
                const title = (item.title ?? item.summary ?? '').trim();
                const summary = (item.summary ?? item.title ?? '').trim();
                if (!title && !summary) return [];
                return [
                    {
                        id: item.id?.trim() || `ai-insight-${index + 1}`,
                        title: title || summary,
                        summary: summary || title,
                        level: item.level ?? (index === 0 ? 'primary' : 'secondary'),
                        actions: [],
                    },
                ];
            })
            .slice(0, 5);
        const primaryInsight = result.primaryInsight ?? items[0]?.title;

        return {
            quickSummary: result.quickSummary ?? {
                title: primaryInsight ?? 'Analysis',
                subtitle: typeof payload.summary?.rowCount === 'number' ? `${payload.summary.rowCount.toLocaleString()} rows` : undefined,
            },
            analysisState: result.analysisState,
            primaryInsight,
            limitations: result.limitations,
            items,
            reasoning: result.reasoning,
            autoRunPolicy: undefined,
        };
    } catch (error) {
        console.error('[action/ai.resultInsights] failed:', error);
        return null;
    }
}

export const aiResultInsightsAction = defineWebAction({
    id: 'ai.resultInsights',
    domain: 'ai',
    kind: 'query',
    risk: 'low',
    inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['analysis:run'],
    actors: ['user', 'agent', 'automation'],
    handler: (ctx, input) => runResultInsightsAction(ctx, input),
});
