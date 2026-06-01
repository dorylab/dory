import { z } from 'zod';
import { runReadonlySqlOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext } from '../../operation-context';
import { readConnection } from '../../policies';
import { queryExecutionOutputSchema } from '../../schemas';

export const queryReadOnlyExecuteAction = defineWebAction({
    id: 'query.readOnlyExecute',
    domain: 'query',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        database: z.string().optional().nullable(),
        sql: z.string().min(1),
        limit: z.number().int().positive().max(1000).optional(),
        identityId: z.string().min(1).optional(),
    }),
    outputSchema: queryExecutionOutputSchema,
    permissions: readConnection,
    scopes: ['query:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    audit: {
        sourceByActor: {
            user: 'ai_sql_runner',
            agent: 'ai_sql_runner',
            mcp: 'mcp_sql_runner',
            automation: 'automation_sql',
        },
        allowInputFields: ['connectionId', 'identityId', 'database', 'limit'],
        inputSummary: input => ({
            connectionId: input.connectionId ?? null,
            identityId: input.identityId ?? null,
            database: input.database ?? null,
            limit: input.limit ?? null,
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
            resultSetCount: (output as any).session?.resultSetCount ?? null,
            totalSets: (output as any).meta?.totalSets ?? null,
        }),
    },
    mcp: {
        name: 'dory_run_readonly_sql',
        title: 'Run read-only SQL',
        description: 'Run read-only SQL against a Dory connection. Write statements are rejected.',
    },
    handler: (ctx, input) =>
        runReadonlySqlOperation(actionOperationContext(ctx), {
            ...input,
            source: ctx.actor.type === 'mcp' ? 'mcp' : 'ai',
        }),
});
