import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { artifactChartStateSchema, artifactMutationOutputSchema } from './shared';

export const artifactChartUpdateAction = defineWebAction({
    id: 'artifact.chart.update',
    domain: 'artifact',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ artifactId: z.string().min(1), chartState: artifactChartStateSchema }),
    outputSchema: artifactMutationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    handler: async (ctx, input) => {
        const row = await ctx.services.db.artifacts.updateChart({ organizationId: ctx.organizationId, ...input });
        return { id: row.id, title: row.title };
    },
});
