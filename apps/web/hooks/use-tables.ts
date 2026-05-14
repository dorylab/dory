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
            const requestInit = {
                method: 'GET',
                headers: {
                    'X-Connection-ID': requestedConnectionId,
                },
            };
            const [tablesResponse, viewsResponse] = await Promise.all([
                authFetch(`/api/connection/${requestedConnectionId}/databases/${encodedDb}/tables`, requestInit),
                authFetch(`/api/connection/${requestedConnectionId}/databases/${encodedDb}/views`, requestInit),
            ]);
            const tablesResult = (await tablesResponse.json()) as ResponseObject<any[]>;
            const viewsResult = (await viewsResponse.json().catch(() => null)) as ResponseObject<any[]> | null;

            if (isSuccess(tablesResult)) {
                const merged = new Map<string, any>();
                for (const item of tablesResult.data ?? []) {
                    const key = String(item?.value ?? item?.name ?? item?.label ?? '');
                    if (key) merged.set(key, item);
                }
                if (viewsResult && isSuccess(viewsResult)) {
                    for (const item of viewsResult.data ?? []) {
                        const key = String(item?.value ?? item?.name ?? item?.label ?? '');
                        if (key && !merged.has(key)) {
                            merged.set(key, item);
                        }
                    }
                }

                setTablesState(prev => {
                    if (prev.connectionId !== requestedConnectionId || prev.database !== requestedDatabase) {
                        return prev;
                    }

                    return {
                        connectionId: requestedConnectionId,
                        database: requestedDatabase,
                        items: [...merged.values()],
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
