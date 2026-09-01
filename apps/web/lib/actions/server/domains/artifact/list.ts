import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { artifactListOutputSchema, artifactTypeSchema } from './shared';

export const artifactListAction = defineWebAction({
    id: 'artifact.list',
    domain: 'artifact',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        query: z.string().max(160).nullable().optional(),
        types: z.array(artifactTypeSchema).max(3).optional(),
        pinnedOnly: z.boolean().optional(),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().max(100).optional(),
    }),
    outputSchema: artifactListOutputSchema,
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    audit: { allowInputFields: ['query', 'types', 'pinnedOnly', 'offset', 'limit'] },
    handler: (ctx, input) => ctx.services.db.artifacts.list({ organizationId: ctx.organizationId, ...input }),
});
