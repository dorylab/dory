import { NextResponse } from 'next/server';

import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { previewImportRunTransform } from '@/lib/server/imports/service';

import { importErrorResponse } from '../../utils';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ db, organizationId, req }) => {
    try {
        const payload = await req.json();
        const runId = runIdFromRequest(req);
        return NextResponse.json(ResponseUtil.success(await previewImportRunTransform(db, { organizationId, runId, plan: payload.plan ?? payload })));
    } catch (error) {
        return importErrorResponse(error);
    }
});

function runIdFromRequest(req: Request) {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.indexOf('import-runs') + 1] ?? '');
}
