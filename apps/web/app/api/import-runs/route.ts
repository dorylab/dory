import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ResponseUtil } from '@/lib/result';
import { createImportRun, listImportRuns } from '@/lib/server/imports/service';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { ensureConnection } from '@/lib/server/ensure-connection';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

import { importErrorResponse } from './utils';

export const runtime = 'nodejs';

const listQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

export const GET = withUserAndOrganizationHandler(async ({ req, db, organizationId }) => {
    try {
        const connection = await ensureConnection(req, { organizationId });
        if ('response' in connection) return connection.response;
        const query = listQuerySchema.parse({
            limit: req.nextUrl.searchParams.get('limit') ?? undefined,
            offset: req.nextUrl.searchParams.get('offset') ?? undefined,
        });
        return NextResponse.json(
            ResponseUtil.success(
                await listImportRuns(db, {
                    organizationId,
                    connectionId: connection.config.id,
                    ...query,
                }),
            ),
        );
    } catch (error) {
        return importErrorResponse(error);
    }
});

export const POST = withUserAndOrganizationHandler(async ({ req, db, userId, organizationId }) => {
    try {
        const connectionId = req.headers.get(X_CONNECTION_ID_KEY) ?? req.headers.get(X_CONNECTION_ID_KEY.toLowerCase());
        if (connectionId) {
            const connection = await ensureConnection(req, { organizationId });
            if ('response' in connection) return connection.response;
        }
        const run = await createImportRun(db, { organizationId, userId, connectionId });
        return NextResponse.json(ResponseUtil.success(run), { status: 201 });
    } catch (error) {
        return importErrorResponse(error);
    }
});
