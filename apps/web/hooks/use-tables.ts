import { useQuery } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';

import type { SidebarTableEntry } from '@/app/(app)/[organization]/components/sql-console-sidebar/types';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';
import { currentConnectionAtom, schemaMetadataRefreshAtom, tablesAtom } from '@/shared/stores/app.store';

const emptyTables: SidebarTableEntry[] = [];

export function useTables(database: string, scopedConnectionId?: string) {
    const setTablesState = useSetAtom(tablesAtom);
    const connection = useAtomValue(currentConnectionAtom);
    const organizationId = useOrganizationId();
    const metadataRefresh = useAtomValue(schemaMetadataRefreshAtom);
    const lastRefresh = useRef(metadataRefresh.version);
    const connectionId = scopedConnectionId ?? connection?.connection?.id ?? null;
    const query = useQuery({
        queryKey: ['schema', 'tables', organizationId, connectionId, database],
        enabled: Boolean(connectionId && database),
        queryFn: async ({ signal }) => {
            const input = { connectionId, database };
            const options = { organizationId, currentConnectionId: connectionId, signal };
            const [tables, views] = await Promise.all([
                executeActionClient<{ tables: SidebarTableEntry[] }>('schema.listTables', input, options),
                executeActionClient<{ views: SidebarTableEntry[] }>('schema.listViews', input, options).catch(() => null),
            ]);
            const entries = new Map<string, SidebarTableEntry & { label: string }>();
            for (const item of [...(tables.tables ?? []), ...(views?.views ?? [])]) {
                const key = item.value ?? item.name ?? item.label;
                if (key && !entries.has(key)) entries.set(key, { ...item, label: item.label ?? key });
            }
            return [...entries.values()];
        },
    });
    const loading = Boolean(connectionId && database && query.isPending);

    useEffect(() => {
        if (!scopedConnectionId) setTablesState({ connectionId, database: database || null, items: query.data ?? [], loading });
    }, [connectionId, database, loading, query.data, scopedConnectionId, setTablesState]);

    useEffect(() => {
        if (!connectionId || !database || metadataRefresh.connectionId !== connectionId || lastRefresh.current === metadataRefresh.version) return;
        lastRefresh.current = metadataRefresh.version;
        if (!metadataRefresh.database || metadataRefresh.database === database) void query.refetch();
    }, [connectionId, database, metadataRefresh, query.refetch]);

    return { tables: query.data ?? emptyTables, loading, refresh: query.refetch };
}
