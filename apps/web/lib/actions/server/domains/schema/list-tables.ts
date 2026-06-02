import { z } from 'zod';
import { listTablesOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext, actorAuditSource } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const schemaListTablesAction = defineWebAction({
    id: 'schema.listTables',
    domain: 'schema',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), identityId: z.string().min(1).optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['connections:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_list_tables',
        title: 'List tables',
        description: 'List tables for a database in a Dory connection.',
    },
    handler: (ctx, input) => listTablesOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
});
