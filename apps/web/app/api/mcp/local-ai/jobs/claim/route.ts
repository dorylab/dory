import { setTimeout as sleep } from 'node:timers/promises';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getDBService } from '@dory/database';
import { ErrorCodes } from '@dory/shared/errors';
import { ResponseUtil } from '@/lib/result';
import { authenticateLocalAiBridgeRequest, localAiBridgeResponseContext } from '@/lib/server/local-ai/bridge';

export const runtime = 'nodejs';

const claimSchema = z.object({
    bridgeId: z.string().trim().min(1),
    waitMs: z.number().int().min(0).max(25_000).optional(),
});

export async function POST(req: Request) {
    const auth = await authenticateLocalAiBridgeRequest(req);
    if (!auth.ok) {
        return NextResponse.json(
            ResponseUtil.error({
                code: auth.status === 401 ? ErrorCodes.UNAUTHORIZED : ErrorCodes.FORBIDDEN,
                message: auth.message,
            }),
            { status: auth.status },
        );
    }

    const parsed = claimSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: parsed.error.issues[0]?.message ?? 'Invalid local AI claim payload.',
            }),
            { status: 400 },
        );
    }

    const db = await getDBService();
    const context = localAiBridgeResponseContext(auth.context);
    const waitUntil = Date.now() + (parsed.data.waitMs ?? 20_000);

    do {
        const job = await db.mcp.claimLocalAiJob({
            organizationId: context.organizationId,
            mcpTokenId: context.mcpTokenId,
            bridgeId: parsed.data.bridgeId,
        });

        if (job) {
            return NextResponse.json(
                ResponseUtil.success({
                    job: {
                        id: job.id,
                        provider: job.provider,
                        model: job.model,
                        prompt: job.prompt,
                        createdAt: job.createdAt,
                        expiresAt: job.expiresAt,
                    },
                }),
            );
        }

        if (Date.now() >= waitUntil) break;
        await sleep(1000);
    } while (true);

    return NextResponse.json(ResponseUtil.success({ job: null }));
}
