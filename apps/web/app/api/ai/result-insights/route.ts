import { z } from 'zod';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { resolveAiRouteExecution } from '@/lib/ai/execution/route-dispatch';
import { buildResultInsightsPrompt } from '@/lib/ai/prompts';
import { runLLMJson } from '@/lib/copilot/action/server/llm-json';
import type { Locale } from '@dory/i18n/routing';

export const runtime = 'nodejs';

const requestSchema = z.object({
    locale: z.string().min(2),
    sqlText: z.string().nullish(),
    summary: z
        .object({
            kind: z.string(),
            rowCount: z.number().nullable(),
            columnCount: z.number(),
            recommendedChart: z.string().nullable().optional(),
            primaryTimeColumn: z.string().nullable().optional(),
        })
        .passthrough(),
    keyColumns: z.object({
        time: z.string().optional(),
        measures: z.array(z.string()),
        dimensions: z.array(z.string()),
        identifiers: z.array(z.string()),
    }),
    facts: z.array(
        z.object({
            id: z.string(),
            type: z.string(),
            title: z.string().optional(),
            severity: z.enum(['info', 'warning', 'risk']).optional(),
            confidence: z.number(),
            columns: z.array(z.string()).optional(),
            metrics: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
            narrativeHint: z.string().optional(),
        }),
    ),
    patterns: z.array(
        z.object({
            id: z.string(),
            kind: z.enum(['spike', 'drop', 'outlier', 'correlation', 'segment_shift']),
            confidence: z.number(),
            columns: z.array(z.string()),
            summary: z.string(),
            metrics: z.record(z.string(), z.union([z.string(), z.number()])),
        }),
    ),
    profileColumns: z
        .array(
            z.object({
                name: z.string(),
                semanticRole: z.string(),
                distinctCount: z.number().nullable().optional(),
                topValueShare: z.number().nullable().optional(),
                topK: z.array(z.object({ value: z.string(), count: z.number() })).optional(),
            }),
        )
        .optional(),
    sampleRows: z.array(z.record(z.string(), z.unknown())).optional(),
});

const resultActionSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('filter'),
        title: z.string().min(1),
        params: z.object({
            column: z.string().min(1),
            operator: z.enum(['>', '<', '=', '>=', '<=']),
            value: z.union([z.number(), z.string()]),
        }),
    }),
    z.object({
        type: z.literal('group'),
        title: z.string().min(1),
        params: z.object({
            dimensions: z.array(z.string().min(1)).min(1).max(3),
            measure: z
                .object({
                    column: z.string().min(1),
                    aggregation: z.enum(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']),
                })
                .optional(),
            limit: z.number().int().positive().max(200).optional(),
        }),
    }),
    z.object({
        type: z.literal('trend'),
        title: z.string().min(1),
        params: z.object({
            timeColumn: z.string().min(1),
            measure: z
                .object({
                    column: z.string().min(1),
                    aggregation: z.enum(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']),
                })
                .optional(),
            limit: z.number().int().positive().max(200).optional(),
        }),
    }),
    z.object({
        type: z.literal('distribution'),
        title: z.string().min(1),
        params: z.object({
            column: z.string().min(1),
        }),
    }),
]);

const recommendedResultActionSchema = resultActionSchema.and(
    z.object({
        priority: z.enum(['primary', 'secondary']).optional(),
    }),
);
type RecommendedResultAction = z.infer<typeof recommendedResultActionSchema>;
type NormalizedRecommendedResultAction = RecommendedResultAction & { priority: 'primary' | 'secondary' };
type NormalizedInsightItem = {
    id: string;
    title: string;
    summary: string;
    level: 'primary' | 'secondary' | 'info';
    primaryAction?: NormalizedRecommendedResultAction;
    actions: NormalizedRecommendedResultAction[];
};

