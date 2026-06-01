import { z } from 'zod';
import { getMonitoringSummaryOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const schemaGetMonitoringSummaryAction = defineWebAction({
    id: 'schema.getMonitoringSummary',
    domain: 'schema',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        filters: z.record(z.string(), z.unknown()).optional().nullable(),
        includeTimeline: z.boolean().optional(),
        includeSlowQueries: z.boolean().optional(),
        includeErrorQueries: z.boolean().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
        identityId: z.string().min(1).optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['monitoring:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_get_monitoring_summary',
        title: 'Get monitoring summary',
        description: 'Return query monitoring summary and query samples for a Dory connection.',
    },
    handler: (ctx, input) => getMonitoringSummaryOperation(actionOperationContext(ctx, ctx.actor.type === 'mcp' ? 'mcp_monitoring' : 'dory_monitoring'), input as any),
});
