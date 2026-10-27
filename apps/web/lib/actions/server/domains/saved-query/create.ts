import { z } from 'zod';
import { buildSqlFallbackName } from '@dory/shared/utils/sql-name';
import { createSqlNamer } from '@/lib/server/sql-naming';
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
        title: z.string().optional().nullable(),
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
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_create_saved_query',
        title: 'Create saved query',
        description: 'Create a saved SQL query in Dory for a connection.',
    },
    handler: async (ctx, input) => {
        const autoName = !input.title?.trim();
        const record = await ctx.services.db.savedQueries.create({
            ...input,
            title: autoName ? buildSqlFallbackName(input.sqlText, ctx.locale) : input.title!,
            autoName,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId: resolveConnectionId(ctx, input),
        });
        const naming = autoName
            ? await createSqlNamer(ctx).queue({ type: 'savedQuery', id: record.id, organizationId: ctx.organizationId, userId: ctx.userId }, record.sqlText)
            : null;
        return { ...record, ...naming };
    },
});
