import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';

const findingVerificationInputSchema = z.object({
    workId: z.string().min(1),
    findingId: z.string().min(1),
});

const findingVerificationOutputSchema = z.object({
    id: z.string(),
    verifiedAt: z.coerce.date().nullable(),
    verifiedByUserId: z.string().nullable(),
});

export const workVerifyFindingAction = defineWebAction({
    id: 'work.finding.verify',
    domain: 'work',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: findingVerificationInputSchema,
    outputSchema: findingVerificationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    audit: { allowInputFields: ['workId', 'findingId'], resource: (_ctx, input) => ({ type: 'finding', id: input.findingId }) },
    handler: async (ctx, input) => {
        const finding = await ctx.services.db.works.setFindingVerification({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            workId: input.workId,
            findingId: input.findingId,
            verified: true,
        });
        return { id: finding.id, verifiedAt: finding.verifiedAt, verifiedByUserId: finding.verifiedByUserId };
    },
});

export const workUnverifyFindingAction = defineWebAction({
    id: 'work.finding.unverify',
    domain: 'work',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: findingVerificationInputSchema,
    outputSchema: findingVerificationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    audit: { allowInputFields: ['workId', 'findingId'], resource: (_ctx, input) => ({ type: 'finding', id: input.findingId }) },
    handler: async (ctx, input) => {
        const finding = await ctx.services.db.works.setFindingVerification({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            workId: input.workId,
            findingId: input.findingId,
            verified: false,
        });
        return { id: finding.id, verifiedAt: finding.verifiedAt, verifiedByUserId: finding.verifiedByUserId };
    },
});
