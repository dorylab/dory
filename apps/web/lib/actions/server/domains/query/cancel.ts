import { z } from 'zod';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { writeWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const queryCancelAction = defineWebAction({
    id: 'query.cancel',
    domain: 'query',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), sessionId: z.string().min(1), identityId: z.string().min(1).optional() }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['query:write'],
    actors: ['user', 'automation'],
    handler: async (ctx, input) => {
        const connectionId = resolveConnectionId(ctx, input);
        const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
        if (typeof entry.instance.cancelQuery !== 'function') {
            throw new Error('Cancel is not supported by this connection.');
        }
        await entry.instance.cancelQuery(input.sessionId);
        return { ok: true };
    },
});
