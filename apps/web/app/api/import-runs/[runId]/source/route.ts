import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { ImportServiceError, uploadImportSource } from '@/lib/server/imports/service';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

import { importErrorResponse } from '../../utils';

export const runtime = 'nodejs';

export const PUT = withUserAndOrganizationHandler(async ({ db, organizationId, req }) => {
    try {
        if (!req.body) throw new ImportServiceError('Request body is required', 400, 'IMPORT_SOURCE_REQUIRED');
        const runId = runIdFromRequest(req);
        const fileName = decodeURIComponent(req.headers.get('x-file-name') ?? 'import.csv');
        const contentLength = Number.parseInt(req.headers.get('content-length') ?? '', 10);
        const body = Readable.fromWeb(req.body as never);
        const run = await uploadImportSource(db, {
            organizationId,
            runId,
            fileName,
            contentLength: Number.isFinite(contentLength) ? contentLength : null,
            body,
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
