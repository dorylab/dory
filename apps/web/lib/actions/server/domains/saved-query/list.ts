import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

function clampLimit(limit?: number | null) {
    if (!Number.isFinite(limit ?? NaN)) return 25;
    return Math.max(1, Math.min(100, Math.floor(limit!)));
}

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

export const savedQueryListAction = defineWebAction({
    id: 'savedQuery.list',
    domain: 'savedQuery',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), limit: z.number().int().positive().optional(), includeArchived: z.boolean().optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['saved_queries:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_list_saved_queries',
        title: 'List saved queries',
        description: 'List saved SQL queries for a Dory connection.',
    },
    handler: async (ctx, input) => {
        const records = await ctx.services.db.savedQueries.list({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId: resolveConnectionId(ctx, input),
            includeArchived: input.includeArchived === true,
            limit: clampLimit(input.limit),
        });

        return {
            savedQueries: records.map(toSavedQueryPayload),
        };
    },
});
