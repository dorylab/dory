import { NextResponse } from 'next/server';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { getDefaultMcpScopes, serializeMcpToken } from '@/lib/server/mcp/settings';

export const runtime = 'nodejs';

function getEndpoint(req: Request) {
    return new URL('/api/mcp', req.url).toString();
}

export const GET = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const tokens = await db.mcp.listTokensForUser(organizationId, userId);

    return NextResponse.json(
        ResponseUtil.success({
            endpoint: getEndpoint(req),
            defaultScopes: getDefaultMcpScopes(),
            tokens: tokens.map(serializeMcpToken),
        }),
    );
});

export async function PATCH() {
    return NextResponse.json({ error: 'MCP settings are managed per user token. PATCH is not supported.' }, { status: 405 });
}
