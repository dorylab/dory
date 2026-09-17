import { NextResponse } from 'next/server';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { getDefaultMcpScopes, serializeAgentPrincipal, serializeMcpToken } from '@/lib/server/mcp/settings';
import { createExternalRequestUrl } from '@/lib/server/request-origin';
import { canManageOrganization, resolveOrganizationAccess } from '@/lib/server/authz';

export const runtime = 'nodejs';

function getEndpoint(req: Request) {
    return createExternalRequestUrl(req, '/api/mcp');
}

export const GET = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const access = await resolveOrganizationAccess(organizationId, userId);
    const canManage = canManageOrganization(access);
    const [tokens, serviceAccounts, connections] = await Promise.all([
        db.mcp.listTokensForUser(organizationId, userId),
        canManage ? db.mcp.listAgentPrincipals(organizationId) : Promise.resolve([]),
        canManage ? db.connections.list(organizationId) : Promise.resolve([]),
    ]);

    return NextResponse.json(
        ResponseUtil.success({
            endpoint: getEndpoint(req),
            defaultScopes: getDefaultMcpScopes(),
            tokens: tokens.map(serializeMcpToken),
            canManageServiceAccounts: canManage,
            serviceAccounts: serviceAccounts.map(serializeAgentPrincipal),
            connections: connections.map(item => ({ id: item.connection.id, name: item.connection.name ?? item.connection.id })),
        }),
    );
});

export async function PATCH() {
    const locale = await getApiLocale();
    return NextResponse.json({ error: translateApi('Api.Mcp.SettingsPatchUnsupported', undefined, locale) }, { status: 405 });
}
