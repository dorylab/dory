import { useQuery } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { currentConnectionAtom, databasesAtom, schemaMetadataRefreshAtom } from '@/shared/stores/app.store';
import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';

type DatabaseOption = { label: string; value: string };
const emptyDatabases: DatabaseOption[] = [];

export function useDatabases(scopedConnectionId?: string) {
    const organizationId = useOrganizationId();
    const setDatabasesState = useSetAtom(databasesAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const metadataRefresh = useAtomValue(schemaMetadataRefreshAtom);
    const lastHandledRefreshVersionRef = useRef(metadataRefresh.version);
    const params = useParams<{ connectionId?: string | string[]; connection?: string | string[] }>();
    const routeConnectionParam = params?.connectionId ?? params?.connection;
    const routeConnectionId = Array.isArray(routeConnectionParam) ? routeConnectionParam[0] : routeConnectionParam;
    const connectionId = scopedConnectionId ?? routeConnectionId ?? currentConnection?.connection?.id ?? null;
    const currentConnectionId = currentConnection?.connection?.id ?? null;
    const connectionContextReady = Boolean(scopedConnectionId) || !routeConnectionId || currentConnectionId === routeConnectionId;

    const query = useQuery({
        queryKey: ['schema', 'databases', organizationId, connectionId],
        enabled: Boolean(connectionId && connectionContextReady),
        queryFn: async ({ signal }) => {
            if (!connectionId) return [];
            const result = await executeActionClient<{ databases: DatabaseOption[] }>(
                'schema.listDatabases',
                { connectionId },
                { currentConnectionId: connectionId, organizationId, signal },
            );
            return result.databases ?? [];
        },
        staleTime: 5 * 60_000,
    });

    useEffect(() => {
        if (scopedConnectionId) return;
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
    }, [connectionContextReady, connectionId, query.data, query.error, query.isFetching, query.isPending, scopedConnectionId, setDatabasesState]);

    useEffect(() => {
        if (!connectionId || !connectionContextReady || metadataRefresh.connectionId !== connectionId || metadataRefresh.version === 0) {
            return;
        }

        if (lastHandledRefreshVersionRef.current === metadataRefresh.version) {
            return;
        }

        lastHandledRefreshVersionRef.current = metadataRefresh.version;
        void query.refetch();
    }, [connectionContextReady, connectionId, metadataRefresh.connectionId, metadataRefresh.version, query.refetch]);

    return {
        databases: query.data ?? emptyDatabases,
        loading: !connectionContextReady || Boolean(connectionId && query.isPending),
        error: query.error?.message ?? null,
        refresh: async () => {
            await query.refetch();
        },
    };
}
