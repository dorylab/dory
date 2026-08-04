import { NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { analyzeImportSource } from '@/lib/server/imports/service';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

import { importErrorResponse } from '../../utils';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ db, organizationId, req }) => {
    try {
        const payload = await req.json().catch(() => ({}));
        const run = await analyzeImportSource(db, { organizationId, runId: runIdFromRequest(req), parsing: payload.parsing });
        return NextResponse.json(ResponseUtil.success(run));
    } catch (error) {
        return importErrorResponse(error);
    }
});

function runIdFromRequest(req: Request) {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.indexOf('import-runs') + 1] ?? '');
}
