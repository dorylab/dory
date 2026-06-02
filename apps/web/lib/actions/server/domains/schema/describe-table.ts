import { z } from 'zod';
import { describeTableOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext, actorAuditSource } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const schemaDescribeTableAction = defineWebAction({
    id: 'schema.describeTable',
    domain: 'schema',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), table: z.string().min(1), identityId: z.string().min(1).optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['connections:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_describe_table',
        title: 'Describe table',
        description: 'Return column metadata for a table in a Dory connection.',
    },
    handler: (ctx, input) => describeTableOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
});
