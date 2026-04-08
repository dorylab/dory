import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getSessionFromRequest } from '@/lib/auth/session';
import { fetchDesktopCloud } from '@/lib/server/desktop-cloud';
import { resolveLocalOrganizationAccess } from './authz.local';
import {
    finalizeDesktopOrganizationAccessResult,
    type CloudOrganizationAccessAttempt,
    type DesktopOrganizationAccessResult,
} from './authz.desktop.shared';
import type { OrganizationAccess } from './types';

export type { DesktopOrganizationAccessResolution, DesktopOrganizationAccessResult } from './authz.desktop.shared';

async function fetchCloudOrganizationAccess(organizationId: string): Promise<CloudOrganizationAccessAttempt> {
    const cloudResponse = await fetchDesktopCloud(`/api/organization/access?organizationId=${encodeURIComponent(organizationId)}`);

    console.log('[authz][desktop] fetchCloudOrganizationAccess:start', {
        organizationId,
        cloudState: cloudResponse.state,
        cloudBaseUrl: cloudResponse.baseUrl,
    });

    if (cloudResponse.state !== 'available') {
        return { status: cloudResponse.state };
    }

    const { response } = cloudResponse;

    console.log('[authz][desktop] fetchCloudOrganizationAccess:response', {
        organizationId,
        status: response.status,
        ok: response.ok,
    });

    if (response.status === 401 || response.status === 403) {
        return { status: 'denied' };
    }

    if (!response.ok) {
        return { status: 'unreachable' };
    }

    const payload = (await response.json().catch(() => null)) as
        | { code?: number; data?: { access?: OrganizationAccess | null } }
        | null;

    if (payload?.code !== 0) {
        return { status: 'denied' };
    }

    if (!payload.data?.access?.isMember) {
        return { status: 'denied' };
    }

    return {
        status: 'granted',
        access: {
            ...payload.data.access,
            source: 'desktop_cloud',
        },
    };
}

export async function resolveDesktopOrganizationAccessResult(organizationId: string, userId: string): Promise<DesktopOrganizationAccessResult> {
    const session = await getSessionFromRequest();
    const sessionUserId = session?.user?.id ?? null;
    const activeOrganizationId = resolveCurrentOrganizationId(session);

    console.log('[authz][desktop] resolveDesktopOrganizationAccess', {
        organizationId,
        userId,
        sessionUserId,
        activeOrganizationId,
    });

    const cloudAttempt = await fetchCloudOrganizationAccess(organizationId);
    const localAccess = await resolveLocalOrganizationAccess(organizationId, userId).catch(() => null);
    return finalizeDesktopOrganizationAccessResult({
        organizationId,
        userId,
        sessionUserId,
        activeOrganizationId,
        cloudAttempt,
        localAccess,
    });
}

export async function resolveDesktopOrganizationAccess(organizationId: string, userId: string): Promise<OrganizationAccess | null> {
    const result = await resolveDesktopOrganizationAccessResult(organizationId, userId);
    return result.access;
}
