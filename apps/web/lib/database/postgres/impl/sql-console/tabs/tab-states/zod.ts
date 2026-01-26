import { z } from 'zod';

export const tableDataViewSchema = z
    .object({
        limit: z.number().int().positive().optional(),
        orderBy: z.string().optional(),
        orderDirection: z.enum(['asc', 'desc']).optional(),
        where: z.string().optional(),
        page: z.number().int().positive().optional(),
    })
    .optional();

export const tabPayloadSchema = z.object({
    tabId: z.string(),
    title: z.string().optional(),
    content: z.string().optional(), 
    tabType: z.enum(['sql', 'table']),
    tabName: z.string().optional(),
    orderIndex: z.number().int().nonnegative().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),

    // Used for table type
    databaseName: z.string().optional().nullable(),
    tableName: z.string().optional().nullable(),
    activeSubTab: z.enum(['data', 'structure', 'indexes', 'stats', 'overview']).optional(),
    dataView: tableDataViewSchema,
});

export const resultMetaSchema = z
    .object({
        rows: z.number().optional(),
        columns: z.number().optional(),
        durationMs: z.number().optional(),
    })
    .optional();

export const bodySchema = z.object({
    tabId: z.string(),
    state: tabPayloadSchema,
    resultMeta: resultMetaSchema,
});
