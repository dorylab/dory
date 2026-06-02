import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { writeWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const savedQueryUpdateAction = defineWebAction({
    id: 'savedQuery.update',
    domain: 'savedQuery',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1), patch: z.record(z.string(), z.unknown()) }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['saved_queries:write'],
    actors: ['user', 'automation'],
    handler: (ctx, input) =>
        ctx.services.db.savedQueries.update({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            id: input.id,
            connectionId: resolveConnectionId(ctx, input),
            patch: input.patch as any,
        }),
});
