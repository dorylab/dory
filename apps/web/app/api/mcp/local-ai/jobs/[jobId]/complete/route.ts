import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getDBService } from '@dory/database';
import { ErrorCodes } from '@dory/shared/errors';
import { ResponseUtil } from '@/lib/result';
import { assertLocalAiBridgePayloadSize, authenticateLocalAiBridgeRequest, localAiBridgeResponseContext } from '@/lib/server/local-ai/bridge';

export const runtime = 'nodejs';

const completeSchema = z.discriminatedUnion('ok', [
    z.object({
        ok: z.literal(true),
        bridgeId: z.string().trim().min(1),
        text: z.string(),
        stdout: z.string().optional().nullable(),
        stderr: z.string().optional().nullable(),
    }),
    z.object({
        ok: z.literal(false),
        bridgeId: z.string().trim().min(1),
        errorMessage: z.string().trim().min(1).max(2000),
        stdout: z.string().optional().nullable(),
        stderr: z.string().optional().nullable(),
    }),
]);

type RouteContext = {
    params: Promise<{ jobId: string }>;
};

export async function POST(req: Request, context: RouteContext) {
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

    const parsed = completeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: parsed.error.issues[0]?.message ?? 'Invalid local AI completion payload.',
            }),
            { status: 400 },
        );
    }

    try {
        assertLocalAiBridgePayloadSize({
            text: parsed.data.ok ? parsed.data.text : null,
            stdout: parsed.data.stdout,
            stderr: parsed.data.stderr,
        });
    } catch (error) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: error instanceof Error ? error.message : 'Local AI result exceeded the maximum size.',
            }),
            { status: 400 },
        );
    }

    const db = await getDBService();
    const { jobId } = await context.params;
    const authContext = localAiBridgeResponseContext(auth.context);
    const updated = await db.mcp.completeLocalAiJob({
        organizationId: authContext.organizationId,
        mcpTokenId: authContext.mcpTokenId,
        bridgeId: parsed.data.bridgeId,
        id: jobId,
        ok: parsed.data.ok,
        text: parsed.data.ok ? parsed.data.text : null,
        stdout: parsed.data.stdout,
        stderr: parsed.data.stderr,
        errorMessage: parsed.data.ok ? null : parsed.data.errorMessage,
    });

    if (!updated) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.NOT_FOUND,
                message: 'Local AI job was not found or is no longer claimable.',
            }),
            { status: 404 },
        );
    }

    return NextResponse.json(ResponseUtil.success({ ok: true }));
}
