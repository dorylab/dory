import { listDatabasesOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext, actorAuditSource } from '../../operation-context';
import { readConnection } from '../../policies';
import { connectionIdInput, unknownOutputSchema } from '../../schemas';

export const schemaListDatabasesAction = defineWebAction({
    id: 'schema.listDatabases',
    domain: 'schema',
    kind: 'query',
    risk: 'read',
    inputSchema: connectionIdInput,
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['connections:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_list_databases',
        title: 'List databases',
        description: 'List databases for a Dory connection.',
    },
    handler: (ctx, input) => listDatabasesOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), input),
});
