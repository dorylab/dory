import { z } from 'zod';

import { reportEvidenceCandidates } from '@/lib/server/work-documents';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';

export const reportEvidenceCandidatesAction = defineWebAction({
    id: 'report.evidence.candidates',
    domain: 'report',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ documentId: z.string().min(1) }),
    outputSchema: z.object({ artifacts: z.array(z.object({ id: z.string(), title: z.string() })) }),
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    handler: (ctx, input) => reportEvidenceCandidates(ctx.services.db, { organizationId: ctx.organizationId, userId: ctx.userId, ...input }),
});
