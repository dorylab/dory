import { fingerprint } from '@dory/dataset';
import { z } from 'zod';

import { IMPORT_PLAN_VERSION, TRANSFORM_VERSION, type ImportColumnMappingV1, type ImportPlanV1, type TransformOperationV1, type TransformPlanV1 } from './types';

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

const transformOperationSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('trim'), column: z.string().min(1) }),
    z.object({ kind: z.literal('lowercase'), column: z.string().min(1) }),
    z.object({ kind: z.literal('replace'), column: z.string().min(1), find: z.string().min(1).max(1024), replacement: z.string().max(1024) }),
    z.object({ kind: z.literal('emptyToNull'), column: z.string().min(1) }),
    z.object({ kind: z.literal('dropInvalid'), column: z.string().min(1), targetType: columnTypeSchema.exclude(['string']), dropNulls: z.boolean() }),
    z.object({ kind: z.literal('rename'), source: z.string(), target: z.string() }),
    z.object({ kind: z.literal('cast'), column: z.string(), targetType: columnTypeSchema }),
    z.object({ kind: z.literal('ignore'), column: z.string() }),
]);

export const transformPlanV1Schema = z.object({
    version: z.literal(TRANSFORM_VERSION),
    operations: z.array(transformOperationSchema),
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
        transform: transformPlanV1Schema,
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
        const sourceNames = new Set(plan.columns.map(column => column.source));
        const singletonOperations = new Set<string>();
        for (const operation of cleaningTransformOperations(plan.transform.operations)) {
            if (!sourceNames.has(operation.column)) {
                context.addIssue({ code: 'custom', message: `Transform column does not exist: ${operation.column}`, path: ['transform', 'operations'] });
            }
            if (operation.kind === 'replace') continue;
            const key = `${operation.kind}:${operation.column}`;
            if (singletonOperations.has(key)) {
                context.addIssue({ code: 'custom', message: `Duplicate ${operation.kind} transform for column ${operation.column}`, path: ['transform', 'operations'] });
            }
            singletonOperations.add(key);
            if (operation.kind === 'dropInvalid') {
                const mapping = plan.columns.find(column => column.source === operation.column);
                if (!mapping || mapping.ignored || mapping.targetType !== operation.targetType) {
                    context.addIssue({ code: 'custom', message: `dropInvalid must match the active target type for ${operation.column}`, path: ['transform', 'operations'] });
                }
            }
        }
    });

export function parseImportPlan(value: unknown): ImportPlanV1 {
    const parsed = importPlanV1Schema.parse(value) as ImportPlanV1;
    return { ...parsed, transform: canonicalTransformPlan(parsed.columns, parsed.transform.operations) };
}

export function parseImportTarget(value: unknown) {
    return importTargetSchema.parse(value);
}

export function hashImportPlan(plan: ImportPlanV1): string {
    return fingerprint(parseImportPlan(plan));
}

export function cleaningTransformOperations(operations: TransformOperationV1[]) {
    return operations.filter(
        (operation): operation is Extract<TransformOperationV1, { kind: 'trim' | 'lowercase' | 'replace' | 'emptyToNull' | 'dropInvalid' }> =>
            operation.kind === 'trim' || operation.kind === 'lowercase' || operation.kind === 'replace' || operation.kind === 'emptyToNull' || operation.kind === 'dropInvalid',
    );
}

export function canonicalTransformPlan(columns: ImportColumnMappingV1[], operations: TransformOperationV1[]): TransformPlanV1 {
    const cleaning = cleaningTransformOperations(operations);
    const valueOperations = cleaning.filter(operation => operation.kind !== 'dropInvalid');
    const dropOperations = cleaning.filter(operation => operation.kind === 'dropInvalid');
    const terminal: TransformOperationV1[] = [];
    for (const column of [...columns].sort((left, right) => left.order - right.order)) {
        if (column.ignored) {
            terminal.push({ kind: 'ignore', column: column.source });
            continue;
        }
        if (column.source !== column.target) terminal.push({ kind: 'rename', source: column.source, target: column.target });
        terminal.push({ kind: 'cast', column: column.target, targetType: column.targetType });
    }
    return { version: TRANSFORM_VERSION, operations: [...valueOperations, ...dropOperations, ...terminal] };
}
