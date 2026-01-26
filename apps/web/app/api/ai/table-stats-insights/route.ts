// app/api/ai/table-stats-insights/route.ts
import { NextRequest } from 'next/server';
import type { TableStats } from '@/types/table-info';
import { TableIssue, analyzeTableStats } from './stats-rules';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

export const runtime = 'edge';

type TableStatsInsightsRequest = {
    stats: TableStats | null;
    database?: string | null;
    table?: string | null;
};

type TableStatsInsightsResponse = {
    issues: TableIssue[];
    insights: string[];
    suggestion: string | null;
};

function issuesToInsights(issues: TableIssue[]): string[] {
    return issues.map(i => i.message);
}

async function buildSuggestion(issues: TableIssue[]): Promise<string | null> {
    const locale = await getApiLocale();
    if (!issues.length) return translateApi('Api.Ai.TableStats.Suggestions.Healthy', undefined, locale);

    const critical = issues.find(i => i.level === 'critical');
    if (critical) {
        return translateApi('Api.Ai.TableStats.Suggestions.Critical', { message: critical.message }, locale);
    }

    const warn = issues.find(i => i.level === 'warn');
    if (warn) {
        return translateApi('Api.Ai.TableStats.Suggestions.Warn', { message: warn.message }, locale);
    }

    return translateApi('Api.Ai.TableStats.Suggestions.Default', undefined, locale);
}

export async function POST(req: NextRequest) {
    const locale = await getApiLocale();
    try {
        const body = (await req.json().catch(() => null)) as TableStatsInsightsRequest | null;
        const { stats } = body || {};

        if (!stats) {
            return new Response(
                JSON.stringify({
                    issues: [],
                    insights: [],
                    suggestion: translateApi('Api.Ai.TableStats.Errors.MissingStats', undefined, locale),
                } satisfies TableStatsInsightsResponse),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const issues = await analyzeTableStats(stats);
        const insights = issuesToInsights(issues);
        const suggestion = await buildSuggestion(issues);

        return new Response(
            JSON.stringify({ issues, insights, suggestion } satisfies TableStatsInsightsResponse),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    } catch (error) {
        console.error('[api/ai/table-stats-insights] error:', error);
        return new Response(
            JSON.stringify({
                issues: [],
                insights: [],
                suggestion: translateApi('Api.Ai.TableStats.Errors.AnalyzeFailed', undefined, locale),
            } satisfies TableStatsInsightsResponse),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
}
