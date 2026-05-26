import type { OrganizationAccess } from './types';

export type DesktopOrganizationAccessResolution = 'granted_from_cloud' | 'denied' | 'unauthenticated';

export type DesktopOrganizationAccessResult =
    | {
          status: 'granted_from_cloud';
          access: OrganizationAccess;
      }
    | {
          status: 'denied' | 'unauthenticated';
          access: null;
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

export function finalizeDesktopOrganizationAccessResult(options: {
    organizationId: string;
    userId: string;
    sessionUserId: string | null;
    activeOrganizationId: string | null;
    cloudAttempt: CloudOrganizationAccessAttempt;
}): DesktopOrganizationAccessResult {
    const {
        organizationId,
        userId,
        sessionUserId,
        activeOrganizationId,
        cloudAttempt,
    } = options;

    if (!sessionUserId || !activeOrganizationId) {
        return {
            status: 'unauthenticated',
            access: null,
        };
    }

    if (sessionUserId !== userId || activeOrganizationId !== organizationId) {
        return {
            status: 'denied',
            access: null,
        };
    }

    if (cloudAttempt.status === 'granted') {
        return {
            status: 'granted_from_cloud',
            access: cloudAttempt.access,
        };
    }

    return {
        status: 'denied',
        access: null,
    };
}
