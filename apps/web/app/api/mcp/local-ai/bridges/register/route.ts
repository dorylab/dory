import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getDBService } from '@dory/database';
import { ErrorCodes } from '@dory/shared/errors';
import { isLocalAiAgentProvider } from '@dory/ee/ai/provider-options';
import { ResponseUtil } from '@/lib/result';
import { authenticateLocalAiBridgeRequest, localAiBridgeResponseContext } from '@/lib/server/local-ai/bridge';

export const runtime = 'nodejs';

const registerSchema = z.object({
    provider: z.string().trim().default('codex-agent'),
    name: z.string().trim().min(1).max(80).default('Dory MCP'),
    capabilities: z.record(z.string(), z.unknown()).optional(),
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

    const parsed = registerSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success || !isLocalAiAgentProvider(parsed.success ? parsed.data.provider : null)) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: parsed.success ? 'Unsupported local AI provider.' : (parsed.error.issues[0]?.message ?? 'Invalid local AI bridge payload.'),
            }),
            { status: 400 },
        );
    }

    const db = await getDBService();
    const context = localAiBridgeResponseContext(auth.context);
    const bridge = await db.mcp.registerLocalAiBridge({
        ...context,
        provider: parsed.data.provider,
        name: parsed.data.name,
        capabilities: parsed.data.capabilities ?? null,
    });

    return NextResponse.json(
        ResponseUtil.success({
            bridge: {
                id: bridge.id,
                provider: bridge.provider,
                name: bridge.name,
                lastSeenAt: bridge.lastSeenAt,
            },
        }),
        { status: 201 },
    );
}
