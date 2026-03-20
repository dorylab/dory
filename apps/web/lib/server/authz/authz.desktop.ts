import { getSessionFromRequest } from '@/lib/auth/session';
import { createAuthProxyHeaders } from '@/lib/auth/auth-proxy';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { headers } from 'next/headers';
import type { OrganizationAccess } from './types';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';

async function fetchCloudOrganizationAccess(organizationId: string): Promise<OrganizationAccess | null> {
    const cloudBaseUrl = getCloudApiBaseUrl();
    console.log('[authz][desktop] fetchCloudOrganizationAccess:start', {
        organizationId,
        cloudBaseUrl,
    });
    if (!cloudBaseUrl) {
        return null;
    }

    const incomingHeaders = await headers();
    const forwardedHeaders = createAuthProxyHeaders(incomingHeaders, cloudBaseUrl);
    const url = new URL('/api/organization/access', cloudBaseUrl);
    url.searchParams.set('organizationId', organizationId);

    try {
        const response = await fetch(url.toString(), {
            headers: forwardedHeaders,
            cache: 'no-store',
        });
        console.log('[authz][desktop] fetchCloudOrganizationAccess:response', {
            organizationId,
            status: response.status,
            ok: response.ok,
            url: url.toString(),
        });

        if (!response.ok) {
            return null;
        }

        const payload = (await response.json().catch(() => null)) as
            | { code?: number; data?: { access?: OrganizationAccess | null } }
            | null;

        if (payload?.code !== 0) {
            console.log('[authz][desktop] fetchCloudOrganizationAccess:invalid-payload', {
                organizationId,
                payload,
            });
            return null;
        }

        console.log('[authz][desktop] fetchCloudOrganizationAccess:success', {
            organizationId,
            access: payload?.data?.access ?? null,
        });
        return payload?.data?.access ?? null;
    } catch {
        console.log('[authz][desktop] fetchCloudOrganizationAccess:error', {
            organizationId,
        });
        return null;
    }
}

export async function resolveDesktopOrganizationAccess(organizationId: string, userId: string): Promise<OrganizationAccess | null> {
    const session = await getSessionFromRequest();
    const sessionUserId = session?.user?.id ?? null;
    const activeOrganizationId = resolveCurrentOrganizationId(session);
    console.log('[authz][desktop] resolveDesktopOrganizationAccess', {
        organizationId,
        userId,
        sessionUserId,
        activeOrganizationId,
    });

    if (!sessionUserId || !activeOrganizationId) {
        return null;
    }

    if (sessionUserId !== userId || activeOrganizationId !== organizationId) {
        return null;
    }

    const cloudBaseUrl = getCloudApiBaseUrl();
    const cloudAccess = await fetchCloudOrganizationAccess(organizationId);
    if (cloudAccess?.isMember) {
        return cloudAccess;
    }

    if (cloudBaseUrl) {
        return null;
    }

    console.log('[authz][desktop] resolveDesktopOrganizationAccess:fallback-session-only', {
        organizationId,
        userId,
    });
    return {
        source: 'desktop',
        organizationId,
        userId,
        isMember: true,
        role: null,
        organization: {
            id: organizationId,
            slug: organizationId,
            name: organizationId,
        },
    };
}