const insightItemSchema = z.object({
    id: z.string().optional(),
    title: z.string().optional(),
    summary: z.string().optional(),
    level: z.enum(['primary', 'secondary', 'info']).optional(),
    primaryAction: z.unknown().optional(),
    actions: z.array(z.unknown()).max(4).optional(),
});

const responseSchema = z.object({
    analysisState: z.enum(['invalid', 'weak', 'good', 'actionable']).optional(),
    quickSummary: z
        .object({
            title: z.string(),
            subtitle: z.string().optional(),
        })
        .optional(),
    primaryInsight: z.string().optional(),
    limitations: z.array(z.string()).max(5).optional(),
    items: z.array(insightItemSchema).min(1).max(5).optional(),
    recommendedActions: z.array(z.unknown()).max(5).optional(),
    alternativeActions: z
        .array(
            z.object({
                id: z.string().optional(),
                label: z.string(),
                description: z.string(),
                kind: z.enum(['drilldown', 'trend', 'distribution', 'topk', 'compare']).optional(),
            }),
        )
        .max(5)
        .optional(),
    autoRunPolicy: z.literal('confirm_required').optional(),
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

type ResponseInsight = NonNullable<z.infer<typeof responseSchema>['insights']>[number];

function stringifyInsight(value: ResponseInsight) {
    if (typeof value === 'string') return value.trim();
    return (value.summary ?? value.insight ?? value.description ?? value.title ?? '').trim();
}

function actionColumns(action: RecommendedResultAction) {
    if (action.type === 'filter') return [action.params.column];
    if (action.type === 'group') return [...action.params.dimensions, action.params.measure?.column].filter((column): column is string => !!column);
    if (action.type === 'trend') return [action.params.timeColumn, action.params.measure?.column].filter((column): column is string => !!column);
    return [action.params.column];
}

function filterAllowedActions(actions: RecommendedResultAction[], allowedColumns: Set<string>) {
    return actions.filter(action => {
        if (!allowedColumns.size) return true;
        return actionColumns(action).every(column => allowedColumns.has(column));
    });
}

function actionSignature(action: RecommendedResultAction) {
    return `${action.type}:${JSON.stringify(action.params)}`;
}

function normalizeRecommendedActions(actions: RecommendedResultAction[]): NormalizedRecommendedResultAction[] {
    const seen = new Set<string>();
    const deduped = actions.filter(action => {
        const signature = actionSignature(action);
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
    });

    return deduped.slice(0, 4).map((action, index) => ({
        ...action,
        priority: index === 0 ? ('primary' as const) : ('secondary' as const),
    }));
}

function normalizeItemActions(actions: unknown[] | undefined, allowedColumns: Set<string>) {
    const parsed = (actions ?? []).map(action => recommendedResultActionSchema.safeParse(action).data).filter((action): action is RecommendedResultAction => !!action);

    return normalizeRecommendedActions(filterAllowedActions(parsed, allowedColumns)).slice(0, 3);
}

function mergePrimaryAction(
    primaryAction: ReturnType<typeof normalizeItemActions>[number] | undefined,
    actions: ReturnType<typeof normalizeItemActions>,
): ReturnType<typeof normalizeItemActions> {
    if (!primaryAction) return actions;
    const primarySignature = actionSignature(primaryAction);
    const merged = [primaryAction, ...actions.filter(action => actionSignature(action) !== primarySignature)];

    return normalizeRecommendedActions(merged).slice(0, 3);
}

function normalizeLocale(locale: string): Locale {
    const normalized = locale.toLowerCase();
    if (normalized.startsWith('zh')) return 'zh';
    if (normalized.startsWith('ja')) return 'ja';
    if (normalized.startsWith('es')) return 'es';
    return 'en';
}

function fallbackActionTitle(locale: string, key: string, values: Record<string, unknown>) {
    return translateApi(`SqlConsole.Insights.Analysis.FallbackActions.${key}`, values, normalizeLocale(locale));
}

function buildFallbackRecommendedActions(payload: z.infer<typeof requestSchema>, allowedColumns: Set<string>) {
    const locale = payload.locale;
    const actions: RecommendedResultAction[] = [];
    const isAllowedColumn = (column?: string | null) => !!column && (!allowedColumns.size || allowedColumns.has(column));
    const profileColumns = payload.profileColumns ?? [];
    const primaryMeasure =
        payload.keyColumns.measures.find(isAllowedColumn) ?? profileColumns.find(column => column.semanticRole === 'measure' && isAllowedColumn(column.name))?.name;
    const primaryDimension =
        payload.keyColumns.dimensions.find(isAllowedColumn) ?? profileColumns.find(column => column.semanticRole === 'dimension' && isAllowedColumn(column.name))?.name;
    const timeColumn =
        (isAllowedColumn(payload.keyColumns.time) ? payload.keyColumns.time : undefined) ??
        profileColumns.find(column => column.semanticRole === 'time' && isAllowedColumn(column.name))?.name;
    const outlierPattern = payload.patterns.find(pattern => pattern.kind === 'outlier');
    const outlierColumn = outlierPattern?.columns[0];
    const outlierValue = outlierPattern?.metrics.value;

    if (timeColumn) {
        actions.push({
            type: 'trend',
            title: fallbackActionTitle(locale, 'ViewTrendByColumn', { column: timeColumn }),
            params: {
                timeColumn,
                measure: primaryMeasure
                    ? {
                          column: primaryMeasure,
                          aggregation: 'SUM',
                      }
                    : undefined,
                limit: 50,
            },
        });
    }

    if (primaryDimension) {
        actions.push({
            type: 'group',
            title: fallbackActionTitle(locale, 'AnalyzeByColumn', { column: primaryDimension }),
            params: {
                dimensions: [primaryDimension],
                measure: primaryMeasure
                    ? {
                          column: primaryMeasure,
                          aggregation: 'SUM',
                      }
                    : undefined,
                limit: 20,
            },
        });
    }

    if (primaryMeasure) {
        actions.push({
            type: 'distribution',
            title: fallbackActionTitle(locale, 'ViewDistributionByColumn', { column: primaryMeasure }),
            params: {
                column: primaryMeasure,
            },
        });
    }

    if (outlierColumn && typeof outlierValue === 'number' && Number.isFinite(outlierValue) && (!allowedColumns.size || allowedColumns.has(outlierColumn))) {
        actions.push({
            type: 'filter',
            title: fallbackActionTitle(locale, 'InspectHighRowsByColumn', { column: outlierColumn }),
            params: {
                column: outlierColumn,
                operator: '>',
                value: outlierValue,
            },
        });
    }

    return normalizeRecommendedActions(filterAllowedActions(actions, allowedColumns));
}

function normalizeResultInsightResponse(input: z.infer<typeof responseSchema>, payload: z.infer<typeof requestSchema>) {
    const allowedColumns = new Set(payload.profileColumns?.map(column => column.name) ?? []);
    const legacyInsights = (input.insights ?? []).map(stringifyInsight).filter(Boolean);
    const explicitItems: NormalizedInsightItem[] = (input.items ?? []).flatMap((item, index) => {
        const title = (item.title ?? item.summary ?? '').trim();
        const summary = (item.summary ?? item.title ?? '').trim();
        if (!title && !summary) return [];

        const actions = normalizeItemActions(item.actions, allowedColumns);
        const primaryAction = recommendedResultActionSchema.safeParse(item.primaryAction).data;
        const normalizedPrimaryAction = primaryAction
            ? normalizeItemActions([primaryAction], allowedColumns)[0]
            : (actions.find(action => action.priority === 'primary') ?? actions[0]);

        return [
            {
                id: item.id?.trim() || `ai-insight-${index + 1}`,
                title: title || summary,
                summary: summary || title,
                level: item.level ?? (index === 0 ? 'primary' : 'secondary'),
                primaryAction: normalizedPrimaryAction,
                actions,
            },
        ];
    });
    const fallbackInsightText = [...legacyInsights, ...payload.facts.map(fact => fact.narrativeHint).filter((item): item is string => !!item)].slice(0, 5);
    const aiRecommendedActions = (input.recommendedActions ?? [])
        .map(action => recommendedResultActionSchema.safeParse(action).data)
        .filter((action): action is RecommendedResultAction => !!action);
    const recommendedActions = normalizeRecommendedActions(filterAllowedActions(aiRecommendedActions, allowedColumns));
    const fallbackRecommendedActions = recommendedActions.length ? recommendedActions : buildFallbackRecommendedActions(payload, allowedColumns);
    const itemsBeforeLevels = explicitItems.length
        ? explicitItems.map((item, index) => ({
              ...item,
              primaryAction: item.primaryAction ?? (index === 0 ? fallbackRecommendedActions[0] : undefined),
              actions: mergePrimaryAction(
                  item.primaryAction ?? (index === 0 ? fallbackRecommendedActions[0] : undefined),
                  item.actions.length ? item.actions : index === 0 ? fallbackRecommendedActions : [],
              ),
          }))
        : fallbackInsightText.map((insight, index) => ({
              id: `ai-insight-${index + 1}`,
              title: insight,
              summary: insight,
              level: index === 0 ? ('primary' as const) : ('secondary' as const),
              primaryAction: index === 0 ? fallbackRecommendedActions[0] : undefined,
              actions: mergePrimaryAction(index === 0 ? fallbackRecommendedActions[0] : undefined, index === 0 ? fallbackRecommendedActions : []),
          }));
    const firstPrimaryIndex = itemsBeforeLevels.findIndex(item => item.level === 'primary');
    const promotedPrimaryIndex = firstPrimaryIndex >= 0 ? firstPrimaryIndex : itemsBeforeLevels.findIndex(item => item.level === 'secondary');
    const items = itemsBeforeLevels.map((item, index) => {
        const level = index === promotedPrimaryIndex || (promotedPrimaryIndex < 0 && index === 0) ? 'primary' : item.level === 'primary' ? 'secondary' : item.level;
        const primaryAction = item.primaryAction ?? item.actions[0];

        return {
            ...item,
            level,
            primaryAction,
            actions: mergePrimaryAction(primaryAction, item.actions),
        };
    });
    const primaryInsight = input.primaryInsight ?? items[0]?.title;

    return {
        quickSummary: input.quickSummary ?? {
            title: primaryInsight ?? 'Analysis',
            subtitle: payload.summary.rowCount != null ? `${payload.summary.rowCount.toLocaleString()} rows` : undefined,
        },
        analysisState: input.analysisState,
        primaryInsight,
        limitations: input.limitations,
        items,
        reasoning: input.reasoning,
        autoRunPolicy: fallbackRecommendedActions.length ? 'confirm_required' : input.autoRunPolicy,
    };
}

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const execution = await resolveAiRouteExecution({
        req,
        db,
        organizationId,
        role: 'action',
        includeModel: false,
        proxy: {
            pathname: '/api/ai/result-insights',
        },
    });
    if (execution.proxiedResponse) return execution.proxiedResponse;

    const locale = await getApiLocale();

    try {
        const raw = await req.json().catch(() => null);
        const payload = requestSchema.parse(raw);

        if (!payload.facts.length && !payload.patterns.length) {
            return new Response(JSON.stringify(null), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const result = await runLLMJson({
            prompt: buildResultInsightsPrompt({ payload, locale }),
            schema: responseSchema,
            temperature: 0.2,
            maxOutputTokens: 900,
            maxRetries: 0,
            context: {
                organizationId,
                userId,
                feature: 'result_insights',
            },
        });
        const normalized = normalizeResultInsightResponse(result, payload);

        return new Response(JSON.stringify(normalized), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[api/ai/result-insights] error:', error);
        return new Response(JSON.stringify(null), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
