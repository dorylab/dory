import { z } from 'zod';
import { getTableProfileOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext, actorAuditSource } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const tableGetIndexesAction = defineWebAction<any, any>({
    id: 'table.getIndexes' as any,
    domain: 'table',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1).optional(), database: z.string().min(1), table: z.string().min(1), identityId: z.string().min(1).optional() }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['schema:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_get_table_indexes',
        title: 'Get table indexes',
        description: 'Get indexes for a table in a Dory connection.',
    },
    handler: async (ctx, input) => {
        const profile = await getTableProfileOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input);
        return { indexes: (profile as any).indexes ?? [] };
    },
});
