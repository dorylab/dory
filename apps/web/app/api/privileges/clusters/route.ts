import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { resolveClickhouseDatasource, handlePrivilegesError } from '../_utils';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';

export const GET = withUserAndTeamHandler(async ({ req, teamId }) => {
    const locale = await getApiLocale();
    const resolved = await resolveClickhouseDatasource(req, { teamId });
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
