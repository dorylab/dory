import { tool } from 'ai';
import { z } from 'zod';

import { translateApi } from '@/app/api/utils/i18n';
import { buildQueryChart } from '@/lib/agent-runs/chart-result';
import { Locale } from '@dory/i18n/routing';

function createChartInputSchema(locale: Locale) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    return z.object({
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

export function createChartBuilderTool(locale: Locale) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const chartInputSchema = createChartInputSchema(locale);

    return tool({
        description: t('Api.Chat.ChartBuilder.Description'),
        inputSchema: chartInputSchema,
        execute: async (input, options) => {
            return buildQueryChart(input, options.messages);
        },
    });
}
