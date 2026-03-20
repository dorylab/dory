import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { resolvePrivilegesConnection, handlePrivilegesError } from '../_utils';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export const GET = withUserAndOrganizationHandler(async ({ req, organizationId }) => {
    const locale = await getApiLocale();
    const resolved = await resolvePrivilegesConnection(req, { organizationId });
    if (resolved.response) return resolved.response;

    try {
        const result = await resolved.resolved!.instance.query<{ cluster: string }>(
            'SELECT cluster FROM system.clusters ORDER BY cluster',
        );
        const rows = result.rows ?? [];
        const clusters = Array.from(
            new Set(rows.map(row => row.cluster).filter((value): value is string => Boolean(value))),
        );
        return NextResponse.json(ResponseUtil.success(clusters));
    } catch (error) {
        return handlePrivilegesError(error, translateApi('Api.Privileges.Clusters.FetchFailed', undefined, locale));
    }
});
