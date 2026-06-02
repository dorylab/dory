import { z } from 'zod';
import { listSavedQueriesOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext } from '../../operation-context';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

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
    handler: (ctx, input) => listSavedQueriesOperation(actionOperationContext(ctx), input),
});
