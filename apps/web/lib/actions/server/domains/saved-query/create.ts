import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { writeWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const savedQueryCreateAction = defineWebAction({
    id: 'savedQuery.create',
    domain: 'savedQuery',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        id: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional().nullable(),
        folderId: z.string().optional().nullable(),
        sqlText: z.string().min(1),
        context: z.record(z.string(), z.unknown()).optional().nullable(),
        tags: z.array(z.string()).optional().nullable(),
        workId: z.string().optional().nullable(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['saved_queries:write'],
    actors: ['user', 'automation'],
    handler: (ctx, input) =>
        ctx.services.db.savedQueries.create({
            ...input,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId: resolveConnectionId(ctx, input),
        }),
});
