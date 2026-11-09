import { Locale } from '@dory/i18n/routing';
import { chartAxis, chartGrainDiagnostic } from '@dory/shared/utils/chat-chart';
import { tool } from 'ai';

import { buildChartFromQuery, buildQueryChart, latestChartQuery, type ChartQuery } from '@/lib/agent-runs/chart-result';
import { chatChartEmbed } from '@/lib/agent-runs/chat-chart-layout';
import { chartBuilderInputSchema } from '@/lib/charts/schema';
import { translateApi } from '@/app/api/utils/i18n';

export function createChartBuilderTool(locale: Locale, resolveArtifact?: (artifactId: string) => Promise<ChartQuery>) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    return tool({
        description: `${t('Api.Chat.ChartBuilder.Description')} For an earlier query, pass its returned artifactId. Never supply data rows. Without artifactId, only a unique matching query result in this turn is used. Missing data is an error; use queryAttachment for attachment data, sqlRunner for database data, or select a real query Artifact instead of repeating the same call. Insert the returned embed on its own line in your answer at the relevant discussion, with prose before and after it.`,
        inputSchema: chartBuilderInputSchema,
        execute: async (input, options) => {
            const { artifactId, ...config } = input;
            if (artifactId && !resolveArtifact)
                throw new Error('Saved query charts require an active Dory Run. Query the relevant attachment or database in this turn before creating the chart.');
            const query = artifactId && resolveArtifact ? await resolveArtifact(artifactId) : null;
            const chart = query ? buildChartFromQuery(config, query) : buildQueryChart(config, options.messages);
            if (chart.dataState === 'missing')
                throw new Error(
                    'No unique successful query result is available in this turn. Pass the artifactId returned by the relevant query. For attachments use queryAttachment; for database data use sqlRunner. If several sources match, ask which one. Do not retry unchanged chart parameters.',
                );
            if (chart.dataState === 'incomplete')
                throw new Error('A pie requires a complete aggregate result. Re-query the original source grouped by category; do not chart a truncated preview.');
            if (chart.dataState === 'empty') throw new Error('The query returned no rows. There is no data to chart.');
            if (chart.dataState === 'duplicate-x') {
                const rows = (query ?? latestChartQuery(options.messages))?.result?.previewRows ?? [];
                const diagnostic = chartGrainDiagnostic(rows, chartAxis(chart) ?? '');
                throw new Error(
                    `${diagnostic ?? 'Repeated X values have ambiguous grain.'} Separate annual, quarterly and YTD periods. Rerun the source query, then pass its NEW artifactId to chartBuilder.`,
                );
            }
            if (chart.dataState === 'invalid-fields')
                throw new Error(
                    'Chart fields do not match the query result. Use real column names and numeric value fields from the selected query. A pie requires exactly one non-negative numeric series with a positive total.',
                );
            return { ...chart, embed: chatChartEmbed(options.toolCallId) };
        },
    });
}
