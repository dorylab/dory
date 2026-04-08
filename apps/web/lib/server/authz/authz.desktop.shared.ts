import { getOrganizationPermissionMap } from '@/lib/auth/organization-ac';
import type { OrganizationAccess } from './types';

export type DesktopOrganizationAccessResolution = 'granted_from_cloud' | 'granted_from_local_fallback' | 'denied' | 'unauthenticated';

export type DesktopOrganizationAccessResult =
    | {
          status: 'granted_from_cloud' | 'granted_from_local_fallback';
          access: OrganizationAccess;
          isOffline: boolean;
      }
    | {
          status: 'denied' | 'unauthenticated';
          access: null;
          isOffline: boolean;
      };

export type CloudOrganizationAccessAttempt =
    | {
          status: 'granted';
          access: OrganizationAccess;
      }
    | {
          status: 'denied';
      }
    | {
          status: 'unreachable' | 'not_configured';
      };

function buildSessionFallbackAccess(organizationId: string, userId: string): OrganizationAccess {
    return {
        source: 'desktop_session_fallback',
        organizationId,
        userId,
        isMember: true,
        role: null,
        permissions: getOrganizationPermissionMap(null),
        organization: {
            id: organizationId,
            slug: organizationId,
            name: organizationId,
        },
    };
}

export function finalizeDesktopOrganizationAccessResult(options: {
    organizationId: string;
    userId: string;
    sessionUserId: string | null;
    activeOrganizationId: string | null;
    cloudAttempt: CloudOrganizationAccessAttempt;
    localAccess: OrganizationAccess | null;
}): DesktopOrganizationAccessResult {
    const {
        organizationId,
        userId,
        sessionUserId,
        activeOrganizationId,
        cloudAttempt,
        localAccess,
    } = options;

    if (!sessionUserId || !activeOrganizationId) {
        return {
            status: 'unauthenticated',
            access: null,
            isOffline: false,
        };
    }

    if (sessionUserId !== userId || activeOrganizationId !== organizationId) {
        return {
            status: 'denied',
            access: null,
            isOffline: false,
        };
    }

    if (cloudAttempt.status === 'granted') {
        return {
            status: 'granted_from_cloud',
            access: cloudAttempt.access,
            isOffline: false,
        };
    }

    if (cloudAttempt.status === 'denied') {
        return {
            status: 'denied',
            access: null,
            isOffline: false,
        };
    }

    if (localAccess?.isMember) {
        return {
            status: 'granted_from_local_fallback',
            access: {
                ...localAccess,
                source: 'desktop_local_fallback',
            },
            isOffline: cloudAttempt.status === 'unreachable',
        };
    }

    return {
        status: 'granted_from_local_fallback',
        access: buildSessionFallbackAccess(organizationId, userId),
        isOffline: cloudAttempt.status === 'unreachable',
    };
}
