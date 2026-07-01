import { z } from 'zod';
import { testConnectService } from '@/lib/connection/test-connect-service';
import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { connectionTestPayloadSchema, normalizeConnectionTestPayload } from './payload';

export const connectionTestAction = defineWebAction({
    id: 'connection.test',
    domain: 'connection',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ payload: connectionTestPayloadSchema }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['connections:read'],
    actors: ['user', 'mcp', 'automation'],
    handler: (ctx, input) => testConnectService(ctx.organizationId, normalizeConnectionTestPayload(input.payload) as any),
});
