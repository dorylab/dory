import { z } from 'zod';

import type { ActionContext } from '@dory/actions';
import type { ColumnInput } from '@dory/shared';
import type { TableStats, TablePropertiesRow } from '@dory/shared/types/table-info';
import type { Locale } from '@dory/i18n/routing';
import { generateText } from '@/lib/ai/gateway';
import { buildResultInsightsPrompt } from '@/lib/ai/prompts/tasks/result.insights';
import { buildTabTitlePrompt } from '@/lib/ai/prompts/tasks/sql.title';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { heuristicTagging } from '@/lib/ai/core/column-tagging';
import { fallbackSummaries } from '@/lib/ai/core/schema-explanations';
import { buildFallbackSummary, buildFallbackDetail, buildFallbackHighlights, buildFallbackSnippets } from '@/lib/ai/core/table-summary';
import { analyzeTableStats, type TableIssue } from '@/lib/ai/core/table-stats-insights';
import { translateApi } from '@/app/api/utils/i18n';
import type { WebActionServices } from './types';

export const columnInputSchema = z.object({
    name: z.string().min(1),
    type: z.string().optional(),
    comment: z.string().nullable().optional(),
    defaultValue: z.string().nullable().optional(),
    nullable: z.boolean().optional(),
});

export type AiActionContext = ActionContext<WebActionServices>;

function normalizeLocale(locale?: string | null): Locale {
    const normalized = locale?.toLowerCase() ?? '';
    if (normalized.startsWith('zh')) return 'zh';
    if (normalized.startsWith('ja')) return 'ja';
    if (normalized.startsWith('es')) return 'es';
    return 'en';
}

type SchemaTagsInput = {
    connectionId?: string | null;
    columns: ColumnInput[];
    database?: string | null;
    table?: string | null;
    model?: string | null;
    catalog?: string | null;
    dbType?: string | null;
};

export async function runSchemaTagsAction(ctx: AiActionContext, input: SchemaTagsInput) {
    const connectionId = input.connectionId?.trim() || ctx.currentConnectionId?.trim();
    if (!connectionId) {
        throw new Error('Missing connection context.');
    }

    try {
        const provider = (await import('@/lib/ai/provider')).default;
        return await provider.getColumnTagsWithCache({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId,
            columns: input.columns,
            dbType: input.dbType ?? null,
            catalog: input.catalog ?? null,
            database: input.database ?? null,
            table: input.table ?? null,
            model: input.model ?? null,
            locale: ctx.locale,
        });
    } catch (error) {
        console.error('[action/ai.schemaTags] failed:', error);
        return {
            columns: heuristicTagging(input.columns, ctx.locale),
        };
    }
}

type SchemaExplanationsInput = SchemaTagsInput;

export async function runSchemaExplanationsAction(ctx: AiActionContext, input: SchemaExplanationsInput) {
    const connectionId = input.connectionId?.trim() || ctx.currentConnectionId?.trim();
    if (!connectionId) {
        throw new Error('Missing connection context.');
    }

    try {
        const provider = (await import('@/lib/ai/provider')).default;
        return await provider.getColumnExplanationsWithCache({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId,
            columns: input.columns,
            dbType: input.dbType ?? null,
            catalog: input.catalog ?? null,
            database: input.database ?? null,
            table: input.table ?? null,
            model: input.model ?? null,
            locale: ctx.locale,
        });
    } catch (error) {
        console.error('[action/ai.schemaExplanations] failed:', error);
        return {
            columns: fallbackSummaries(input.columns, ctx.locale),
        };
    }
}

type TableSummaryInput = {
    connectionId?: string | null;
    database?: string | null;
    table?: string | null;
    columns?: ColumnInput[];
    properties?: TablePropertiesRow | null;
    model?: string | null;
    catalog?: string | null;
    dbType?: string | null;
    ignoreCache?: boolean;
};

type TableSummarySource = 'cache' | 'ai' | 'fallback';

function buildFallbackTableSummary(input: TableSummaryInput, locale?: string | null) {
    const columns = Array.isArray(input.columns) ? input.columns : [];
    return {
        summary: buildFallbackSummary({ database: input.database, table: input.table, columns, properties: input.properties ?? null, locale }),
        detail: buildFallbackDetail({ database: input.database, table: input.table, columns, properties: input.properties ?? null, locale }),
        highlights: buildFallbackHighlights(columns, locale),
        snippets: buildFallbackSnippets(input.table, columns, locale),
        fromCache: false as const,
        source: 'fallback' as TableSummarySource,
    };
}

