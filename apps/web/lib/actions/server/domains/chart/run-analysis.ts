import { z } from 'zod';
import { runAnalysisOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext, actorAuditSource } from '../../operation-context';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const chartRunAnalysisAction = defineWebAction({
    id: 'chart.runAnalysis',
    domain: 'chart',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        databaseName: z.string().nullable().optional(),
        resultRef: z.object({ sessionId: z.string().min(1), setIndex: z.number().int().min(0) }),
        resultContext: z.record(z.string(), z.unknown()),
        insight: z.record(z.string(), z.unknown()),
        trigger: z.record(z.string(), z.unknown()),
        tabId: z.string().min(1).optional(),
        identityId: z.string().min(1).optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['analysis:run'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_run_analysis',
        title: 'Run Dory analysis',
        description: 'Run a Dory analysis insight for a SQL result context.',
    },
    handler: (ctx, input) => runAnalysisOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'ai_analysis')), input),
});
