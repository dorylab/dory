import { NextResponse } from 'next/server';

import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ db, organizationId }) => {
    return NextResponse.json(await db.resultSets.cleanupWorkspaceStorage({ organizationId }));
});
