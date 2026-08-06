import { NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { analyzeImportSource, ImportServiceError } from '@/lib/server/imports/service';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

import { importErrorResponse } from '../../utils';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ db, organizationId, req }) => {
    try {
        const payload = await req.json().catch(() => ({}));
        if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'parsing' in payload) {
            throw new ImportServiceError('The parsing request field has been removed; use sourceOptions', 400, 'IMPORT_SOURCE_OPTIONS');
        }
        const run = await analyzeImportSource(db, {
            organizationId,
            runId: runIdFromRequest(req),
            sourceOptions: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.sourceOptions : undefined,
        });
        return NextResponse.json(ResponseUtil.success(run));
    } catch (error) {
        return importErrorResponse(error);
    }
});

function runIdFromRequest(req: Request) {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.indexOf('import-runs') + 1] ?? '');
}
