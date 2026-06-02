import { z } from 'zod';
import { buildResultContextOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const chartBuildResultContextAction = defineWebAction({
    id: 'chart.buildResultContext',
    domain: 'chart',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        sessionId: z.string().min(1),
        setIndex: z.number().int().min(0).default(0),
        sqlText: z.string().optional(),
        databaseName: z.string().nullable().optional(),
        rowCount: z.number().int().min(0).optional(),
        columns: z.array(z.record(z.string(), z.unknown())).optional(),
        stats: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['analysis:run'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_build_result_context',
        title: 'Build Dory result context',
        description: 'Build Dory analysis result context from SQL result metadata.',
    },
    handler: (_ctx, input) => buildResultContextOperation(input),
});
