import { z } from 'zod';
import { testConnectService } from '@/lib/connection/test-connect-service';
import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const connectionTestAction = defineWebAction({
    id: 'connection.test',
    domain: 'connection',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ payload: z.any() }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['connections:read'],
    actors: ['user', 'automation'],
    handler: (ctx, input) => testConnectService(ctx.organizationId, input.payload),
});
