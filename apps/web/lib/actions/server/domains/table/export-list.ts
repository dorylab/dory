import { z } from 'zod';

import { listTableExportRuns } from '@/lib/server/exports/service';
import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const tableExportListAction = defineWebAction({
    id: 'table.export.list',
    domain: 'table',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        connectionId: z.string().min(1),
        database: z.string().min(1),
        table: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.string().nullable().optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['query:read'],
    actors: ['user'],
    handler: (ctx, input) =>
        listTableExportRuns(ctx.services.db, {
            organizationId: ctx.organizationId,
            connectionId: input.connectionId,
            databaseName: input.database,
            tableName: input.table,
            limit: input.limit,
            cursor: input.cursor,
        }),
});
