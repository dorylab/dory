import { shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { resolveDesktopOrganizationAccess } from './authz.desktop';
import { resolveLocalOrganizationAccess } from './authz.local';
import type { OrganizationAccess, OrganizationAccessRole } from './types';

export type { OrganizationAccess, OrganizationAccessRole } from './types';

const ORGANIZATION_ACCESS_TTL_MS = 60 * 1000;

const organizationAccessCache = new Map<
    string,
    {
        expiresAt: number;
        value: OrganizationAccess | null;
    }
>();

export async function resolveOrganizationAccess(organizationId: string, userId: string): Promise<OrganizationAccess | null> {
    const proxy = shouldProxyAuthRequest();
    const cacheKey = `${proxy ? 'desktop' : 'local'}:${userId}:${organizationId}`;
    const cached = organizationAccessCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
        console.log('[authz] resolveOrganizationAccess:cache-hit', {
            organizationId,
            userId,
            proxy,
            expiresInMs: cached.expiresAt - now,
        });
        return cached.value;
    }

    console.log('[authz] resolveOrganizationAccess', {
        organizationId,
        userId,
        proxy,
        runtime: process.env.DORY_RUNTIME ?? null,
        publicRuntime: process.env.NEXT_PUBLIC_DORY_RUNTIME ?? null,
        cloudApiUrl: process.env.DORY_CLOUD_API_URL ?? process.env.NEXT_PUBLIC_DORY_CLOUD_API_URL ?? null,
    });

    const value = proxy
        ? await resolveDesktopOrganizationAccess(organizationId, userId)
        : await resolveLocalOrganizationAccess(organizationId, userId);

    organizationAccessCache.set(cacheKey, {
        expiresAt: now + ORGANIZATION_ACCESS_TTL_MS,
        value,
    });

    return value;
}

export function canManageOrganization(access: Pick<OrganizationAccess, 'isMember' | 'role'> | null): boolean {
    if (!access?.isMember) {
        return false;
    }

    return access.role === 'owner' || access.role === 'admin';
}
