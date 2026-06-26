import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

function toSavedQueryPayload(record: any) {
    return {
        id: record.id,
        title: record.title,
        description: record.description ?? null,
        folderId: record.folderId ?? null,
        sqlText: record.sqlText,
        context: record.context ?? {},
        tags: Array.isArray(record.tags) ? record.tags : [],
        workId: record.workId ?? null,
        connectionId: record.connectionId ?? null,
        position: record.position ?? null,
        createdAt: record.createdAt ?? null,
        updatedAt: record.updatedAt ?? null,
        archivedAt: record.archivedAt ?? null,
    };
}

export const savedQueryGetAction = defineWebAction({
    id: 'savedQuery.get',
    domain: 'savedQuery',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1), includeArchived: z.boolean().optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['saved_queries:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_get_saved_query',
        title: 'Get saved query',
        description: 'Get a saved SQL query by id for a Dory connection.',
    },
    handler: async (ctx, input) => {
        const record = await ctx.services.db.savedQueries.getById({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId: resolveConnectionId(ctx, input),
            id: input.id,
            includeArchived: input.includeArchived === true,
        });

        if (!record) {
            throw new Error('Saved query not found.');
        }

        return {
            savedQuery: toSavedQueryPayload(record),
        };
    },
});
