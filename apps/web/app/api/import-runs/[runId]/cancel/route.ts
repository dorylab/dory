import { NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { cancelImportRun } from '@/lib/server/imports/service';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

import { importErrorResponse } from '../../utils';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ db, organizationId, req }) => {
    try {
        const run = await cancelImportRun(db, organizationId, runIdFromRequest(req));
        return NextResponse.json(ResponseUtil.success(run));
    } catch (error) {
        return importErrorResponse(error);
    }
});

function runIdFromRequest(req: Request) {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.indexOf('import-runs') + 1] ?? '');
}
