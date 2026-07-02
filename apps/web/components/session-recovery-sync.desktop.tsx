'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { refreshDesktopAuthSnapshot } from '@/lib/client/desktop-auth-snapshot';
import { resolveMcpRecoveryOrganizationSlugOrId } from '@/lib/client/mcp-recovery';
import { isDesktopRuntime } from '@dory/shared/runtime';

type McpDesktopGrantPayload = {
    grant: string;
};

const MCP_RECOVERY_RETRY_DELAYS_MS = [0, 1000, 3000, 7000];
const AUTH_SNAPSHOT_REFRESH_MIN_INTERVAL_MS = 30 * 1000;

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function logMcpRecoveryError(error: unknown) {
    window.logBridge?.log('warn', '[mcp] automatic recovery failed:', error instanceof Error ? error.message : String(error));
}

function logAuthSnapshotRefreshError(error: unknown) {
    window.logBridge?.log('warn', '[auth] desktop snapshot refresh failed:', error instanceof Error ? error.message : String(error));
}

async function issueMcpDesktopGrant(organizationSlugOrId?: string): Promise<string> {
    const response = await fetch('/api/mcp/desktop-grant', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ organizationSlugOrId }),
        credentials: 'include',
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.code !== 0 || typeof json?.data?.grant !== 'string') {
        throw new Error(json?.message ?? 'Failed to issue MCP desktop grant.');
    }
    return (json.data as McpDesktopGrantPayload).grant;
}

type SessionRecoverySyncProps = {
    initialUserId?: string | null;
    initialActiveOrganizationId?: string | null;
    initialOrganizationId?: string | null;
};

function buildAuthSnapshotSignature(input: { userId?: string | null; activeOrganizationId?: string | null; organizationId?: string | null }) {
    if (!input.userId) return null;
    return `${input.userId}:${input.activeOrganizationId ?? ''}:${input.organizationId ?? ''}`;
}

export function SessionRecoverySync({ initialUserId = null, initialActiveOrganizationId = null, initialOrganizationId = null }: SessionRecoverySyncProps) {
    const { data: session } = authClient.useSession();
    const router = useRouter();
    const params = useParams<{ organization?: string }>();
    const organizationSlugOrId = resolveMcpRecoveryOrganizationSlugOrId({
        initialOrganizationId,
        initialActiveOrganizationId,
        routeOrganizationSlugOrId: params.organization,
    });
    const [mcpRecoveryRefreshKey, setMcpRecoveryRefreshKey] = React.useState(0);
    const mcpSyncRunIdRef = React.useRef(0);
    const previousUserIdRef = React.useRef<string | null | undefined>(undefined);
    const authSnapshotSignatureRef = React.useRef<string | null>(
        buildAuthSnapshotSignature({
            userId: initialUserId,
            activeOrganizationId: initialActiveOrganizationId,
            organizationId: initialOrganizationId,
        }),
    );

    React.useEffect(() => {
        if (!isDesktopRuntime() || typeof window === 'undefined' || !window.mcpBridge) {
            return;
        }

        const currentUserId = session?.user?.id ?? initialUserId;
        const previousUserId = previousUserIdRef.current;
        previousUserIdRef.current = currentUserId;
        const syncRunId = ++mcpSyncRunIdRef.current;

        const syncMcpProxy = async () => {
            if (previousUserId !== undefined && previousUserId !== currentUserId) {
                await window.mcpBridge?.stopActive().catch(() => undefined);
            }

            if (!currentUserId || syncRunId !== mcpSyncRunIdRef.current) {
                return;
            }

            for (const retryDelay of MCP_RECOVERY_RETRY_DELAYS_MS) {
                if (retryDelay > 0) {
                    await wait(retryDelay);
                }
                if (syncRunId !== mcpSyncRunIdRef.current) {
                    return;
                }

                try {
                    const state = await window.mcpBridge?.getState(currentUserId);
                    if (!state?.enabled || state.running || syncRunId !== mcpSyncRunIdRef.current) {
                        return;
                    }

                    const grant = await issueMcpDesktopGrant(organizationSlugOrId);
                    if (syncRunId !== mcpSyncRunIdRef.current) {
                        return;
                    }
                    const nextState = await window.mcpBridge?.start(grant, currentUserId);
                    if (!nextState?.enabled || nextState.running || syncRunId !== mcpSyncRunIdRef.current) {
                        return;
                    }
                } catch (error) {
                    logMcpRecoveryError(error);
                }
            }
        };

        void syncMcpProxy();
    }, [initialUserId, mcpRecoveryRefreshKey, organizationSlugOrId, session?.user?.id]);

    React.useEffect(() => {
        if (!isDesktopRuntime() || typeof window === 'undefined') {
            return;
        }

        let disposed = false;
        let pending = false;
        let lastRefreshAt = 0;

        const refreshSnapshot = async (force = false) => {
            const now = Date.now();
            if (pending || (!force && now - lastRefreshAt < AUTH_SNAPSHOT_REFRESH_MIN_INTERVAL_MS)) {
                return;
            }

            pending = true;
            lastRefreshAt = now;

            try {
                const result = await refreshDesktopAuthSnapshot();
                if (disposed || !result) return;

                const signature = result.snapshotCleared
                    ? 'cleared'
                    : result.ok
                      ? buildAuthSnapshotSignature({
                            userId: result.user?.id,
                            activeOrganizationId: result.activeOrganizationId,
                            organizationId: result.organization?.id,
                        })
                      : null;

                if (signature && signature !== authSnapshotSignatureRef.current) {
                    authSnapshotSignatureRef.current = signature;
                    router.refresh();
                }
                if (result.ok && result.user?.id) {
                    setMcpRecoveryRefreshKey(current => current + 1);
                }
            } catch (error) {
                logAuthSnapshotRefreshError(error);
            } finally {
                pending = false;
            }
        };

        const onFocus = () => {
            void refreshSnapshot();
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void refreshSnapshot();
            }
        };

        void refreshSnapshot(true);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            disposed = true;
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [initialUserId, router]);

    return null;
}
