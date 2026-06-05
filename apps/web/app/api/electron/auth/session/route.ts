import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import {
    clearDesktopAuthSnapshot,
    readDesktopAuthSnapshot,
    writeDesktopAuthSnapshot,
    type DesktopAuthSnapshotOrganization,
    type DesktopAuthSnapshotUser,
} from '@/lib/auth/desktop-auth-snapshot';
import { fetchDesktopCloud } from '@/lib/server/desktop-cloud';
import type { OrganizationAccess } from '@/lib/server/authz/types';
import { isDesktopRuntime } from '@dory/shared/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toSnapshotUser(user: unknown): DesktopAuthSnapshotUser | null {
    if (!user || typeof user !== 'object') return null;
    const record = user as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.trim()) return null;

    return {
        id: record.id,
        email: typeof record.email === 'string' ? record.email : null,
        name: typeof record.name === 'string' ? record.name : null,
        image: typeof record.image === 'string' ? record.image : null,
        emailVerified: typeof record.emailVerified === 'boolean' ? record.emailVerified : false,
        ...(typeof record.isAnonymous === 'boolean' ? { isAnonymous: record.isAnonymous } : {}),
    };
}

function toSnapshotOrganization(
    value: unknown,
    activeOrganizationId: string | null,
): DesktopAuthSnapshotOrganization | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const id = typeof record.id === 'string' && record.id.trim() ? record.id : null;
    const slug = typeof record.slug === 'string' && record.slug.trim() ? record.slug : id;
    const name = typeof record.name === 'string' && record.name.trim() ? record.name : slug;

    if (!id || !slug || !name) return null;
    if (activeOrganizationId && id !== activeOrganizationId) return null;

    return { id, slug, name };
}

async function fetchDesktopCloudOrganizations(activeOrganizationId: string | null): Promise<DesktopAuthSnapshotOrganization | null> {
    const organizationResponse = await fetchDesktopCloud('/api/auth/organization/list');
    if (organizationResponse.state !== 'available' || !organizationResponse.response.ok) {
        return null;
    }

    const organizations = (await organizationResponse.response.json().catch(() => null)) as unknown;
    if (!Array.isArray(organizations)) return null;

    const selectedOrganization = activeOrganizationId
        ? organizations.find(organization => toSnapshotOrganization(organization, activeOrganizationId))
        : (organizations[0] ?? null);

    return toSnapshotOrganization(selectedOrganization, activeOrganizationId);
}

type DesktopCloudAccessAttempt =
    | {
          status: 'granted';
          access: OrganizationAccess;
      }
    | {
          status: 'denied';
      }
    | {
          status: 'unavailable';
      };

async function fetchDesktopCloudAccess(activeOrganizationId: string | null): Promise<DesktopCloudAccessAttempt> {
    if (!activeOrganizationId) {
        return { status: 'unavailable' };
    }

    const accessResponse = await fetchDesktopCloud(`/api/organization/access?organizationId=${encodeURIComponent(activeOrganizationId)}`);
    if (accessResponse.state !== 'available') {
        return { status: 'unavailable' };
    }

    if (accessResponse.response.status === 401 || accessResponse.response.status === 403) {
        return { status: 'denied' };
    }

    if (!accessResponse.response.ok) {
        return { status: 'unavailable' };
    }

    const payload = (await accessResponse.response.json().catch(() => null)) as
        | {
              code?: number;
              data?: {
                  access?: OrganizationAccess | null;
              };
          }
        | null;

    if (payload?.code !== 0 || !payload.data?.access?.isMember) {
        return { status: 'denied' };
    }

    return {
        status: 'granted',
        access: payload.data.access,
    };
}

export async function GET(_req: NextRequest) {
    if (!isDesktopRuntime()) {
        return NextResponse.json({ ok: false, error: 'desktop_runtime_required' }, { status: 404 });
    }

    const cloudSessionResponse = await fetchDesktopCloud('/api/auth/get-session');
    if (cloudSessionResponse.state !== 'available') {
        return NextResponse.json({ ok: false, error: cloudSessionResponse.state, snapshotUpdated: false }, { status: 503 });
    }

    if (cloudSessionResponse.response.status === 401 || cloudSessionResponse.response.status === 403) {
        clearDesktopAuthSnapshot();
        return NextResponse.json({ ok: false, session: null, user: null, snapshotCleared: true }, { status: 401 });
    }

    if (!cloudSessionResponse.response.ok) {
        return NextResponse.json(
            { ok: false, error: 'cloud_session_unavailable', snapshotUpdated: false },
            { status: cloudSessionResponse.response.status },
        );
    }

    const session = await cloudSessionResponse.response.json().catch(() => null);
    if (!session?.session || !session?.user) {
        clearDesktopAuthSnapshot();
        return NextResponse.json({ ok: false, session: null, user: null, snapshotCleared: true });
    }

    const snapshotUser = toSnapshotUser(session.user);
    if (!snapshotUser) {
        clearDesktopAuthSnapshot();
        return NextResponse.json({ ok: false, error: 'invalid_cloud_session_user', snapshotCleared: true }, { status: 502 });
    }

    const activeOrganizationId = resolveCurrentOrganizationId(session);
    const accessAttempt = await fetchDesktopCloudAccess(activeOrganizationId);
    if (accessAttempt.status === 'denied') {
        clearDesktopAuthSnapshot();
        return NextResponse.json({ ok: false, session: null, user: null, snapshotCleared: true }, { status: 403 });
    }

    const existingSnapshot = readDesktopAuthSnapshot();
    const reusableAccess =
        existingSnapshot?.user.id === snapshotUser.id && existingSnapshot.activeOrganizationId === activeOrganizationId ? existingSnapshot.access : null;
    const access = accessAttempt.status === 'granted' ? accessAttempt.access : reusableAccess;
    const organization =
        toSnapshotOrganization(access?.organization, activeOrganizationId) ?? (await fetchDesktopCloudOrganizations(activeOrganizationId));
    const snapshot = writeDesktopAuthSnapshot({
        user: snapshotUser,
        activeOrganizationId,
        organization,
        access,
    });

    return NextResponse.json({
        ok: true,
        session: session.session,
        user: session.user,
        activeOrganizationId,
        organization,
        access,
        snapshotUpdated: Boolean(snapshot),
        snapshotUpdatedAt: snapshot?.updatedAt ?? null,
    });
}
