import { NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { handleApiError } from '@/app/api/utils/handle-error';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getLocalFilesDataset, updateLocalFilesDataset } from '@/lib/local-files/service';

export const runtime = 'nodejs';

export const GET = withUserAndOrganizationHandler(async ({ req, db, userId, organizationId }) => {
    try {
        const connectionId = req.nextUrl.searchParams.get('connectionId');
        const datasetId = req.nextUrl.searchParams.get('datasetId');
        const result = await getLocalFilesDataset({ db, userId, organizationId }, { connectionId, datasetId });
        return NextResponse.json(ResponseUtil.success(result));
    } catch (err: any) {
        return handleApiError(err);
    }
});

export const PATCH = withUserAndOrganizationHandler(async ({ req, db, userId, organizationId }) => {
    try {
        const datasetId = req.nextUrl.searchParams.get('datasetId');
        if (!datasetId) {
            throw new Error('Missing Local Files dataset id');
        }
        const payload = await req.json();
        const result = await updateLocalFilesDataset({ db, userId, organizationId }, datasetId, payload);
        return NextResponse.json(ResponseUtil.success(result));
    } catch (err: any) {
        return handleApiError(err);
    }
});
