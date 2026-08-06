import { NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { listImportRunEvents } from '@/lib/server/imports/service';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

import { importErrorResponse } from '../../utils';

export const runtime = 'nodejs';

export const GET = withUserAndOrganizationHandler(async ({ db, organizationId, req }) => {
    try {
        const url = new URL(req.url);
        const after = Math.max(0, Number.parseInt(url.searchParams.get('after') ?? '0', 10) || 0);
        const parts = url.pathname.split('/').filter(Boolean);
        const runId = decodeURIComponent(parts[parts.indexOf('import-runs') + 1] ?? '');
        return NextResponse.json(ResponseUtil.success(await listImportRunEvents(db, organizationId, runId, after)));
    } catch (error) {
        return importErrorResponse(error);
    }
});
