import { z } from 'zod';
import type { DBService } from '@dory/database';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';

export const localAiProgressSchema = z.object({
    bridgeId: z.string().min(1),
    requestId: z.string().min(1),
    entries: z
        .array(
            z.object({
                id: z.string().min(1).max(200),
                sequence: z.number().int().nonnegative(),
                revision: z.number().int().positive(),
                kind: z.enum(['text', 'tool']),
                phase: z.enum(['commentary', 'final']).optional(),
                text: z.string().max(200_000).optional(),
                toolName: z.string().max(200).optional(),
                state: z.enum(['running', 'completed', 'failed']).optional(),
                eventId: z.string().max(200).optional(),
            }),
        )
        .min(1)
        .max(32),
});

export async function saveLocalAiProgress(
    db: DBService,
    owner: { organizationId: string; userId: string; mcpTokenId: string },
    jobId: string,
    payload: z.infer<typeof localAiProgressSchema>,
) {
    if (JSON.stringify(payload).length > 512_000) throw new DatabaseError('Progress batch is too large.', 400);
    const turn = await db.works.getChatBridgeTurn({ ...owner, jobId });
    if (!turn || turn.requestId !== payload.requestId) throw new DatabaseError('This analysis turn is no longer active.', 409);
    await db.works.appendChatProgress({ ...owner, ...turn, entries: payload.entries, bridge: { jobId, bridgeId: payload.bridgeId, mcpTokenId: owner.mcpTokenId } });
}
