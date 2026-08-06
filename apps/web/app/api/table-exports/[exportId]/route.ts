import { Readable } from 'node:stream';

import { NextResponse } from 'next/server';

import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ExportServiceError, openTableExport } from '@/lib/server/exports/service';

export const runtime = 'nodejs';

export const GET = withUserAndOrganizationHandler(async ({ req, db, organizationId }) => {
    const exportId = decodeURIComponent(req.nextUrl.pathname.split('/').filter(Boolean).pop() ?? '');
    if (!exportId) return NextResponse.json({ error: 'Missing export id.' }, { status: 400 });
    try {
        const file = await openTableExport(db, organizationId, exportId);
        const body = file.stream instanceof Readable ? Readable.toWeb(file.stream) : file.stream;
        const headers = new Headers({
            'Content-Type': file.contentType,
            'Content-Disposition': `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
            'Cache-Control': 'private, no-store',
        });
        if (typeof file.byteSize === 'number') headers.set('Content-Length', String(file.byteSize));
        return new Response(body as BodyInit, { headers });
    } catch (error) {
        if (error instanceof ExportServiceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
        throw error;
    }
});
