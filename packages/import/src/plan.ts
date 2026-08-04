import { fingerprint } from '@dory/dataset';
import { z } from 'zod';

import { IMPORT_PLAN_VERSION, TRANSFORM_VERSION, type ImportPlanV1 } from './types';

const columnTypeSchema = z.enum(['string', 'boolean', 'int64', 'float64', 'date', 'datetime']);
const parsingSchema = z.object({
    delimiter: z.enum([',', '\t', ';', '|']),
    hasHeader: z.boolean(),
    encoding: z.enum(['utf8', 'utf16le', 'utf16be', 'gb18030', 'big5', 'shift_jis', 'windows1252']),
    quoteChar: z.string().length(1),
});
export const importTargetSchema = z.object({
    mode: z.enum(['create', 'existing']),
    database: z.string().optional(),
    schema: z.string().optional(),
    table: z.string().trim().min(1).max(255),
});

export const importPlanV1Schema = z
    .object({
        version: z.literal(IMPORT_PLAN_VERSION),
        parsing: parsingSchema,
        target: importTargetSchema,
        columns: z
            .array(
                z.object({
                    source: z.string().min(1),
                    target: z.string().min(1).max(255),
                    targetType: columnTypeSchema,
                    ignored: z.boolean(),
                    order: z.number().int().nonnegative(),
                }),
            )
            .min(1),
        mode: z.enum(['append', 'replace']),
        batchSize: z.number().int().min(1).max(100_000),
        transform: z.object({
            version: z.literal(TRANSFORM_VERSION),
            operations: z.array(
                z.discriminatedUnion('kind', [
                    z.object({ kind: z.literal('rename'), source: z.string(), target: z.string() }),
                    z.object({ kind: z.literal('cast'), column: z.string(), targetType: columnTypeSchema }),
                    z.object({ kind: z.literal('ignore'), column: z.string() }),
                ]),
            ),
        }),
        sourceSchemaHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .superRefine((plan, context) => {
        const active = plan.columns.filter(column => !column.ignored);
        if (active.length === 0) {
            context.addIssue({ code: 'custom', message: 'At least one column must be imported', path: ['columns'] });
        }
        const targets = new Set<string>();
        const sources = new Set<string>();
        const orders = new Set<number>();
        for (const column of active) {
            const key = column.target;
            if (targets.has(key)) {
                context.addIssue({ code: 'custom', message: `Duplicate target column: ${column.target}`, path: ['columns'] });
            }
            targets.add(key);
        }
        for (const column of plan.columns) {
            if (sources.has(column.source)) {
                context.addIssue({ code: 'custom', message: `Duplicate source column: ${column.source}`, path: ['columns'] });
            }
            if (orders.has(column.order)) {
                context.addIssue({ code: 'custom', message: `Duplicate column order: ${column.order}`, path: ['columns'] });
            }
            sources.add(column.source);
            orders.add(column.order);
        }
        if (plan.target.mode === 'create' && plan.mode === 'replace') {
            context.addIssue({ code: 'custom', message: 'Replace is not available when creating a table', path: ['mode'] });
        }
    });

export function parseImportPlan(value: unknown): ImportPlanV1 {
    return importPlanV1Schema.parse(value) as ImportPlanV1;
}

export function parseImportTarget(value: unknown) {
    return importTargetSchema.parse(value);
}

export function hashImportPlan(plan: ImportPlanV1): string {
    return fingerprint(parseImportPlan(plan));
}
