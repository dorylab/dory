import { useAtom, useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { executeActionClient } from '@/lib/actions/client';
import { currentConnectionAtom, tablesAtom } from '@/shared/stores/app.store';

const inflightTableRequests = new Map<string, Promise<void>>();

export function useTables(databases: string) {
    const [tablesState, setTablesState] = useAtom(tablesAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection?.id ?? null;
    const requestKey = connectionId && databases ? `${connectionId}::${databases}` : null;

    useEffect(() => {
        if (!connectionId || !databases) {
            setTablesState({
                connectionId,
                database: databases || null,
                items: [],
                loading: false,
            });
            return;
        }

        if (tablesState.connectionId === connectionId && tablesState.database === databases && !tablesState.loading) {
            return;
        }

        if (tablesState.connectionId !== connectionId || tablesState.database !== databases) {
            setTablesState({
                connectionId,
                database: databases,
                items: [],
                loading: true,
            });
        }

        void refresh(connectionId, databases);
    }, [connectionId, databases, tablesState.connectionId, tablesState.database, tablesState.items.length, tablesState.loading, setTablesState]);

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

        const request = (async () => {
            setTablesState(prev => {
                if (prev.connectionId !== requestedConnectionId || prev.database !== requestedDatabase) {
                    return prev;
                }

                return {
                    ...prev,
                    loading: true,
                };
            });

            try {
                const [tablesResult, viewsResult] = await Promise.all([
                    executeActionClient<{ tables: any[] }>(
                        'schema.listTables',
                        { connectionId: requestedConnectionId, database: requestedDatabase },
                        { currentConnectionId: requestedConnectionId },
                    ),
                    executeActionClient<{ views: any[] }>(
                        'schema.listViews',
                        { connectionId: requestedConnectionId, database: requestedDatabase },
                        { currentConnectionId: requestedConnectionId },
                    ).catch(() => null),
                ]);

                if (tablesResult) {
                    const merged = new Map<string, any>();
                    for (const item of tablesResult.tables ?? []) {
                        const key = String(item?.value ?? item?.name ?? item?.label ?? '');
                        if (key) merged.set(key, item);
                    }
                    if (viewsResult) {
                        for (const item of viewsResult.views ?? []) {
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
                            loading: false,
                        };
                    });
                    return;
                }
            } finally {
                setTablesState(prev => {
                    if (prev.connectionId !== requestedConnectionId || prev.database !== requestedDatabase) {
                        return prev;
                    }

                    return {
                        ...prev,
                        loading: false,
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
        loading: requestKey && tablesState.connectionId === connectionId && tablesState.database === databases ? tablesState.loading : false,
        refresh,
    };
}
