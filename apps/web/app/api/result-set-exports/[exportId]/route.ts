import { Readable } from 'node:stream';

import { after, NextResponse } from 'next/server';

import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export const runtime = 'nodejs';

export const GET = withUserAndOrganizationHandler(async ({ req, db, organizationId }) => {
    const exportId = decodeURIComponent(req.nextUrl.pathname.split('/').filter(Boolean).pop() ?? '');
    if (typeof exportId !== 'string' || !exportId) {
        return NextResponse.json({ error: 'Missing export id.' }, { status: 400 });
    }

    const exportObject = await db.resultSets.openExport({ organizationId, exportId });
    let downloadCompleted = false;
    if (exportObject.stream instanceof Readable) {
        exportObject.stream.once('end', () => {
            downloadCompleted = true;
        });
    }
    after(async () => {
        if (!downloadCompleted) return;
        try {
            await db.resultSets.deleteExport({ organizationId, exportId });
        } catch (error) {
            console.warn('[resultSetExports] failed to delete completed export download', {
                organizationId,
                exportId,
                error,
            });
        }
    });
    const body = exportObject.stream instanceof Readable ? Readable.toWeb(exportObject.stream) : exportObject.stream;
    const headers = new Headers({
        'Content-Type': exportObject.contentType,
        'Content-Disposition': `attachment; filename="${exportObject.fileName.replace(/"/g, '')}"`,
    });
    if (typeof exportObject.byteSize === 'number') {
        headers.set('Content-Length', String(exportObject.byteSize));
    }

    return new Response(body as BodyInit, { headers });
});
