import { z } from 'zod';

import { tableExportPlanSchema } from '@dory/export';

import { createTableExportRun } from '@/lib/server/exports/service';
import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const tableExportCreateAction = defineWebAction({
    id: 'table.export.create',
    domain: 'table',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ plan: tableExportPlanSchema }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['query:read'],
    actors: ['user'],
    handler: (ctx, input) => createTableExportRun(ctx.services.db, { organizationId: ctx.organizationId, userId: ctx.userId, plan: input.plan }),
});
