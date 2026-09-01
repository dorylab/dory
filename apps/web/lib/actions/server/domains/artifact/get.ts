import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { artifactDetailOutputSchema } from './shared';

export const artifactGetAction = defineWebAction({
    id: 'artifact.get',
    domain: 'artifact',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ artifactId: z.string().min(1) }),
    outputSchema: artifactDetailOutputSchema,
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    audit: { allowInputFields: ['artifactId'], resource: (_ctx, input) => ({ type: 'artifact', id: input.artifactId }) },
    handler: (ctx, input) => ctx.services.db.artifacts.get({ organizationId: ctx.organizationId, artifactId: input.artifactId }),
});
