// hooks/use-connections.ts
'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import posthog from 'posthog-js';
import { useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { isSuccess } from '@/lib/result';
import type { ResponseObject } from '@dory/shared';

import { addConnection, deleteConnection, duplicateConnection, getConnectionDetail, testConnection, getConnections, updateConnection } from '../api';
import { connectionsAtom } from '../states';
import { ConnectionListItem, CreateConnectionPayload } from '@dory/shared/types/connections';

const CONNECTIONS_QUERY_KEY = ['connections'] as const;

type MutationCallbacks<TResult = unknown> = {
    onSuccess?: (res: TResult) => void;
    onError?: (err: unknown) => void;
};

type ConnectionResponse = ResponseObject<ConnectionListItem>;
type ConnectionListResponse = ResponseObject<ConnectionListItem[]>;
type UpdateConnectionPayload = CreateConnectionPayload & { id?: string };

function useSyncConnectionsState() {
    const setConnections = useSetAtom(connectionsAtom);

    return useCallback(
        (connections: ConnectionListItem[]) => {
            setConnections(connections);
        },
        [setConnections],
    );
}

function useConnectionsCache() {
    const queryClient = useQueryClient();
    const syncConnections = useSyncConnectionsState();

    const setAll = useCallback(
        (list: ConnectionListItem[]) => {
            queryClient.setQueryData(CONNECTIONS_QUERY_KEY, list);
            syncConnections(list);
        },
        [queryClient, syncConnections],
    );

    const getSnapshot = useCallback(() => queryClient.getQueryData<ConnectionListItem[]>(CONNECTIONS_QUERY_KEY) ?? [], [queryClient]);

    const invalidate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
    }, [queryClient]);

    return { setAll, getSnapshot, invalidate };
}

export function useConnections(organizationId?: string) {
    const syncConnections = useSyncConnectionsState();

    return useQuery<ConnectionListItem[]>({
        queryKey: organizationId ? [...CONNECTIONS_QUERY_KEY, { organizationId }] : CONNECTIONS_QUERY_KEY,
        queryFn: async () => {
            const res = (await getConnections(organizationId)) as ConnectionListResponse;
            const data = res.data ?? [];

            syncConnections(data);
            return data;
        },
    });
}

export function useConnectionDetail(connectionId?: string) {
    const t = useTranslations('Connections');

    return useQuery<ConnectionListItem>({
        queryKey: [...CONNECTIONS_QUERY_KEY, connectionId],
        queryFn: async () => {
            if (!connectionId) throw new Error(t('Missing connection id'));
            const response = (await getConnectionDetail(connectionId)) as ConnectionResponse;
            return response.data!;
        },
        enabled: Boolean(connectionId),
    });
}

/**
 * variables: NewConnectionPayload（{ connection, ssh?, identities }）
 */
export function useCreateConnection(callback?: MutationCallbacks<ConnectionResponse>) {
    const { setAll, getSnapshot, invalidate } = useConnectionsCache();
    const t = useTranslations('Connections');

    return useMutation<ConnectionResponse, unknown, CreateConnectionPayload>({
        mutationFn: addConnection,
        onSuccess: res => {
            if (isSuccess(res)) {
                toast.success(t('Connection created'));
                const created = res?.data;

                if (created) {
                    const snapshot = getSnapshot();
                    const next = [created, ...snapshot.filter(item => item.connection.id !== created.connection.id)];
                    setAll(next);
                    posthog.capture('connection_created', {
                        connection_type: created.connection.type,
                        connection_id: created.connection.id,
                    });
                } else {
                    invalidate();
                    posthog.capture('connection_created', {});
                }

                callback?.onSuccess?.(res);
            } else {
                toast.error(res?.message ?? t('Create connection failed'));
            }
        },
        onError: err => {
            console.error(err);
            toast.error((err as Error)?.message ?? t('Request error'));
            callback?.onError?.(err);
        },
    });
}

