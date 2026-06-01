import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { queryExecutionOutputSchema } from '../../schemas';
import { executeSqlAction } from './execute-operation';

export const queryExecuteAction = defineWebAction({
    id: 'query.execute',
    domain: 'query',
    kind: 'command',
    risk: 'write',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        identityId: z.string().min(1).optional(),
        database: z.string().optional().nullable(),
        sql: z.string(),
        stopOnError: z.boolean().optional(),
        sessionId: z.string().optional(),
        tabId: z.string().optional(),
        source: z.string().optional(),
        refId: z.string().optional(),
    }),
    outputSchema: queryExecutionOutputSchema,
    permissions: writeWorkspace,
    scopes: ['query:write'],
    actors: ['user', 'automation'],
    audit: {
        sourceByActor: {
            user: 'user_sql_console',
            automation: 'automation_sql',
        },
        allowInputFields: ['connectionId', 'identityId', 'database', 'sessionId', 'tabId', 'source', 'refId'],
        inputSummary: input => ({
            connectionId: input.connectionId ?? null,
            identityId: input.identityId ?? null,
            database: input.database ?? null,
            sessionId: input.sessionId ?? null,
            tabId: input.tabId ?? null,
            source: input.source ?? null,
            refId: input.refId ?? null,
            sqlLength: input.sql.length,
        }),
        resource: (_ctx, input) => ({
            type: 'connection',
            id: input.connectionId ?? null,
            metadata: {
                database: input.database ?? null,
            },
        }),
        outputSummary: output => ({
            status: (output as any).session?.status ?? null,
            resultSetCount: (output as any).session?.resultSetCount ?? null,
        }),
    },
    handler: executeSqlAction,
});
