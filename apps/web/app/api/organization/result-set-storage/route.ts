import { NextResponse } from 'next/server';

import { withManagedOrganizationHandler, withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { canManageOrganization, resolveOrganizationAccess } from '@/lib/server/authz';
import type { DBService } from '@dory/database';
import {
    ALLOWED_RESULT_SET_MAX_STORAGE_BYTES,
    ALLOWED_RESULT_SET_RETENTION_DAYS,
    DEFAULT_RESULT_SET_MAX_STORAGE_BYTES,
    DEFAULT_RESULT_SET_RETENTION_DAYS,
    isAllowedResultSetMaxStorageBytes,
    isAllowedResultSetRetentionDays,
} from '@dory/database/postgres/impl/organization';

export const runtime = 'nodejs';

async function storagePayload(db: DBService, organizationId: string, canManage: boolean) {
    const [settings, usage] = await Promise.all([db.organizations.getResultSetStorageSettings(organizationId), db.resultSets.getStorageUsage(organizationId)]);
    return {
        ...settings,
        defaultRetentionDays: DEFAULT_RESULT_SET_RETENTION_DAYS,
        allowedRetentionDays: ALLOWED_RESULT_SET_RETENTION_DAYS,
        defaultMaxStorageBytes: DEFAULT_RESULT_SET_MAX_STORAGE_BYTES,
        allowedMaxStorageBytes: ALLOWED_RESULT_SET_MAX_STORAGE_BYTES,
        canManage,
        ...usage,
    };
}

export const GET = withUserAndOrganizationHandler(async ({ db, organizationId, userId }) => {
    const access = await resolveOrganizationAccess(organizationId, userId);
    return NextResponse.json(await storagePayload(db, organizationId, canManageOrganization(access)));
});

export const PATCH = withManagedOrganizationHandler(async ({ req, db, organizationId }) => {
    const body = await req.json().catch(() => ({}));
    const retentionDays = typeof body === 'object' && body !== null && 'retentionDays' in body ? body.retentionDays : undefined;
    const maxStorageBytes = typeof body === 'object' && body !== null && 'maxStorageBytes' in body ? body.maxStorageBytes : undefined;

    if (retentionDays === undefined && maxStorageBytes === undefined) {
        return NextResponse.json({ error: 'At least one storage setting is required' }, { status: 400 });
    }
    if (retentionDays !== undefined && !isAllowedResultSetRetentionDays(retentionDays)) {
        return NextResponse.json({ error: `retentionDays must be one of: ${ALLOWED_RESULT_SET_RETENTION_DAYS.join(', ')}` }, { status: 400 });
    }
    if (maxStorageBytes !== undefined && !isAllowedResultSetMaxStorageBytes(maxStorageBytes)) {
        return NextResponse.json({ error: `maxStorageBytes must be one of: ${ALLOWED_RESULT_SET_MAX_STORAGE_BYTES.join(', ')}` }, { status: 400 });
    }

    const saved = await db.organizations.setResultSetStorageSettings(organizationId, { retentionDays, maxStorageBytes });
    await db.resultSets.cleanupWorkspaceStorage({ organizationId, maxStorageBytes: saved.maxStorageBytes });
    return NextResponse.json(await storagePayload(db, organizationId, true));
});
