import { NextResponse } from 'next/server';
import { getDBService } from '@dory/database';
import type { McpAuthorizationPollStatus } from '@dory/database/postgres/impl/mcp';
import { ErrorCodes } from '@dory/shared/errors';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { ResponseUtil } from '@/lib/result';
import { generateMcpToken } from '@/lib/server/mcp/auth';
import { createMcpLinkTokenName, hashMcpLinkVerifier, mcpLinkPollSchema } from '@/lib/server/mcp/link';
import { serializeMcpToken } from '@/lib/server/mcp/settings';

export const runtime = 'nodejs';

function statusResponse(status: McpAuthorizationPollStatus, httpStatus = 200) {
    return NextResponse.json(ResponseUtil.success({ status }), { status: httpStatus });
}

function errorResponse(message: string, reason: McpAuthorizationPollStatus, status: number) {
    return NextResponse.json(
        ResponseUtil.error({
            code: status === 404 ? ErrorCodes.NOT_FOUND : status === 409 ? ErrorCodes.CONFLICT : ErrorCodes.VALIDATION_ERROR,
            message,
            details: { reason },
        }),
        { status },
    );
}

export async function POST(req: Request) {
    const locale = await getApiLocale();
    const t = (key: string) => translateApi(key, undefined, locale);
    const parsed = mcpLinkPollSchema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: parsed.error.issues[0]?.message ?? t('Api.Mcp.InvalidLinkPayload'),
            }),
            { status: 400 },
        );
    }

    const db = await getDBService();
    const verifierHash = hashMcpLinkVerifier(parsed.data.verifier);
    const state = await db.mcp.getAuthorizationPollState({
        id: parsed.data.requestId,
        verifierHash,
    });

    if (state.status === 'pending' || state.status === 'denied' || state.status === 'expired') {
        return statusResponse(state.status);
    }
    if (state.status === 'not_found') {
        return errorResponse(t('Api.Mcp.LinkNotFound'), state.status, 404);
    }
    if (state.status === 'verifier_mismatch') {
        return errorResponse(t('Api.Mcp.LinkVerifierMismatch'), state.status, 400);
    }
    if (state.status === 'consumed') {
        return errorResponse(t('Api.Mcp.LinkConsumed'), state.status, 409);
    }
    const record = state.record;
    if (!record || !record.organizationId || !record.userId) {
        return errorResponse(t('Api.Mcp.LinkInvalidApproval'), 'approved', 409);
    }

    const generated = generateMcpToken();
    const consumed = await db.mcp.consumeAuthorizationRequest({
        id: record.id,
        verifierHash,
        token: {
            organizationId: record.organizationId,
            name: createMcpLinkTokenName(record.clientName),
            tokenPrefix: generated.tokenPrefix,
            tokenHash: generated.tokenHash,
            scopes: Array.isArray(record.scopes) ? record.scopes : [],
            createdByUserId: record.userId,
        },
    });

    if (consumed.status !== 'approved') {
        return consumed.status === 'consumed' ? errorResponse(t('Api.Mcp.LinkConsumed'), consumed.status, 409) : statusResponse(consumed.status);
    }

    return NextResponse.json(
        ResponseUtil.success({
            status: 'approved',
            token: generated.token,
            record: serializeMcpToken(consumed.tokenRecord),
        }),
    );
}
