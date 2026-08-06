import { z } from 'zod';

import { DATASET_PROFILE_VERSION, type DatasetProfileV2 } from './types';

const importTypeSchema = z.enum(['string', 'boolean', 'int64', 'float64', 'date', 'datetime']);
const candidateTypeSchema = importTypeSchema.exclude(['string']);
const suggestedOperationSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('trim'), column: z.string().min(1) }),
    z.object({ kind: z.literal('emptyToNull'), column: z.string().min(1) }),
]);

export const datasetProfileV2Schema = z.object({
    version: z.literal(DATASET_PROFILE_VERSION),
    rows: z.number().int().nonnegative(),
    sampleRows: z.number().int().nonnegative(),
    columns: z.array(
        z.object({
            name: z.string().min(1),
            detectedType: importTypeSchema,
            nullCount: z.number().int().nonnegative(),
            nullRate: z.number().min(0).max(1),
            nonNullCount: z.number().int().nonnegative(),
            emptyCount: z.number().int().nonnegative(),
            emptyRate: z.number().min(0).max(1),
            whitespaceCount: z.number().int().nonnegative(),
            whitespaceRate: z.number().min(0).max(1),
            leadingZeroCount: z.number().int().nonnegative(),
            minLength: z.number().nonnegative().nullable(),
            maxLength: z.number().nonnegative().nullable(),
            averageLength: z.number().nonnegative().nullable(),
            min: z.union([z.string(), z.number()]).nullable(),
            max: z.union([z.string(), z.number()]).nullable(),
            mean: z.number().nullable(),
            candidates: z.array(
                z.object({
                    type: candidateTypeSchema,
                    validCount: z.number().int().nonnegative(),
                    invalidCount: z.number().int().nonnegative(),
                    validRate: z.number().min(0).max(1),
                }),
            ),
            sampleValues: z.array(z.string()),
            sample: z.object({
                basis: z.literal('sample'),
                rows: z.number().int().nonnegative(),
                distinctCount: z.number().int().nonnegative(),
                distinctRate: z.number().min(0).max(1),
                topValues: z.array(z.object({ value: z.string(), count: z.number().int().nonnegative(), rate: z.number().min(0).max(1) })),
                quantiles: z.object({ p25: z.number(), p50: z.number(), p75: z.number() }).nullable(),
            }),
            issues: z.array(
                z.object({
                    code: z.enum(['all_missing', 'empty_string', 'surrounding_whitespace', 'leading_zero', 'mixed_type']),
                    severity: z.enum(['info', 'warning']),
                    affectedCount: z.number().int().nonnegative(),
                    affectedRate: z.number().min(0).max(1),
                    examples: z.array(z.object({ sourceRow: z.number().int().positive(), value: z.string() })),
                    suggestedOperation: suggestedOperationSchema.optional(),
                }),
            ),
        }),
    ),
    preview: z.array(z.record(z.string(), z.unknown())),
    quality: z.object({
        totalIssues: z.number().int().nonnegative(),
        warningCount: z.number().int().nonnegative(),
        infoCount: z.number().int().nonnegative(),
        columnsWithIssues: z.number().int().nonnegative(),
    }),
});

export function parseDatasetProfile(value: unknown): DatasetProfileV2 {
    return datasetProfileV2Schema.parse(value) as DatasetProfileV2;
}
