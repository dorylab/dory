import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { readWorkspace, writeWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const savedQueryListFoldersAction = defineWebAction({
    id: 'savedQuery.listFolders',
    domain: 'savedQuery',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['saved_queries:read'],
    actors: ['user', 'automation'],
    handler: (ctx, input) => ctx.services.db.savedQueryFolders.list({ organizationId: ctx.organizationId, userId: ctx.userId, connectionId: resolveConnectionId(ctx, input) }),
});

export const savedQueryCreateFolderAction = defineWebAction({
    id: 'savedQuery.createFolder',
    domain: 'savedQuery',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), name: z.string().min(1).max(100) }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['saved_queries:write'],
    actors: ['user', 'automation'],
    handler: (ctx, input) =>
        ctx.services.db.savedQueryFolders.create({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId: resolveConnectionId(ctx, input),
            name: input.name,
        }),
});

export const savedQueryUpdateFolderAction = defineWebAction({
    id: 'savedQuery.updateFolder',
    domain: 'savedQuery',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1), patch: z.object({ name: z.string().min(1).max(100).optional() }) }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['saved_queries:write'],
    actors: ['user', 'automation'],
    handler: (ctx, input) =>
        ctx.services.db.savedQueryFolders.update({
            id: input.id,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId: resolveConnectionId(ctx, input),
            patch: input.patch,
        }),
});

export const savedQueryDeleteFolderAction = defineWebAction({
    id: 'savedQuery.deleteFolder',
    domain: 'savedQuery',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1) }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['saved_queries:write'],
    actors: ['user', 'automation'],
    handler: async (ctx, input) => {
        await ctx.services.db.savedQueryFolders.delete({ id: input.id, organizationId: ctx.organizationId, userId: ctx.userId, connectionId: resolveConnectionId(ctx, input) });
        return { deleted: [input.id] };
    },
});
