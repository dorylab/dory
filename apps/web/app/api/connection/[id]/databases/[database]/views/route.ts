/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { resolveCatalogContext } from '../../_utils';
import { ClickhouseDatasource } from '@/lib/connection/drivers/clickhouse/ClickhouseDatasource';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';

export async function GET(req: NextRequest, context: { params: Promise<{ database: string }> }) {
    return withUserAndTeamHandler(async ({ userId, teamId }) => {
        const resolved = await resolveCatalogContext(req, context, { userId, teamId });
        if (resolved.response) return resolved.response;

        const { entry, database } = resolved.resolved!;
        const instance = entry.instance as ClickhouseDatasource;
        const views = await instance.getViews(database);

        return NextResponse.json(ResponseUtil.success(views));
    })(req);
}
