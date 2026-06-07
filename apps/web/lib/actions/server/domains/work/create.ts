import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workOutputSchema } from './schemas';

export const workCreateAction = defineWebAction({
    id: 'work.create',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:create'],
    inputSchema: z.object({
        connectionId: z.string().min(1),
        goal: z.string().trim().min(1),
        title: z.string().trim().min(1).optional(),
    }),
    outputSchema: workOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        sourceByActor: {
            user: 'user_work',
            agent: 'ai_work',
            automation: 'automation_work',
        },
        allowInputFields: ['connectionId', 'title'],
        inputSummary: input => ({
            connectionId: input.connectionId,
            title: input.title ?? null,
            goalLength: input.goal.length,
        }),
        resource: (_ctx, input) => ({
            type: 'work',
            metadata: {
                connectionId: input.connectionId,
            },
        }),
        outputSummary: output => ({
            workId: output.id,
            status: output.status,
            connectionId: output.connectionId,
            createdBy: output.createdBy,
        }),
    },
    handler: async (ctx, input) => {
        const connection = await ctx.services.db.connections.getById(ctx.organizationId, input.connectionId);
        if (!connection) throw new Error('Connection not found.');

        return ctx.services.db.works.create({
            organizationId: ctx.organizationId,
            title: input.title ?? 'Untitled Work',
            goal: input.goal,
            connectionId: input.connectionId,
            createdBy: ctx.actor.type === 'user' ? 'user' : 'agent',
            createdByUserId: ctx.userId,
        });
    },
});
