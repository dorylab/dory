import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';

const readResultRowsInputSchema = z.object({
    resultSetId: z.string().min(1),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().max(5000).optional(),
});

const resultSetRowsOutputSchema = z.object({
    resultSetId: z.string(),
    rows: z.array(z.record(z.string(), z.unknown())),
    offset: z.number(),
    limit: z.number(),
    rowCount: z.number().nullable(),
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
        allowInputFields: ['resultSetId', 'offset', 'limit'],
        inputSummary: input => ({
            resultSetId: input.resultSetId,
            offset: input.offset ?? 0,
            limit: input.limit ?? null,
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
        }),
});
