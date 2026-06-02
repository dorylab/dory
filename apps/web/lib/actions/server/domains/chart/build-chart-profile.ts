import { z } from 'zod';
import { buildChartProfileOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const chartBuildChartProfileAction = defineWebAction({
    id: 'chart.buildChartProfile',
    domain: 'chart',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        rows: z.array(z.record(z.string(), z.unknown())),
        columns: z.unknown().optional(),
        stats: z.record(z.string(), z.unknown()).nullable().optional(),
        overrides: z.record(z.string(), z.unknown()).optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['analysis:run'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_build_chart_profile',
        title: 'Build Dory chart profile',
        description: 'Build Dory automatic chart profile from result rows and columns.',
    },
    handler: (_ctx, input) => buildChartProfileOperation(input),
});
