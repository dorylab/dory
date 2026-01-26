import { useAtom, useAtomValue } from 'jotai';
import { buildColumnCacheKey } from '@/app/(app)/[team]/components/table-browser/utils';
import { columnsAtom, columnsCacheAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';

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

        const encodedDb = encodeURIComponent(database);
        const encodedTable = encodeURIComponent(table);

        const response = await authFetch(`/api/connection/${connectionId}/databases/${encodedDb}/tables/${encodedTable}/columns`, {
            method: 'GET',
            headers: {
                'X-Connection-ID': connectionId,
            },
        });

        const res = (await response.json()) as ResponseObject<TableColumn[]>;

        if (isSuccess(res)) {
            const columns = res.data || [];
            setTableColumns(columns);
            if (cacheKey) {
                setColumnsCache(prev => ({
                    ...prev,
                    [cacheKey]: { columns, updatedAt: Date.now() },
                }));
            }
            return columns;
        }
        return [];
    };

    return {
        tableColumns,
        refresh,
    };
}