export function useUpdateConnection(callback?: MutationCallbacks<ConnectionResponse>) {
    const { setAll, getSnapshot, invalidate } = useConnectionsCache();
    const t = useTranslations('Connections');

    return useMutation<ConnectionResponse, unknown, UpdateConnectionPayload>({
        mutationFn: variables => updateConnection(variables),
        onSuccess: (res, variables) => {
            if (isSuccess(res)) {
                toast.success(t('Connection updated'));
                const updated = res?.data;
                const updatedConnectionId = updated?.connection?.id;
                const fallbackConnectionId = variables.id ?? variables.connection?.id;

                if (updatedConnectionId) {
                    const snapshot = getSnapshot();
                    const next = snapshot.map(item => (item.connection.id === updatedConnectionId ? { ...item, ...updated } : item));
                    setAll(next);
                    posthog.capture('connection_updated', {
                        connection_type: updated.connection.type,
                        connection_id: updatedConnectionId,
                    });
                } else {
                    invalidate();
                    posthog.capture('connection_updated', fallbackConnectionId ? { connection_id: fallbackConnectionId } : {});
                }

                callback?.onSuccess?.(res);
            } else {
                toast.error(res?.message ?? t('Update connection failed'));
            }
        },
        onError: err => {
            console.error(err);
            toast.error((err as Error)?.message ?? t('Request error'));
            callback?.onError?.(err);
        },
    });
}

export function useDuplicateConnection(callback?: MutationCallbacks<ConnectionResponse>) {
    const { setAll, getSnapshot, invalidate } = useConnectionsCache();
    const t = useTranslations('Connections');

    return useMutation<ConnectionResponse, unknown, string>({
        mutationFn: (connectionId: string) => duplicateConnection(connectionId),
        onSuccess: (res, sourceConnectionId) => {
            if (isSuccess(res)) {
                toast.success(t('Connection duplicated'));
                const duplicated = res?.data;

                if (duplicated) {
                    const snapshot = getSnapshot();
                    const next = [...snapshot.filter(item => item.connection.id !== duplicated.connection.id), duplicated];
                    setAll(next);
                    posthog.capture('connection_duplicated', {
                        source_connection_id: sourceConnectionId,
                        connection_type: duplicated.connection.type,
                        connection_id: duplicated.connection.id,
                    });
                } else {
                    invalidate();
                    posthog.capture('connection_duplicated', { source_connection_id: sourceConnectionId });
                }

                callback?.onSuccess?.(res);
            } else {
                toast.error(res?.message ?? t('Duplicate connection failed'));
            }
        },
        onError: err => {
            console.error(err);
            toast.error((err as Error)?.message ?? t('Request error'));
            callback?.onError?.(err);
        },
    });
}

export function useDeleteConnection(callback?: MutationCallbacks<ResponseObject<null>>) {
    const { setAll, getSnapshot } = useConnectionsCache();
    const t = useTranslations('Connections');

    return useMutation<ResponseObject<null>, unknown, string>({
        mutationFn: (connectionId: string) => deleteConnection(connectionId),
        onSuccess: (res, connectionId) => {
            if (isSuccess(res)) {
                toast.success(t('Connection deleted'));

                if (connectionId) {
                    const snapshot = getSnapshot();
                    const next = snapshot.filter(item => item.connection.id !== connectionId);
                    setAll(next);
                }

                posthog.capture('connection_deleted', { connection_id: connectionId });
                callback?.onSuccess?.(res);
            } else {
                toast.error(res?.message ?? t('Delete connection failed'));
            }
        },
        onError: err => {
            console.error(err);
            toast.error((err as Error)?.message ?? t('Request error'));
            callback?.onError?.(err);
        },
    });
}

export function useTestConnection(callback?: MutationCallbacks<ResponseObject<unknown>>) {
    const { invalidate } = useConnectionsCache();
    const t = useTranslations('Connections');

    return useMutation<ResponseObject<unknown>, unknown, CreateConnectionPayload>({
        mutationFn: testConnection,
        onSuccess: res => {
            if (isSuccess(res)) {
                const version = res?.data && typeof res.data === 'object' && 'version' in res.data && typeof res.data.version === 'string' ? res.data.version : t('Unknown');
                toast.success(t('Connection test success', { version }));
                invalidate();
                callback?.onSuccess?.(res);
            } else {
                toast.error(res?.message ?? t('Connection test failed'));
                invalidate();
            }
        },
        onError: err => {
            console.error(err);
            toast.error((err as Error)?.message ?? t('Request error'));
            callback?.onError?.(err);
            invalidate();
        },
    });
}
