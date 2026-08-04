import { NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { createImportRun } from '@/lib/server/imports/service';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { ensureConnection } from '@/lib/server/ensure-connection';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

import { importErrorResponse } from './utils';

export const runtime = 'nodejs';

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
