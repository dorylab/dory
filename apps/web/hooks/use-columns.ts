import { useAtom, useAtomValue } from 'jotai';
import { buildColumnCacheKey } from '@/app/(app)/[organization]/components/table-browser/utils';
import { columnsAtom, columnsCacheAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { executeActionClient } from '@/lib/actions/client';
import type { TableColumn } from '@/app/(app)/[organization]/components/sql-console-sidebar/types';

const inflightColumnRequests = new Map<string, Promise<TableColumn[]>>();

export function useColumns() {
    const [tableColumns, setTableColumns] = useAtom(columnsAtom);
    const [columnsCache, setColumnsCache] = useAtom(columnsCacheAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);

    const refresh = async (database: string, table: string) => {
        const connectionId = currentConnection?.connection?.id as string | undefined;
        if (!connectionId) {
            return;
        }
        if (!database) {
            console.log('no database provided');
            return;
        }
        if (!table) {
            console.log('no table provided');
            return;
        }

        const cacheKey = buildColumnCacheKey(connectionId, database, table);
        if (!cacheKey) {
            return;
        }

        const cachedColumns = columnsCache[cacheKey]?.columns ?? null;
        if (cachedColumns) {
            setTableColumns(cachedColumns);
            return cachedColumns;
        }

        const existingRequest = inflightColumnRequests.get(cacheKey);
        if (existingRequest) {
            const columns = await existingRequest;
            setTableColumns(columns);
            return columns;
        }

        const request = executeActionClient<{ columns: TableColumn[] }>(
            'schema.describeTable',
            { connectionId, database, table },
            { currentConnectionId: connectionId },
        ).then(res => res.columns || []);

        inflightColumnRequests.set(cacheKey, request);

        try {
            const columns = await request;
            setTableColumns(columns);
            if (cacheKey) {
                setColumnsCache(prev => ({
                    ...prev,
                    [cacheKey]: { columns, updatedAt: Date.now() },
                }));
            }
            return columns;
        } finally {
            inflightColumnRequests.delete(cacheKey);
        }
    };

    return {
        tableColumns,
        refresh,
    };
}
