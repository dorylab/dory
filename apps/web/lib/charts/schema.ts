import { z } from 'zod';

export const chartOptionsSchema = z
    .object({
        stacked: z.boolean().optional(),
        xKeyType: z.enum(['time', 'category', 'number']).optional(),
        sortBy: z.enum(['x', 'value']).optional(),
        sortDirection: z.enum(['asc', 'desc', 'none']).optional(),
        xAxisLabel: z.string().max(160).optional(),
        yAxisLabel: z.string().max(160).optional(),
        valueFormat: z
            .object({
                scale: z.number().positive().finite().optional().describe('Display divisor only, e.g. 100000000 for 亿. Never change the source values.'),
                precision: z.number().int().min(0).max(12).optional(),
                prefix: z.string().max(40).optional(),
                suffix: z.string().max(40).optional(),
            })
            .strict()
            .optional(),
    })
    .strict();
export const chartSeriesSchema = z.object({ key: z.string().min(1).max(300), label: z.string().max(300).optional(), color: z.string().max(100).optional() }).strict();
export const chartPresentationSchema = z
    .object({
        chartType: z.enum(['bar', 'line', 'area', 'pie']),
        title: z.string().max(300).optional(),
        description: z.string().max(2000).optional(),
        xKey: z.string().min(1).max(300).optional(),
        yKeys: z.array(chartSeriesSchema).min(1).max(10).optional(),
        categoryKey: z.string().min(1).max(300).optional(),
        valueKey: z.string().min(1).max(300).optional(),
        options: chartOptionsSchema.optional(),
    })
    .strict();

export const chartBuilderInputSchema = chartPresentationSchema.extend({
    artifactId: z.string().min(1).optional().describe('Existing query Artifact ID. Reads the verified result, including earlier turns. Never provide data rows.'),
});
