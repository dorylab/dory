import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { artifactMutationOutputSchema } from './shared';

export const artifactUnpinAction = defineWebAction({
    id: 'artifact.unpin',
    domain: 'artifact',
    kind: 'command',
    risk: 'low',
    inputSchema: z.object({ artifactId: z.string().min(1) }),
    outputSchema: artifactMutationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    audit: { allowInputFields: ['artifactId'], resource: (_ctx, input) => ({ type: 'artifact', id: input.artifactId }) },
    handler: async (ctx, input) => ctx.services.db.artifacts.unpin({ organizationId: ctx.organizationId, ...input }),
});
