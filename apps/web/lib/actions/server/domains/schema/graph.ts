import { z } from 'zod';
import { getSchemaGraphOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext, actorAuditSource } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const schemaGetGraphAction = defineWebAction({
    id: 'schema.getGraph',
    domain: 'schema',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        database: z.string().min(1),
        schemas: z.array(z.string().min(1)).max(100).optional(),
        focusTables: z
            .array(
                z.object({
                    schema: z.string().min(1).optional().nullable(),
                    name: z.string().min(1),
                }),
            )
            .max(100)
            .optional(),
        depth: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
        columnMode: z.enum(['all', 'keys']).optional(),
        identityId: z.string().min(1).optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['schema:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_get_schema_graph',
        title: 'Get schema graph',
        description: 'Return tables, columns, primary keys, and physical foreign-key relationships for a Dory connection.',
    },
    handler: (ctx, input) => getSchemaGraphOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
});
