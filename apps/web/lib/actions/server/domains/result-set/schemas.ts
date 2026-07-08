import { z } from 'zod';

export const resultSetSortSchema = z.object({
    column: z.string().min(1),
    direction: z.enum(['asc', 'desc']),
});

export const resultSetFilterSchema = z.object({
    col: z.string().min(1),
    kind: z.enum(['string', 'number', 'range']),
    op: z.enum(['contains', 'equals', 'startsWith', 'endsWith', 'empty', 'notEmpty', 'regex', 'eq', 'ne', 'gt', 'ge', 'lt', 'le', 'range']),
    value: z.string().optional(),
    valueTo: z.string().optional(),
    rangeValueType: z.enum(['number', 'date']).optional(),
    label: z.string().optional(),
    caseSensitive: z.boolean().optional(),
});

export const resultSetSearchSchema = z
    .object({
        text: z.string(),
        columns: z.array(z.string().min(1)).optional(),
    })
    .nullable()
    .optional();

export const resultSetOperationsSchema = {
    sorts: z.array(resultSetSortSchema).optional(),
    filters: z.array(resultSetFilterSchema).optional(),
    search: resultSetSearchSchema,
};
