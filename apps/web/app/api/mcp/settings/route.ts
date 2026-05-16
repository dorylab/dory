import { NextResponse } from 'next/server';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
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
    const locale = await getApiLocale();
    return NextResponse.json({ error: translateApi('Api.Mcp.SettingsPatchUnsupported', undefined, locale) }, { status: 405 });
}
