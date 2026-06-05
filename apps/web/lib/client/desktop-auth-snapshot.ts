'use client';

export type DesktopAuthSnapshotRefreshResult = {
    ok: boolean;
    user?: {
        id?: string | null;
    } | null;
    activeOrganizationId?: string | null;
    organization?: {
        id?: string | null;
    } | null;
    snapshotUpdated?: boolean;
    snapshotCleared?: boolean;
};

export async function refreshDesktopAuthSnapshot(): Promise<DesktopAuthSnapshotRefreshResult | null> {
    const response = await fetch('/api/electron/auth/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as DesktopAuthSnapshotRefreshResult | null;
    if (!response.ok && !payload?.snapshotCleared) {
        return null;
    }

    return payload;
}
