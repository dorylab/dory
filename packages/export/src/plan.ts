import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { ExportPlan } from './types';

const filterSchema = z.object({
    col: z.string().min(1),
    kind: z.enum(['string', 'number', 'range']),
    op: z.enum(['contains', 'equals', 'startsWith', 'endsWith', 'empty', 'notEmpty', 'regex', 'eq', 'ne', 'gt', 'ge', 'lt', 'le', 'range']),
    value: z.string().optional(),
    valueTo: z.string().optional(),
    rangeValueType: z.enum(['number', 'date']).optional(),
    caseSensitive: z.boolean().optional(),
});

export const tableExportPlanSchema = z.object({
    version: z.literal(1),
    source: z.object({
        kind: z.literal('table'),
        connectionId: z.string().min(1),
        database: z.string().min(1),
        table: z.string().min(1),
    }),
    columns: z.array(z.string().min(1)).min(1).max(500),
    operations: z.object({
        filters: z.array(filterSchema).max(20),
        search: z.string().max(200).nullable(),
        searchColumns: z.array(z.string().min(1)).max(500),
        sort: z
            .object({
                column: z.string().min(1),
                direction: z.enum(['asc', 'desc']),
            })
            .nullable(),
    }),
    output: z.object({ format: z.enum(['csv', 'parquet', 'arrow']) }),
});

export function parseExportPlan(input: unknown): ExportPlan {
    return tableExportPlanSchema.parse(input);
}

export function hashExportPlan(plan: ExportPlan): string {
    return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}
