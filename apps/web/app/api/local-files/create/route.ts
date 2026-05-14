import { NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { handleApiError } from '@/app/api/utils/handle-error';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { createLocalFilesDataset } from '@/lib/local-files/service';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ req, db, userId, organizationId }) => {
    try {
        const payload = await req.json();
        const result = await createLocalFilesDataset({ db, userId, organizationId }, payload);
        return NextResponse.json(ResponseUtil.success(result), { status: 201 });
    } catch (err: any) {
        return handleApiError(err);
    }
});
