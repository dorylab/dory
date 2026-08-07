import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { artifactChartStateSchema, artifactMutationOutputSchema } from './shared';

export const artifactChartCreateAction = defineWebAction({
    id: 'artifact.chart.create',
    domain: 'artifact',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ sourceArtifactId: z.string().min(1), title: z.string().trim().min(1).max(160).nullable().optional(), chartState: artifactChartStateSchema }),
    outputSchema: artifactMutationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    handler: async (ctx, input) => {
        const row = await ctx.services.db.artifacts.createChart({
            organizationId: ctx.organizationId,
            ...input,
            createdByActorType: ctx.actor.type,
            createdByActorId: ctx.actor.id ?? ctx.userId,
        });
        return { id: row!.id, title: row!.title };
    },
});
