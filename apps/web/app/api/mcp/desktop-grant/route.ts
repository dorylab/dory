import { NextRequest, NextResponse } from 'next/server';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getSessionFromRequest } from '@/lib/auth/session';
import { ResponseUtil } from '@/lib/result';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import { resolveMcpDesktopGrantOrganizationId } from '@/lib/server/mcp/desktop-grant';
import { issueMcpDesktopGrant, MCP_DEFAULT_SCOPES } from '@/lib/server/mcp/auth';
import { ErrorCodes } from '@dory/shared/errors';
import { isDesktopRuntime } from '@dory/shared/runtime';

export const runtime = 'nodejs';

type DesktopGrantRequestBody = {
    organizationSlugOrId?: unknown;
};

async function readDesktopGrantRequestBody(req: Request): Promise<DesktopGrantRequestBody | null> {
    return (await req.json().catch(() => null)) as DesktopGrantRequestBody | null;
}

export async function POST(req: NextRequest) {
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

    const session = await getSessionFromRequest(req);
    const userId = session?.user?.id ?? null;
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
        const body = await readDesktopGrantRequestBody(req);
        const requestedOrganizationSlugOrId = typeof body?.organizationSlugOrId === 'string' ? body.organizationSlugOrId : null;
        const organizationId = await resolveMcpDesktopGrantOrganizationId({
            userId,
            sessionOrganizationId: resolveCurrentOrganizationId(session),
            requestedOrganizationSlugOrId,
        });

        if (!organizationId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: translateApi('Api.Errors.MissingOrganizationContext', undefined, locale),
                }),
                { status: 401 },
            );
        }

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
}
