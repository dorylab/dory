import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { writeWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const savedQueryReorderAction = defineWebAction({
    id: 'savedQuery.reorder',
    domain: 'savedQuery',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), folderId: z.string().nullable().optional(), orderedIds: z.array(z.string()) }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['saved_queries:write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_reorder_saved_queries',
        title: 'Reorder saved queries',
        description: 'Reorder saved SQL queries within a Dory folder or connection.',
    },
    handler: async (ctx, input) => {
        await ctx.services.db.savedQueries.reorder({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId: resolveConnectionId(ctx, input),
            folderId: input.folderId ?? null,
            orderedIds: input.orderedIds,
        });
        return { ok: true };
    },
});

export const savedQueryReorderFoldersAction = defineWebAction({
    id: 'savedQuery.reorderFolders',
    domain: 'savedQuery',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), orderedIds: z.array(z.string()) }),
    outputSchema: unknownOutputSchema,
    permissions: writeWorkspace,
    scopes: ['saved_queries:write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_reorder_saved_query_folders',
        title: 'Reorder saved query folders',
        description: 'Reorder saved query folders for a Dory connection.',
    },
    handler: async (ctx, input) => {
        await ctx.services.db.savedQueryFolders.reorder({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId: resolveConnectionId(ctx, input),
            orderedIds: input.orderedIds,
        });
        return { ok: true };
    },
});
