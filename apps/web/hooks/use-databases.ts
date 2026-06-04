import { useQuery } from '@tanstack/react-query';
import { useAtom, useAtomValue } from 'jotai';
import { currentConnectionAtom, databasesAtom } from '@/shared/stores/app.store';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { executeActionClient } from '@/lib/actions/client';

type DatabaseOption = { label: string; value: string };

export function useDatabases() {
    const [databasesState, setDatabasesState] = useAtom(databasesAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const params = useParams<{ connectionId?: string | string[]; connection?: string | string[] }>();
    const routeConnectionParam = params?.connectionId ?? params?.connection;
    const routeConnectionId = Array.isArray(routeConnectionParam) ? routeConnectionParam[0] : routeConnectionParam;
    const connectionId = routeConnectionId ?? currentConnection?.connection?.id ?? null;
    const currentConnectionId = currentConnection?.connection?.id ?? null;
    const connectionContextReady = !routeConnectionId || currentConnectionId === routeConnectionId;

    const query = useQuery({
        queryKey: ['schema', 'databases', connectionId],
        enabled: Boolean(connectionId && connectionContextReady),
        queryFn: async () => {
            if (!connectionId) return [];
            const result = await executeActionClient<{ databases: DatabaseOption[] }>('schema.listDatabases', { connectionId }, { currentConnectionId: connectionId });
            return result.databases ?? [];
        },
        staleTime: 5 * 60_000,
    });

    useEffect(() => {
        if (!connectionId) {
            setDatabasesState({
                connectionId: null,
                items: [],
                loading: false,
                error: null,
            });
            return;
        }

        if (!connectionContextReady) {
            setDatabasesState(prev => ({
                connectionId,
                items: prev.connectionId === connectionId ? prev.items : [],
                loading: true,
                error: null,
            }));
            return;
        }

        setDatabasesState({
            connectionId,
            items: query.data ?? [],
            loading: query.isPending || (query.isFetching && !query.data),
            error: query.error instanceof Error ? query.error.message : null,
        });
    }, [connectionContextReady, connectionId, query.data, query.error, query.isFetching, query.isPending, setDatabasesState]);

    return {
        databases: databasesState.connectionId === connectionId ? databasesState.items : [],
        loading: databasesState.loading,
        error: databasesState.connectionId === connectionId ? databasesState.error : null,
        refresh: async () => {
            await query.refetch();
        },
    };
}
