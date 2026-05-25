import { tool, type ModelMessage } from 'ai';
import { z } from 'zod';

import { translateApi } from '@/app/api/utils/i18n';
import { buildResultAutoChartProfile, toChartResultPart } from '@dory/analysis/core/result-chart-profile';
import { Locale } from '@dory/i18n/routing';

function createChartInputSchema(locale: Locale) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    return z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        chartType: z.enum(['bar', 'line', 'area', 'pie']),
        data: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).default([]),
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
            const data = input.data.length > 0 ? input.data : findLatestSqlPreviewRows(options.messages);
            const profile = buildResultAutoChartProfile({
                rows: data,
                overrides: {
                    chartType: input.chartType,
                    xKey: input.xKey,
                    yKeys: input.yKeys,
                    categoryKey: input.categoryKey,
                    valueKey: input.valueKey,
                },
            });
            const result = toChartResultPart(profile, {
                title: input.title,
                description: input.description,
            });

            return (
                result ?? {
                    type: 'chart',
                    ...input,
                    data,
                }
            );
        },
    });
}

function findLatestSqlPreviewRows(messages: ModelMessage[]): Array<Record<string, unknown>> {
    for (const message of [...messages].reverse()) {
        const content = (message as any)?.content;
        if (!Array.isArray(content)) continue;

        for (const part of [...content].reverse()) {
            const value = extractToolResultValue(part);
            if (!value || typeof value !== 'object') continue;

            const result = value as Record<string, unknown>;
            if (result.type !== 'sql-result' || result.ok !== true || !Array.isArray(result.previewRows)) {
                continue;
            }

            return result.previewRows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
        }
    }

    return [];
}

function extractToolResultValue(part: unknown): unknown {
    if (!part || typeof part !== 'object') return null;

    const record = part as Record<string, any>;
    const output = record.output;
    if (output && typeof output === 'object' && output.type === 'json') {
        return output.value;
    }

    return record.result ?? record.value ?? null;
}