export async function runTableSummaryAction(ctx: AiActionContext, input: TableSummaryInput) {
    const columns = Array.isArray(input.columns) ? input.columns : [];
    const connectionId = input.connectionId?.trim() || ctx.currentConnectionId?.trim();
    const fallback = buildFallbackTableSummary({ ...input, columns }, ctx.locale);

    if (!columns.length || !connectionId) {
        return fallback;
    }

    try {
        const provider = (await import('@/lib/ai/provider')).default;
        const result = await provider.getTableSummaryWithCache({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId,
            columns,
            properties: input.properties ?? null,
            dbType: input.dbType ?? null,
            catalog: input.catalog ?? null,
            database: input.database ?? null,
            table: input.table ?? null,
            model: input.model ?? null,
            ignoreCache: Boolean(input.ignoreCache),
            locale: ctx.locale,
        });

        return {
            ...result,
            source: result.fromCache ? ('cache' as const) : ('ai' as const),
        };
    } catch (error) {
        console.error('[action/ai.tableSummary] failed:', error);
        return fallback;
    }
}

function issuesToInsights(issues: TableIssue[]): string[] {
    return issues.map(issue => issue.message);
}

function buildStatsSuggestion(issues: TableIssue[], locale?: string | null): string | null {
    const normalizedLocale = normalizeLocale(locale);
    if (!issues.length) return translateApi('Api.Ai.TableStats.Suggestions.Healthy', undefined, normalizedLocale);

    const critical = issues.find(issue => issue.level === 'critical');
    if (critical) {
        return translateApi('Api.Ai.TableStats.Suggestions.Critical', { message: critical.message }, normalizedLocale);
    }

    const warn = issues.find(issue => issue.level === 'warn');
    if (warn) {
        return translateApi('Api.Ai.TableStats.Suggestions.Warn', { message: warn.message }, normalizedLocale);
    }

    return translateApi('Api.Ai.TableStats.Suggestions.Default', undefined, normalizedLocale);
}

export async function runTableStatsInsightsAction(ctx: AiActionContext, input: { stats: TableStats | null; database?: string | null; table?: string | null }) {
    if (!input.stats) {
        return {
            issues: [],
            insights: [],
            suggestion: translateApi('Api.Ai.TableStats.Errors.MissingStats', undefined, normalizeLocale(ctx.locale)),
        };
    }

    try {
        const issues = await analyzeTableStats(input.stats);
        return {
            issues,
            insights: issuesToInsights(issues),
            suggestion: buildStatsSuggestion(issues, ctx.locale),
        };
    } catch (error) {
        console.error('[action/ai.tableStatsInsights] failed:', error);
        return {
            issues: [],
            insights: [],
            suggestion: translateApi('Api.Ai.TableStats.Errors.AnalyzeFailed', undefined, normalizeLocale(ctx.locale)),
        };
    }
}

export async function runTabTitleAction(ctx: AiActionContext, input: { sql: string; database?: string | null; model?: string | null }) {
    const sql = input.sql?.trim();
    if (!sql) return { title: null };

    try {
        const { getEffectiveModelBundleForOrganization } = await import('@/lib/ai/model');
        const {
            model,
            preset,
            modelName,
            providerKey,
            gateway,
        } = await getEffectiveModelBundleForOrganization('title', {
            organizationId: ctx.organizationId,
            modelName: input.model ?? null,
        });
        const { text } = await generateText({
            model,
            system: compileSystemPrompt(preset.system) ?? 'Return a concise title only, with no explanation.',
            prompt: buildTabTitlePrompt({ sql, database: input.database ?? null, locale: ctx.locale }),
            temperature: preset.temperature,
            context: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                feature: 'tab_title',
                model: modelName,
                provider: providerKey,
                gateway,
            },
        });

        return { title: text.trim() || null };
    } catch (error) {
        console.error('[action/ai.tabTitle] failed:', error);
        return { title: null };
    }
}

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

export async function runResultInsightsAction(ctx: AiActionContext, payload: Record<string, any>) {
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
