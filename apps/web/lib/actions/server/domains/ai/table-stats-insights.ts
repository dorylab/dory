import { z } from 'zod';

import type { TableStats } from '@dory/shared/types/table-info';
import { translateApi } from '@/app/api/utils/i18n';
import { analyzeTableStats, type TableIssue } from '@/lib/ai/core/table-stats-insights';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { normalizeLocale, type AiActionContext } from './shared';

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

async function runTableStatsInsightsAction(ctx: AiActionContext, input: { stats: TableStats | null; database?: string | null; table?: string | null }) {
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

export const aiTableStatsInsightsAction = defineWebAction({
    id: 'ai.tableStatsInsights',
    domain: 'ai',
    kind: 'query',
    risk: 'low',
    inputSchema: z.object({
        stats: z.record(z.string(), z.unknown()).nullable(),
        database: z.string().nullable().optional(),
        table: z.string().nullable().optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['analysis:run'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_analyze_table_stats',
        title: 'Analyze table stats',
        description: 'Generate Dory AI insights from table statistics and table context.',
    },
    handler: (ctx, input) => runTableStatsInsightsAction(ctx, input as any),
});
