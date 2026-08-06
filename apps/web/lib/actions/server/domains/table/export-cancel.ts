import { z } from 'zod';

import { cancelTableExportRun } from '@/lib/server/exports/service';
import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const tableExportCancelAction = defineWebAction({
    id: 'table.export.cancel',
    domain: 'table',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1), exportId: z.string().min(1) }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['query:read'],
    actors: ['user'],
    handler: (ctx, input) => cancelTableExportRun(ctx.services.db, ctx.organizationId, input.connectionId, input.exportId),
});
