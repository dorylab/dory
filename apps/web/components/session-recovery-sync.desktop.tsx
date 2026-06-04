'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { isDesktopRuntime } from '@dory/shared/runtime';

type McpDesktopGrantPayload = {
    grant: string;
};

const MCP_RECOVERY_RETRY_DELAYS_MS = [0, 1000, 3000, 7000];

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function logMcpRecoveryError(error: unknown) {
    window.logBridge?.log('warn', '[mcp] automatic recovery failed:', error instanceof Error ? error.message : String(error));
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

export function SessionRecoverySync() {
    const { data: session } = authClient.useSession();
    const params = useParams<{ organization?: string }>();
    const organizationSlugOrId = params.organization;
    const mcpSyncRunIdRef = React.useRef(0);
    const previousUserIdRef = React.useRef<string | null | undefined>(undefined);

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
    }, [organizationSlugOrId, session?.user?.id]);

    return null;
}
