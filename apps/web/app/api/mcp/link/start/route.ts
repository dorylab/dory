import { NextResponse } from 'next/server';
import { getDBService } from '@dory/database';
import { ErrorCodes } from '@dory/shared/errors';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { ResponseUtil } from '@/lib/result';
import { getMcpLinkExpiresAt, getMcpLinkScopes, mcpLinkStartSchema } from '@/lib/server/mcp/link';

export const runtime = 'nodejs';

export async function POST(req: Request) {
    const locale = await getApiLocale();
    const t = (key: string) => translateApi(key, undefined, locale);
    const parsed = mcpLinkStartSchema.safeParse(await req.json().catch(() => null));

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
    const expiresAt = getMcpLinkExpiresAt();
    const record = await db.mcp.createAuthorizationRequest({
        clientName: parsed.data.clientName,
        verifierHash: parsed.data.verifierHash.toLowerCase(),
        scopes: getMcpLinkScopes(parsed.data.scopes),
        expiresAt,
    });
    const authorizeUrl = new URL('/mcp/authorize', req.url);
    authorizeUrl.searchParams.set('requestId', record.id);

    return NextResponse.json(
        ResponseUtil.success({
            requestId: record.id,
            authorizeUrl: authorizeUrl.toString(),
            expiresAt: record.expiresAt,
        }),
        { status: 201 },
    );
}
