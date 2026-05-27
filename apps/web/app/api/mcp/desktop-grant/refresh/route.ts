import { NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { buildMcpAuthContextForDesktopGrant, issueMcpDesktopGrant, MCP_DESKTOP_GRANT_HEADER } from '@/lib/server/mcp/auth';
import { ErrorCodes } from '@dory/shared/errors';
import { isDesktopRuntime } from '@dory/shared/runtime';

export const runtime = 'nodejs';

export async function POST(req: Request) {
    if (!isDesktopRuntime()) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.NOT_FOUND,
                message: 'MCP desktop grants are only available in the desktop runtime.',
            }),
            { status: 404 },
        );
    }

    const auth = await buildMcpAuthContextForDesktopGrant(req.headers.get(MCP_DESKTOP_GRANT_HEADER), {
        ignoreExpiration: true,
    });
    if (!auth.ok) {
        return NextResponse.json(
            ResponseUtil.error({
                code: auth.status === 401 ? ErrorCodes.UNAUTHORIZED : ErrorCodes.FORBIDDEN,
                message: auth.message,
            }),
            { status: auth.status },
        );
    }

    const { grant, expiresAt } = issueMcpDesktopGrant({
        userId: auth.context.userId,
        organizationId: auth.context.organizationId,
        scopes: auth.context.scopes,
        access: auth.context.access,
    });

    return NextResponse.json(
        ResponseUtil.success({
            grant,
            expiresAt: expiresAt.toISOString(),
        }),
    );
}
