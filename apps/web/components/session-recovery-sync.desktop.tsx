'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { isDesktopRuntime } from '@dory/shared/runtime';

type McpDesktopGrantPayload = {
    grant: string;
};

async function issueMcpDesktopGrant(): Promise<string> {
    const response = await fetch('/api/mcp/desktop-grant', {
        method: 'POST',
        credentials: 'include',
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.code !== 0 || typeof json?.data?.grant !== 'string') {
        throw new Error(json?.message ?? 'Failed to issue MCP desktop grant.');
    }
    return (json.data as McpDesktopGrantPayload).grant;
}

export function SessionRecoverySync() {
    const router = useRouter();
    const { data: session } = authClient.useSession();
    const syncInFlightRef = React.useRef(false);
    const mcpSyncRunIdRef = React.useRef(0);
    const previousUserIdRef = React.useRef<string | null | undefined>(undefined);

    React.useEffect(() => {
        if (!isDesktopRuntime()) {
            return;
        }

        let disposed = false;

        const syncSession = async () => {
            if (disposed || syncInFlightRef.current || !navigator.onLine) {
                return;
            }

            syncInFlightRef.current = true;
            try {
                const response = await fetch('/api/auth/get-session', {
                    credentials: 'include',
                    cache: 'no-store',
                });

                if (!disposed && response.ok) {
                    router.refresh();
                }
            } catch {
                // Ignore transient reconnect failures.
            } finally {
                syncInFlightRef.current = false;
            }
        };

        void syncSession();

        const handleOnline = () => {
            void syncSession();
        };

        window.addEventListener('online', handleOnline);
        return () => {
            disposed = true;
            window.removeEventListener('online', handleOnline);
        };
    }, [router]);

    React.useEffect(() => {
        if (!isDesktopRuntime() || typeof window === 'undefined' || !window.mcpBridge) {
            return;
        }

        const currentUserId = session?.user?.id ?? null;
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

            const state = await window.mcpBridge?.getState(currentUserId).catch(() => null);
            if (!state?.enabled || state.running || syncRunId !== mcpSyncRunIdRef.current) {
                return;
            }

            const grant = await issueMcpDesktopGrant();
            if (syncRunId !== mcpSyncRunIdRef.current) {
                return;
            }
            await window.mcpBridge?.start(grant, currentUserId).catch(() => undefined);
        };

        void syncMcpProxy();
    }, [session?.user?.id]);

    return null;
}
