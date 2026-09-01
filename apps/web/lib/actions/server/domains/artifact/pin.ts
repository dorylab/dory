import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { artifactMutationOutputSchema } from './shared';

export const artifactPinAction = defineWebAction({
    id: 'artifact.pin',
    domain: 'artifact',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ artifactId: z.string().min(1) }),
    outputSchema: artifactMutationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    audit: { allowInputFields: ['artifactId'], resource: (_ctx, input) => ({ type: 'artifact', id: input.artifactId }) },
    handler: async (ctx, input) => {
        const row = await ctx.services.db.artifacts.pin({
            organizationId: ctx.organizationId,
            artifactId: input.artifactId,
            pinnedByActorId: ctx.actor.id ?? ctx.userId,
        });
        return { id: row.id, title: row.title };
    },
});
