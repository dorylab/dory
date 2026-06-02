import { useAtom, useAtomValue } from 'jotai';
import { buildColumnCacheKey } from '@/app/(app)/[organization]/components/table-browser/utils';
import { columnsAtom, columnsCacheAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { executeActionClient } from '@/lib/actions/client';
import type { TableColumn } from '@/app/(app)/[organization]/components/sql-console-sidebar/types';

export function useColumns() {
    const [tableColumns, setTableColumns] = useAtom(columnsAtom);
    const [columnsCache, setColumnsCache] = useAtom(columnsCacheAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);

    const refresh = async (database: string, table: string) => {
        const connectionId = currentConnection?.connection.id as string | undefined;
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
        const cachedColumns = cacheKey ? columnsCache[cacheKey]?.columns ?? null : null;
        if (cachedColumns) {
            setTableColumns(cachedColumns);
            return cachedColumns;
        }

        const res = await executeActionClient<{ columns: TableColumn[] }>('schema.describeTable', { connectionId, database, table }, { currentConnectionId: connectionId });
        const columns = res.columns || [];
        setTableColumns(columns);
        if (cacheKey) {
            setColumnsCache(prev => ({
                ...prev,
                [cacheKey]: { columns, updatedAt: Date.now() },
            }));
        }
        return columns;
    };

    return {
        tableColumns,
        refresh,
    };
}
