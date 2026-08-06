import { NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { getImportRun, inspectImportTarget, saveImportPlan } from '@/lib/server/imports/service';
import { ensureConnection } from '@/lib/server/ensure-connection';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

import { importErrorResponse } from '../utils';

export const runtime = 'nodejs';

export const GET = withUserAndOrganizationHandler(async ({ db, organizationId, req }) => {
    try {
        const runId = await runIdFromRequest(req);
        return NextResponse.json(ResponseUtil.success(await getImportRun(db, organizationId, runId)));
    } catch (error) {
        return importErrorResponse(error);
    }
});

export const PATCH = withUserAndOrganizationHandler(async ({ db, organizationId, req }) => {
    try {
        const connection = await ensureConnection(req, { organizationId });
        if ('response' in connection) return connection.response;
        const payload = await req.json();
        const runId = await runIdFromRequest(req);
        if (payload.action === 'inspect') {
            return NextResponse.json(ResponseUtil.success(await inspectImportTarget(db, connection, { organizationId, runId, target: payload.target })));
        }
        return NextResponse.json(ResponseUtil.success(await saveImportPlan(db, connection, { organizationId, runId, plan: payload.plan ?? payload })));
    } catch (error) {
        return importErrorResponse(error);
    }
});

async function runIdFromRequest(req: Request) {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.indexOf('import-runs') + 1] ?? '');
}
