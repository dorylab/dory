import { useQuery } from '@tanstack/react-query';
import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { useRouteConnectionId } from '@/app/(app)/[organization]/[connectionId]/sql-console/hooks/useRouteConnectionId';
import { executeActionClient } from '@/lib/actions/client';
import { currentConnectionAtom, schemaMetadataRefreshAtom } from '@/shared/stores/app.store';

type SchemaOption = { value: string; label: string };
const emptySchemas: SchemaOption[] = [];

export function useSchemas(database?: string, enabled = true, scopedConnectionId?: string) {
    const currentConnection = useAtomValue(currentConnectionAtom);
    const routeConnectionId = useRouteConnectionId();
    const organizationId = useOrganizationId();
    const metadataRefresh = useAtomValue(schemaMetadataRefreshAtom);
    const lastRefresh = useRef(metadataRefresh.version);
    const connectionId = scopedConnectionId ?? routeConnectionId ?? currentConnection?.connection?.id;
    const query = useQuery({
        queryKey: ['schema', 'schemas', organizationId, connectionId, database],
        enabled: Boolean(enabled && database && connectionId),
        queryFn: ({ signal }) =>
            executeActionClient<SchemaOption[]>('schema.listSchemas', { connectionId, database }, { organizationId, currentConnectionId: connectionId, signal }),
    });

    useEffect(() => {
        if (!enabled || !connectionId || !database || metadataRefresh.connectionId !== connectionId || lastRefresh.current === metadataRefresh.version) return;
        lastRefresh.current = metadataRefresh.version;
        if (!metadataRefresh.database || metadataRefresh.database === database) void query.refetch();
    }, [connectionId, database, enabled, metadataRefresh, query.refetch]);

    return { schemas: enabled ? (query.data ?? emptySchemas) : emptySchemas, refresh: query.refetch };
}
