// hooks/use-connections.ts
'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { isSuccess } from '@/lib/result';
import type { ResponseObject } from '@/types';

import {
    addConnection,
    deleteConnection,
    getConnectionDetail,
    testConnection,
    getConnections,
    updateConnection,
} from '../api';
import { connectionsAtom, searchResultAtom } from '../states';
import { ConnectionListItem, CreateConnectionPayload } from '@/types/connections';

const CONNECTIONS_QUERY_KEY = ['connections'] as const;

type MutationCallbacks<TResult = unknown> = {
    onSuccess?: (res: TResult) => void;
    onError?: (err: unknown) => void;
};

type ConnectionResponse = ResponseObject<ConnectionListItem>;
type ConnectionListResponse = ResponseObject<ConnectionListItem[]>;
type UpdateConnectionPayload = CreateConnectionPayload & { id?: string };
type UseConnectionsOptions = Omit<UseQueryOptions<ConnectionListItem[], unknown, ConnectionListItem[], typeof CONNECTIONS_QUERY_KEY>, 'queryKey' | 'queryFn'>;

function useSyncConnectionsState() {
    const setConnections = useSetAtom(connectionsAtom);
    const setSearchResult = useSetAtom(searchResultAtom);

    return useCallback(
        (connections: ConnectionListItem[]) => {
            setConnections(connections);
            setSearchResult(connections);
        },
        [setConnections, setSearchResult],
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

    const getSnapshot = useCallback(
        () => queryClient.getQueryData<ConnectionListItem[]>(CONNECTIONS_QUERY_KEY) ?? [],
        [queryClient],
    );

    const invalidate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
    }, [queryClient]);

    return { setAll, getSnapshot, invalidate };
}

export function useConnections() {
    const syncConnections = useSyncConnectionsState();

    return useQuery<ConnectionListItem[]>({
        queryKey: CONNECTIONS_QUERY_KEY,
        queryFn: async () => {
            const res = (await getConnections()) as ConnectionListResponse;
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
        onSuccess: (res, _variables) => {
            if (isSuccess(res)) {
                toast.success(t('Connection created'));
                const created = res?.data;

                if (created) {
                    const snapshot = getSnapshot();
                    const next = [created, ...snapshot.filter(item => item.connection.id !== created.connection.id)];
                    setAll(next);
                } else {
                    invalidate();
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
        onSuccess: (res, _variables) => {
            if (isSuccess(res)) {
                toast.success(t('Connection updated'));
                const updated = res?.data;

                if (updated?.connection.id) {
                    const snapshot = getSnapshot();
                    const next = snapshot.map(item =>
                        item.connection.id === updated.connection.id ? { ...item, ...updated } : item,
                    );
                    setAll(next);
                } else {
                    invalidate();
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

    return useMutation<ResponseObject<any>, unknown, CreateConnectionPayload>({
        mutationFn: testConnection,
        onSuccess: (res, _variables) => {
            if (isSuccess(res)) {
                toast.success(t('Connection test success', { version: res?.data?.version ?? t('Unknown') }));
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
