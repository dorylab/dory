'use client';

import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { useParams, useRouter } from 'next/navigation';

import { currentConnectionAtom } from '@/shared/stores/app.store';
import { connectionListLoadingAtom, connectionLoadingAtom } from '../../connections/states';

type RouteParams = {
    organization?: string | string[];
    connectionId?: string | string[];
    connection?: string | string[];
};

export function usePrivilegesConnectionReady() {
    const router = useRouter();
    const params = useParams<RouteParams>();
    const teamParam = params?.organization;
    const organization = Array.isArray(teamParam) ? teamParam[0] : teamParam;
    const routeConnectionParam = params?.connectionId ?? params?.connection;
    const routeConnectionId = Array.isArray(routeConnectionParam) ? routeConnectionParam[0] : routeConnectionParam;
    const currentConnection = useAtomValue(currentConnectionAtom);
    const isConnectionListLoading = useAtomValue(connectionListLoadingAtom);
    const connectLoadings = useAtomValue(connectionLoadingAtom);
    const connectionId = currentConnection?.connection.id;
    const connectionType = currentConnection?.connection.type;
    const isCurrentRouteConnection = Boolean(routeConnectionId && connectionId === routeConnectionId);
    const isClickhouseConnection = isCurrentRouteConnection && connectionType === 'clickhouse';
    const isConnectionLoading = Boolean(
        routeConnectionId &&
            Object.entries(connectLoadings ?? {}).some(([key, value]) => value && (key === routeConnectionId || key.startsWith(`${routeConnectionId}:`))),
    );

    useEffect(() => {
        if (!organization || !routeConnectionId || isConnectionListLoading || isConnectionLoading || !isCurrentRouteConnection) return;
        if (connectionType === 'clickhouse') return;

        router.replace(`/${organization}/${routeConnectionId}/sql-console`);
    }, [connectionType, isConnectionListLoading, isConnectionLoading, isCurrentRouteConnection, routeConnectionId, router, organization]);

    return {
        connectionId,
        routeConnectionId,
        isClickhouseConnection,
        isConnectionReady: !isConnectionListLoading && isCurrentRouteConnection && !isConnectionLoading,
    };
}
