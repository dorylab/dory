import { NextResponse } from 'next/server';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import { issueMcpDesktopGrant, MCP_DEFAULT_SCOPES } from '@/lib/server/mcp/auth';
import { ErrorCodes } from '@dory/shared/errors';
import { isDesktopRuntime } from '@dory/shared/runtime';

export const runtime = 'nodejs';

export const POST = withOrganizationHandler(async ({ organizationId, userId }) => {
    const locale = await getApiLocale();

    if (!isDesktopRuntime()) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.NOT_FOUND,
                message: translateApi('Api.Mcp.DesktopGrantUnavailable', undefined, locale),
            }),
            { status: 404 },
        );
    }

    if (!userId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.UNAUTHORIZED,
                message: translateApi('Api.Errors.Unauthorized', undefined, locale),
            }),
            { status: 401 },
        );
    }

    try {
        const access = await resolveOrganizationAccess(organizationId, userId);
        if (!access?.isMember || !access.permissions.workspace.read || !access.permissions.connection.read) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.FORBIDDEN,
                    message: translateApi('Api.Errors.Unauthorized', undefined, locale),
                }),
                { status: 403 },
            );
        }

        const { grant, expiresAt } = issueMcpDesktopGrant({
            userId,
            organizationId,
            scopes: [...MCP_DEFAULT_SCOPES],
            access,
        });

        return NextResponse.json(
            ResponseUtil.success({
                grant,
                expiresAt: expiresAt.toISOString(),
            }),
        );
    } catch (error) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.ERROR,
                message: error instanceof Error ? error.message : translateApi('Api.Errors.InternalError', undefined, locale),
            }),
            { status: 500 },
        );
    }
});
