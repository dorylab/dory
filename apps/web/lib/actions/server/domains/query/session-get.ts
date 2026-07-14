import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';

const inputSchema = z.object({
    sessionId: z.string().min(1),
});

const outputSchema = z
    .object({
        sessionId: z.string(),
        status: z.string(),
        errorMessage: z.string().nullable(),
        startedAt: z.unknown().nullable(),
        finishedAt: z.unknown().nullable(),
        durationMs: z.number().nullable(),
        resultSetCount: z.number(),
        source: z.string().nullable(),
    })
    .nullable();

export const querySessionGetAction = defineWebAction({
    id: 'query.session.get',
    domain: 'query',
    kind: 'query',
    risk: 'read',
    inputSchema,
    outputSchema,
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user', 'automation'],
    audit: {
        sourceByActor: {
            user: 'user_sql_console',
            automation: 'automation_sql',
        },
        allowInputFields: ['sessionId'],
        resource: (_ctx, input) => ({
            type: 'querySession',
            id: input.sessionId,
        }),
    },
    handler: (ctx, input) =>
        ctx.services.db.resultSets.getQuerySession({
            organizationId: ctx.organizationId,
            sessionId: input.sessionId,
        }),
});
