import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { queryExecutionOutputSchema } from '../../schemas';
import { readWorkspace } from '../../policies';

export const workGetRunEventResultAction = defineWebAction({
    id: 'work.getRunEventResult',
    domain: 'work',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        workId: z.string().min(1),
        eventId: z.string().min(1),
    }),
    outputSchema: z.object({
        tabId: z.string(),
        sessionId: z.string(),
        query: queryExecutionOutputSchema,
    }),
    permissions: readWorkspace,
    scopes: ['works:read'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['workId', 'eventId'],
        resource: (_ctx, input) => ({ type: 'work', id: input.workId }),
    },
    handler: async (ctx, input) => {
        const event = await ctx.services.db.works.getRunEventById({
            organizationId: ctx.organizationId,
            workId: input.workId,
            id: input.eventId,
        });
        if (!event) throw new Error('Work run event not found.');
        if (event.type !== 'sql_executed') throw new Error('Work run event does not contain SQL results.');

        const payload = event.payload ?? {};
        const query = payload.query;
        const tabId = payload.tabId;
        const sessionId = payload.sessionId;
        if (!query || typeof query !== 'object') throw new Error('Work run SQL result is missing.');
        if (typeof tabId !== 'string' || !tabId) throw new Error('Work run SQL tab is missing.');
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('Work run SQL session is missing.');

        return {
            tabId,
            sessionId,
            query: query as any,
        };
    },
});
