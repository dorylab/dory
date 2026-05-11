import { useAtom, useAtomValue } from 'jotai';
import { useEffect } from 'react';
import type { ResponseObject } from '@dory/shared';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom, tablesAtom } from '@/shared/stores/app.store';

const inflightTableRequests = new Map<string, Promise<void>>();

export function useTables(databases: string) {
    const [tablesState, setTablesState] = useAtom(tablesAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id ?? null;
    const requestKey = connectionId && databases ? `${connectionId}::${databases}` : null;

    useEffect(() => {
        if (!connectionId || !databases) {
            setTablesState({
                connectionId,
                database: databases || null,
                items: [],
            });
            return;
        }

        if (tablesState.connectionId === connectionId && tablesState.database === databases && tablesState.items.length > 0) {
            return;
        }

        if (tablesState.connectionId !== connectionId || tablesState.database !== databases) {
            setTablesState({
                connectionId,
                database: databases,
                items: [],
            });
        }

        void refresh(connectionId, databases);
    }, [connectionId, databases, tablesState.connectionId, tablesState.database, tablesState.items.length, setTablesState]);

    const refresh = async (requestedConnectionId = connectionId ?? undefined, requestedDatabase = databases) => {
        if (!requestedConnectionId || !requestedDatabase) {
            return;
        }

        const scopedRequestKey = `${requestedConnectionId}::${requestedDatabase}`;
        const existingRequest = inflightTableRequests.get(scopedRequestKey);
        if (existingRequest) {
            await existingRequest;
            return;
        }

        const encodedDb = encodeURIComponent(requestedDatabase);
        const request = (async () => {
            const response = await authFetch(`/api/connection/${requestedConnectionId}/databases/${encodedDb}/tables`, {
                method: 'GET',
                headers: {
                    'X-Connection-ID': requestedConnectionId,
                },
            });
            const res = (await response.json()) as ResponseObject<any>;
            if (isSuccess(res)) {
                setTablesState(prev => {
                    if (prev.connectionId !== requestedConnectionId || prev.database !== requestedDatabase) {
                        return prev;
                    }

                    return {
                        connectionId: requestedConnectionId,
                        database: requestedDatabase,
                        items: res.data ?? [],
                    };
                });
            }
        })();

        inflightTableRequests.set(scopedRequestKey, request);
        try {
            await request;
        } finally {
            inflightTableRequests.delete(scopedRequestKey);
        }
    };

    return {
        tables: requestKey && tablesState.connectionId === connectionId && tablesState.database === databases ? tablesState.items : [],
        refresh,
    };
}
