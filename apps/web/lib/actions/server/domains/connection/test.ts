import { z } from 'zod';
import { testConnectService } from '@/lib/connection/test-connect-service';
import { defineWebAction } from '../../define-web-action';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

const connectionTestPayloadSchema = z
    .record(z.string(), z.unknown())
    .describe('Dory connection payload to validate before or after saving. Use the same driver-specific fields accepted by connection.create.');

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
    handler: (ctx, input) => testConnectService(ctx.organizationId, input.payload as any),
});
