import { useAtom, useAtomValue } from 'jotai';
import { currentConnectionAtom, databasesAtom } from '@/shared/stores/app.store';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { executeActionClient } from '@/lib/actions/client';

const inflightDatabaseRequests = new Map<string, Promise<void>>();

export function useDatabases() {
    const [databasesState, setDatabasesState] = useAtom(databasesAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const params = useParams<{ connectionId?: string | string[]; connection?: string | string[] }>();
    const routeConnectionParam = params?.connectionId ?? params?.connection;
    const routeConnectionId = Array.isArray(routeConnectionParam) ? routeConnectionParam[0] : routeConnectionParam;
    const connectionId = routeConnectionId ?? currentConnection?.connection?.id ?? null;

    useEffect(() => {
        if (!connectionId) {
            setDatabasesState({
                connectionId: null,
                items: [],
                loading: false,
            });
            return;
        }

        if (databasesState.connectionId === connectionId && databasesState.items.length > 0) {
            return;
        }

        if (databasesState.connectionId !== connectionId) {
            setDatabasesState({
                connectionId,
                items: [],
                loading: true,
            });
        }

        void refresh(connectionId);
    }, [connectionId, databasesState.connectionId, databasesState.items.length, setDatabasesState]);

    const refresh = async (requestedConnectionId = connectionId ?? undefined) => {
        if (!requestedConnectionId) {
            return;
        }

        const requestKey = requestedConnectionId;
        const existingRequest = inflightDatabaseRequests.get(requestKey);
        if (existingRequest) {
            await existingRequest;
            return;
        }

        const request = (async () => {
            setDatabasesState(prev => ({ ...prev, loading: true }));
            const result = await executeActionClient<{ databases: any[] }>('schema.listDatabases', { connectionId: requestedConnectionId }, { currentConnectionId: requestedConnectionId });
            setDatabasesState(prev => {
                if (prev.connectionId !== requestedConnectionId && prev.items.length > 0) {
                    return prev;
                }

                return {
                    connectionId: requestedConnectionId,
                    items: result.databases ?? [],
                    loading: false,
                };
            });
        })();

        inflightDatabaseRequests.set(requestKey, request);
        try {
            await request;
        } finally {
            inflightDatabaseRequests.delete(requestKey);
        }
    };

    return {
        databases: databasesState.connectionId === connectionId ? databasesState.items : [],
        loading: databasesState.loading,
        refresh,
    };
}
