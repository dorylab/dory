import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { artifactMutationOutputSchema } from './shared';

export const artifactRenameAction = defineWebAction({
    id: 'artifact.rename',
    domain: 'artifact',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ artifactId: z.string().min(1), title: z.string().trim().min(1).max(160) }),
    outputSchema: artifactMutationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    audit: { allowInputFields: ['artifactId', 'title'], resource: (_ctx, input) => ({ type: 'artifact', id: input.artifactId }) },
    handler: async (ctx, input) => {
        const row = await ctx.services.db.artifacts.rename({ organizationId: ctx.organizationId, ...input });
        return { id: row.id, title: row.title };
    },
});
