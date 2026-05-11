import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withManagedOrganizationHandler, withOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';
import { getDefaultMcpScopes, serializeMcpToken } from '@/lib/server/mcp/settings';

export const runtime = 'nodejs';

const patchSchema = z.object({
    enabled: z.boolean(),
});

function getEndpoint(req: Request) {
    return new URL('/api/mcp', req.url).toString();
}

export const GET = withOrganizationHandler(async ({ req, db, organizationId }) => {
    const [enabled, tokens] = await Promise.all([db.mcp.isOrganizationEnabled(organizationId), db.mcp.listTokens(organizationId)]);

    return NextResponse.json(
        ResponseUtil.success({
            enabled,
            endpoint: getEndpoint(req),
            defaultScopes: getDefaultMcpScopes(),
            tokens: tokens.map(serializeMcpToken),
        }),
    );
});

export const PATCH = withManagedOrganizationHandler(async ({ req, db, organizationId }) => {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: parsed.error.issues[0]?.message ?? 'Invalid MCP settings payload.',
            }),
            { status: 400 },
        );
    }

    const enabled = await db.mcp.setOrganizationEnabled(organizationId, parsed.data.enabled);
    return NextResponse.json(ResponseUtil.success({ enabled }));
});
