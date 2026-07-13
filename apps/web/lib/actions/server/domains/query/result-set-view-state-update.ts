import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';

const inputSchema = z.object({
    sessionId: z.string().min(1),
    setIndex: z.number().int().nonnegative(),
    viewState: z.unknown().nullable().optional(),
});

const outputSchema = z.object({
    ok: z.literal(true),
});

export const queryResultSetViewStateUpdateAction = defineWebAction({
    id: 'query.resultSet.viewState.update',
    domain: 'query',
    kind: 'command',
    risk: 'write',
    inputSchema,
    outputSchema,
    permissions: writeWorkspace,
    scopes: ['query:write'],
    actors: ['user', 'automation'],
    requiresConfirmation: false,
    audit: {
        sourceByActor: {
            user: 'user_sql_console',
            automation: 'automation_sql',
        },
        allowInputFields: ['sessionId', 'setIndex'],
        resource: (_ctx, input) => ({
            type: 'querySession',
            id: input.sessionId,
            metadata: {
                setIndex: input.setIndex,
            },
        }),
    },
    handler: async (ctx, input) => {
        await ctx.services.db.resultSets.updateResultSetViewState({
            organizationId: ctx.organizationId,
            sessionId: input.sessionId,
            setIndex: input.setIndex,
            viewState: input.viewState ?? null,
        });
        return { ok: true as const };
    },
});
