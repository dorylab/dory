import { tool } from 'ai';
import { z } from 'zod';

import { translateApi } from '@/app/api/utils/i18n';
import { buildChartFromQuery, buildQueryChart, type ChartQuery } from '@/lib/agent-runs/chart-result';
import { chatChartEmbed } from '@/lib/agent-runs/chat-chart-layout';
import { Locale } from '@dory/i18n/routing';

function createChartInputSchema(locale: Locale) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    return z.object({
        artifactId: z
            .string()
            .min(1)
            .optional()
            .describe('Existing query Artifact ID to chart, including results from an earlier turn. The server rereads and validates this result.'),
        title: z.string().optional(),
        description: z.string().optional(),
        chartType: z.enum(['bar', 'line', 'area', 'pie']),
        xKey: z.string().optional(),
        yKeys: z
            .array(
                z.object({
                    key: z.string().min(1, t('Api.Chat.ChartBuilder.Errors.YKeyRequired')),
                    label: z.string().optional(),
                    color: z.string().optional(),
                }),
            )
            .optional(),
        categoryKey: z.string().optional(),
        valueKey: z.string().optional(),
        options: z
            .object({
                stacked: z.boolean().optional(),
                xKeyType: z.enum(['time', 'category', 'number']).optional(),
                sortBy: z.enum(['x', 'value']).optional(),
            })
            .optional(),
    });
}

export function createChartBuilderTool(locale: Locale, resolveArtifact?: (artifactId: string) => Promise<ChartQuery>) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const chartInputSchema = createChartInputSchema(locale);

    return tool({
        description: `${t('Api.Chat.ChartBuilder.Description')} For an earlier query, pass its returned artifactId. Never supply data rows. Without artifactId, only the latest SQL result in this turn is used. Missing data is an error; rerun SQL or select a real query Artifact instead of repeating the same call. Insert the returned embed on its own line in your answer at the relevant discussion, with prose before and after it.`,
        inputSchema: chartInputSchema,
        execute: async (input, options) => {
            const { artifactId, ...config } = input;
            if (artifactId && !resolveArtifact) throw new Error('Saved query charts require an active Dory Run. Execute sqlRunner in this turn before creating the chart.');
            const chart = artifactId && resolveArtifact ? buildChartFromQuery(config, await resolveArtifact(artifactId)) : buildQueryChart(config, options.messages);
            if (chart.dataState === 'missing')
                throw new Error(
                    'No successful query result is available in this turn. Pass the artifactId returned by an earlier SQL query, or execute sqlRunner before creating the chart. Do not retry unchanged chart parameters.',
                );
            if (chart.dataState === 'invalid-fields')
                throw new Error('Chart fields do not match the query result. Use real column names and numeric value fields from the selected query.');
            return { ...chart, embed: chatChartEmbed(options.toolCallId) };
        },
    });
}
