import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';
import { generateMcpToken, MCP_DEFAULT_SCOPES } from '@/lib/server/mcp/auth';
import { serializeMcpToken } from '@/lib/server/mcp/settings';

export const runtime = 'nodejs';

const bodySchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    scopes: z.array(z.enum(MCP_DEFAULT_SCOPES)).optional(),
});

export const POST = withOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const locale = await getApiLocale();
    const t = (key: string) => translateApi(key, undefined, locale);

    if (!userId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.UNAUTHORIZED,
                message: t('Api.Errors.Unauthorized'),
            }),
            { status: 401 },
        );
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: parsed.error.issues[0]?.message ?? t('Api.Mcp.InvalidTokenPayload'),
            }),
            { status: 400 },
        );
    }

    const generated = generateMcpToken();
    const record = await db.mcp.createToken({
        organizationId,
        name: parsed.data.name || 'Codex',
        tokenPrefix: generated.tokenPrefix,
        tokenHash: generated.tokenHash,
        scopes: parsed.data.scopes ?? [...MCP_DEFAULT_SCOPES],
        createdByUserId: userId,
    });

    return NextResponse.json(
        ResponseUtil.success({
            token: generated.token,
            record: serializeMcpToken(record),
        }),
        { status: 201 },
    );
});
