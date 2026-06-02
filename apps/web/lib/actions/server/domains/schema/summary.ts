import { z } from 'zod';
import { getDatabaseSummaryOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext, actorAuditSource } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const schemaGetDatabaseSummaryAction = defineWebAction({
    id: 'schema.getDatabaseSummary',
    domain: 'schema',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        database: z.string().min(1),
        catalog: z.string().min(1).optional(),
        schema: z.string().min(1).optional(),
        identityId: z.string().min(1).optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['schema:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_get_database_summary',
        title: 'Get database summary',
        description: 'Return a compact database summary for a Dory connection.',
    },
    handler: (ctx, input) => getDatabaseSummaryOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
});
