import { NextResponse } from 'next/server';
import type { McpAuthorizationPollStatus } from '@dory/database/postgres/impl/mcp';
import { ErrorCodes } from '@dory/shared/errors';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { getMcpLinkScopes, mcpLinkDecisionSchema } from '@/lib/server/mcp/link';
import { serializeMcpAuthorizationRequest } from '@/lib/server/mcp/settings';

export const runtime = 'nodejs';

function resultStatus(status: McpAuthorizationPollStatus) {
    if (status === 'not_found') return 404;
    if (status === 'expired') return 410;
    if (status === 'denied' || status === 'consumed') return 409;
    return 200;
}

export const POST = withOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const locale = await getApiLocale();
    const t = (key: string) => translateApi(key, undefined, locale);
    const parsed = mcpLinkDecisionSchema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: parsed.error.issues[0]?.message ?? t('Api.Mcp.InvalidLinkPayload'),
            }),
            { status: 400 },
        );
    }

    const result = await db.mcp.approveAuthorizationRequest({
        id: parsed.data.requestId,
        organizationId,
        userId: userId!,
        scopes: getMcpLinkScopes(parsed.data.scopes),
    });

    const status = resultStatus(result.status);
    if (status !== 200) {
        return NextResponse.json(
            ResponseUtil.error({
                code: status === 404 ? ErrorCodes.NOT_FOUND : ErrorCodes.CONFLICT,
                message: t('Api.Mcp.LinkApprovalUnavailable'),
                details: { reason: result.status },
            }),
            { status },
        );
    }

    return NextResponse.json(
        ResponseUtil.success({
            status: result.status,
            request: result.record ? serializeMcpAuthorizationRequest(result.record) : null,
        }),
    );
});
