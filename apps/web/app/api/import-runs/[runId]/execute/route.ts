import { NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { queueImportRun } from '@/lib/server/imports/service';
import { ensureConnection } from '@/lib/server/ensure-connection';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

import { importErrorResponse } from '../../utils';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ db, organizationId, req }) => {
    try {
        const connection = await ensureConnection(req, { organizationId });
        if ('response' in connection) return connection.response;
        const run = await queueImportRun(db, connection, organizationId, runIdFromRequest(req));
        return NextResponse.json(ResponseUtil.success(run), { status: 202 });
    } catch (error) {
        return importErrorResponse(error);
    }
});

function runIdFromRequest(req: Request) {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.indexOf('import-runs') + 1] ?? '');
}
