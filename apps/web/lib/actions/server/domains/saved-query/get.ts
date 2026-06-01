import { z } from 'zod';
import { getSavedQueryOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext } from '../../operation-context';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const savedQueryGetAction = defineWebAction({
    id: 'savedQuery.get',
    domain: 'savedQuery',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), id: z.string().min(1), includeArchived: z.boolean().optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['saved_queries:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_get_saved_query',
        title: 'Get saved query',
        description: 'Get a saved SQL query by id for a Dory connection.',
    },
    handler: (ctx, input) => getSavedQueryOperation(actionOperationContext(ctx), input),
});
