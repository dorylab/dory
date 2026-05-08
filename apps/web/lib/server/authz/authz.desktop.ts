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

const DESKTOP_ORGANIZATION_ACCESS_TTL_MS = 60 * 1000;

const desktopOrganizationAccessCache = new Map<
    string,
    {
        expiresAt: number;
        value: DesktopOrganizationAccessResult;
    }
>();

const pendingDesktopOrganizationAccess = new Map<string, Promise<DesktopOrganizationAccessResult>>();

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
    const cacheKey = `${sessionUserId ?? 'anonymous'}:${activeOrganizationId ?? 'none'}:${userId}:${organizationId}`;
    const now = Date.now();
    const cached = desktopOrganizationAccessCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
        console.log('[authz][desktop] resolveDesktopOrganizationAccess:cache-hit', {
            organizationId,
            userId,
            sessionUserId,
            activeOrganizationId,
            expiresInMs: cached.expiresAt - now,
        });
        return cached.value;
    }

    const pending = pendingDesktopOrganizationAccess.get(cacheKey);
    if (pending) {
        console.log('[authz][desktop] resolveDesktopOrganizationAccess:pending-hit', {
            organizationId,
            userId,
            sessionUserId,
            activeOrganizationId,
        });
        return pending;
    }

    console.log('[authz][desktop] resolveDesktopOrganizationAccess', {
        organizationId,
        userId,
        sessionUserId,
        activeOrganizationId,
    });

    const resultPromise = (async () => {
        const localAccess = await resolveLocalOrganizationAccess(organizationId, userId).catch(() => null);
        if (localAccess?.isMember) {
            return finalizeDesktopOrganizationAccessResult({
                organizationId,
                userId,
                sessionUserId,
                activeOrganizationId,
                cloudAttempt: { status: 'not_configured' },
                localAccess,
            });
        }

        const cloudAttempt = await fetchCloudOrganizationAccess(organizationId);
        return finalizeDesktopOrganizationAccessResult({
            organizationId,
            userId,
            sessionUserId,
            activeOrganizationId,
            cloudAttempt,
            localAccess,
        });
    })();

    pendingDesktopOrganizationAccess.set(cacheKey, resultPromise);

    try {
        const result = await resultPromise;
        desktopOrganizationAccessCache.set(cacheKey, {
            expiresAt: now + DESKTOP_ORGANIZATION_ACCESS_TTL_MS,
            value: result,
        });
        return result;
    } finally {
        pendingDesktopOrganizationAccess.delete(cacheKey);
    }
}

export async function resolveDesktopOrganizationAccess(organizationId: string, userId: string): Promise<OrganizationAccess | null> {
    const result = await resolveDesktopOrganizationAccessResult(organizationId, userId);
    return result.access;
}
