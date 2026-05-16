'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';

import { connectConnection } from '../api';
import { connectionLoadingAtom, connectionsAtom, searchResultAtom } from '../states';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import type { ResponseObject } from '@dory/shared';
import type { ConnectionListItem } from '@dory/shared/types/connections';

const CONNECTIONS_QUERY_KEY = ['connections'] as const;

type ConnectParams = {
    payload: ConnectionListItem;
    navigateToConsole?: boolean;
    identityId?: string | null;
    setCurrentImmediately?: boolean;
};

function makeLoadingKey(connectionId: string, identityId?: string | null) {
    return identityId ? `${connectionId}:${identityId}` : connectionId;
}

function resolveTeamId(paramsTeam: unknown, pathname: string | null): string | null {
    const paramValue = Array.isArray(paramsTeam) ? paramsTeam[0] : paramsTeam;
    if (typeof paramValue === 'string' && paramValue.length > 0) {
        return paramValue;
    }

    if (!pathname) return null;

    const segments = pathname.split('/').filter(Boolean);
    return segments[0] ?? null;
}

type ConnectResponseData = {
    lastCheckStatus?: 'ok' | 'error' | 'unknown';
    lastCheckAt?: string | Date | null;
    lastCheckLatencyMs?: number | null;
    lastCheckError?: string | null;
};

function withConnectedStatus(payload: ConnectionListItem, data: ConnectResponseData | null | undefined): ConnectionListItem {
    const checkedAt = data?.lastCheckAt ?? new Date().toISOString();
    return {
        ...payload,
        connection: {
            ...payload.connection,
            lastCheckStatus: data?.lastCheckStatus ?? 'ok',
            lastCheckAt: checkedAt instanceof Date ? checkedAt : new Date(checkedAt),
            lastCheckLatencyMs: typeof data?.lastCheckLatencyMs === 'number' ? data.lastCheckLatencyMs : payload.connection.lastCheckLatencyMs,
            lastCheckError: data?.lastCheckError ?? null,
        },
    };
}

function updateConnectionListItem(list: ConnectionListItem[] | undefined, updated: ConnectionListItem) {
    return (list ?? []).map(item => (item.connection.id === updated.connection.id ? { ...item, ...updated } : item));
}

export function useConnectConnection() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const pathname = usePathname();
    const params = useParams();
    const t = useTranslations('Connections');
    const organizationId = resolveTeamId(params?.organization, pathname);

    const setConnectLoadings = useSetAtom(connectionLoadingAtom);
    const setCurrentConnection = useSetAtom(currentConnectionAtom);
    const setConnections = useSetAtom(connectionsAtom);
    const setSearchResult = useSetAtom(searchResultAtom);

    return useMutation<ResponseObject<ConnectResponseData>, Error, ConnectParams>({
        mutationFn: async ({ payload, identityId }) => {
            if (!payload?.connection?.id) throw new Error(t('Missing connection id'));

            const requestPayload = identityId ? { ...payload, identityId } : payload;
            return connectConnection(requestPayload as ConnectionListItem & { identityId?: string | null });
        },
        onMutate: ({ payload, identityId, setCurrentImmediately }) => {
            if (!payload?.connection?.id) return;
            if (setCurrentImmediately ?? true) {
                setCurrentConnection(payload);
            }
            setConnectLoadings((prev: Record<string, boolean> = {}) => ({
                ...prev,
                [makeLoadingKey(payload.connection.id, identityId)]: true,
            }));
        },
        onSuccess: (res, { payload, navigateToConsole, setCurrentImmediately }) => {
            const connectedPayload = withConnectedStatus(payload, res.data);
            setCurrentConnection(connectedPayload);
            queryClient.setQueryData<ConnectionListItem[]>(CONNECTIONS_QUERY_KEY, list => updateConnectionListItem(list, connectedPayload));
            setConnections(list => updateConnectionListItem(list, connectedPayload));
            setSearchResult(list => (list ? updateConnectionListItem(list, connectedPayload) : list));
            posthog.capture('connection_opened', {
                connection_type: payload.connection.type,
                connection_id: payload.connection.id,
            });
            if (navigateToConsole && organizationId) {
                router.push(`/${organizationId}/${payload.connection.id}/sql-console`);
            }
        },
        onError: error => {
            posthog.capture('connection_open_failed', {
                error: (error as Error)?.message,
            });
            toast.error((error as Error)?.message || t('Connection failed'));
        },
        onSettled: (_res, _error, { payload, identityId }) => {
            if (!payload?.connection?.id) return;
            setConnectLoadings((prev: Record<string, boolean> = {}) => {
                const next = { ...prev };
                delete next[makeLoadingKey(payload.connection.id, identityId)];
                return next;
            });
        },
    });
}
