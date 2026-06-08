import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workOutputSchema, workScopeSchema, workTypeSchema } from './schemas';

export const workUpdateAction = defineWebAction({
    id: 'work.update',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:update'],
    inputSchema: z.object({
        id: z.string().min(1),
        title: z.string().trim().min(1).optional(),
        connectionId: z.string().min(1).optional(),
        goal: z.string().trim().min(1).optional(),
        workType: workTypeSchema.optional(),
        scope: workScopeSchema.optional(),
        initialContext: z.string().trim().nullable().optional(),
    }),
    outputSchema: workOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'automation'],
    audit: {
        allowInputFields: ['id', 'connectionId', 'title', 'workType'],
        inputSummary: input => ({
            id: input.id,
            connectionId: input.connectionId ?? null,
            title: input.title ?? null,
            workType: input.workType ?? null,
            goalLength: input.goal?.length ?? 0,
            initialContextLength: input.initialContext?.length ?? 0,
        }),
        resource: (_ctx, input) => ({ type: 'work', id: input.id }),
    },
    handler: async (ctx, input) => {
        if (input.connectionId) {
            const connection = await ctx.services.db.connections.getById(ctx.organizationId, input.connectionId);
            if (!connection) throw new Error('Connection not found.');
        }

        return ctx.services.db.works.update({
            organizationId: ctx.organizationId,
            id: input.id,
            patch: {
                title: input.title,
                connectionId: input.connectionId,
                goal: input.goal,
                workType: input.workType,
                scope: input.scope,
                initialContext: input.initialContext,
            },
        });
    },
});
