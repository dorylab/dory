import { z } from 'zod';
import { searchSchemaOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext, actorAuditSource } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const schemaSearchAction = defineWebAction({
    id: 'schema.search',
    domain: 'schema',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        query: z.string(),
        database: z.string().min(1).optional(),
        limit: z.number().int().positive().max(100).optional(),
        includeColumns: z.boolean().optional(),
        identityId: z.string().min(1).optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['schema:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_search_schema',
        title: 'Search schema',
        description: 'Search tables, views, and columns by name, type, or comment.',
    },
    handler: (ctx, input) => searchSchemaOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
});
