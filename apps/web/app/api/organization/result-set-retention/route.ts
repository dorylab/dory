import { NextResponse } from 'next/server';

import { withManagedOrganizationHandler, withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { canManageOrganization, resolveOrganizationAccess } from '@/lib/server/authz';
import { ALLOWED_RESULT_SET_RETENTION_DAYS, DEFAULT_RESULT_SET_RETENTION_DAYS, isAllowedResultSetRetentionDays } from '@dory/database/postgres/impl/organization';

export const runtime = 'nodejs';

function retentionPayload(retentionDays: number, canManage: boolean) {
    return {
        retentionDays,
        defaultRetentionDays: DEFAULT_RESULT_SET_RETENTION_DAYS,
        allowedRetentionDays: ALLOWED_RESULT_SET_RETENTION_DAYS,
        canManage,
    };
}

export const GET = withUserAndOrganizationHandler(async ({ db, organizationId, userId }) => {
    const access = await resolveOrganizationAccess(organizationId, userId);
    const retentionDays = await db.organizations.getResultSetRetentionDays(organizationId);

    return NextResponse.json(retentionPayload(retentionDays, canManageOrganization(access)));
});

export const PATCH = withManagedOrganizationHandler(async ({ req, db, organizationId }) => {
    const body = await req.json().catch(() => ({}));
    const retentionDays = typeof body === 'object' && body !== null && 'retentionDays' in body ? body.retentionDays : undefined;

    if (!isAllowedResultSetRetentionDays(retentionDays)) {
        return NextResponse.json(
            {
                error: `retentionDays must be one of: ${ALLOWED_RESULT_SET_RETENTION_DAYS.join(', ')}`,
                allowedRetentionDays: ALLOWED_RESULT_SET_RETENTION_DAYS,
            },
            { status: 400 },
        );
    }

    const savedRetentionDays = await db.organizations.setResultSetRetentionDays(organizationId, retentionDays);

    return NextResponse.json(retentionPayload(savedRetentionDays, true));
});
