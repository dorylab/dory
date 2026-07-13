import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';

const readResultRowsInputSchema = z.object({
    resultSetId: z.string().min(1),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().max(5000).optional(),
    sorts: z
        .array(
            z.object({
                column: z.string().min(1),
                direction: z.enum(['asc', 'desc']),
            }),
        )
        .optional(),
    filters: z
        .array(
            z.object({
                col: z.string().min(1),
                kind: z.enum(['string', 'number', 'range']),
                op: z.enum(['contains', 'equals', 'startsWith', 'endsWith', 'empty', 'notEmpty', 'regex', 'eq', 'ne', 'gt', 'ge', 'lt', 'le', 'range']),
                value: z.string().optional(),
                valueTo: z.string().optional(),
                rangeValueType: z.enum(['number', 'date']).optional(),
                label: z.string().optional(),
                caseSensitive: z.boolean().optional(),
            }),
        )
        .optional(),
    search: z
        .object({
            text: z.string(),
            columns: z.array(z.string().min(1)).optional(),
        })
        .nullable()
        .optional(),
});

const resultSetRowsOutputSchema = z.object({
    resultSetId: z.string(),
    rows: z.array(z.record(z.string(), z.unknown())),
    offset: z.number(),
    limit: z.number(),
    rowCount: z.number().nullable(),
    unfilteredRowCount: z.number().nullable().optional(),
    columns: z.array(z.unknown()),
    dataAvailability: z.string(),
});

export const resultSetRowsReadAction = defineWebAction({
    id: 'resultSet.rows.read',
    domain: 'resultSet',
    kind: 'query',
    risk: 'read',
    inputSchema: readResultRowsInputSchema,
    outputSchema: resultSetRowsOutputSchema,
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user', 'automation'],
    audit: {
        sourceByActor: {
            user: 'user_sql_console',
            automation: 'automation_sql',
        },
        allowInputFields: ['resultSetId', 'offset', 'limit', 'sorts', 'filters', 'search'],
        inputSummary: input => ({
            resultSetId: input.resultSetId,
            offset: input.offset ?? 0,
            limit: input.limit ?? null,
            sorts: input.sorts?.length ?? 0,
            filters: input.filters?.length ?? 0,
            search: input.search?.text ? true : undefined,
        }),
        resource: (_ctx, input) => ({
            type: 'resultSet',
            id: input.resultSetId,
        }),
        outputSummary: output => ({
            rowCount: output.rowCount,
            returnedRows: output.rows.length,
            dataAvailability: output.dataAvailability,
        }),
    },
    handler: (ctx, input) =>
        ctx.services.db.resultSets.readRows({
            organizationId: ctx.organizationId,
            resultSetId: input.resultSetId,
            offset: input.offset ?? 0,
            limit: input.limit ?? 1000,
            sorts: input.sorts,
            filters: input.filters,
            search: input.search,
        }),
});
