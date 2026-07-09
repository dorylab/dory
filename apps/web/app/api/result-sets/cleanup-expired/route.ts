import { NextResponse } from 'next/server';

import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ db, organizationId }) => {
    const result = await db.resultSets.cleanupExpiredResultSets({ organizationId });
    return NextResponse.json(result);
});
