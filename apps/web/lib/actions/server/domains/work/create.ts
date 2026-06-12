import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { workOutputSchema, workScopeSchema, workTypeSchema } from './schemas';
import { generateWorkTitle } from './title';

export const workCreateAction = defineWebAction({
    id: 'work.create',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:create'],
    inputSchema: z.object({
        connectionId: z.string().min(1),
        goal: z.string().trim().min(1),
        workType: workTypeSchema.default('investigation'),
        scope: workScopeSchema.optional(),
        initialContext: z.string().trim().optional(),
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
        allowInputFields: ['connectionId', 'title', 'workType'],
        inputSummary: input => ({
            connectionId: input.connectionId,
            title: input.title ?? null,
            workType: input.workType,
            goalLength: input.goal.length,
            initialContextLength: input.initialContext?.length ?? 0,
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
        const title =
            input.title?.trim() ||
            (await generateWorkTitle(ctx, {
                goal: input.goal,
                workType: input.workType,
                scope: input.scope ?? null,
                initialContext: input.initialContext ?? null,
            }));

        return ctx.services.db.works.create({
            organizationId: ctx.organizationId,
            title,
            goal: input.goal,
            workType: input.workType,
            scope: input.scope ?? null,
            initialContext: input.initialContext ?? null,
            connectionId: input.connectionId,
            createdBy: ctx.actor.type === 'user' ? 'user' : 'agent',
            createdByUserId: ctx.userId,
        });
    },
});
