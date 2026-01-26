import { useAtom, useAtomValue } from 'jotai';
import { useEffect } from 'react';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom, tablesAtom } from '@/shared/stores/app.store';

export function useTables(databases: string) {
    const [tables, setTables] = useAtom(tablesAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);

    useEffect(() => {
        if (!databases) {
            console.log('no database selected');
            return;
        }
        refresh();
    }, [currentConnection?.connection.id, databases]);

    const refresh = async () => {
        const connectionId = currentConnection?.connection.id as string | undefined;
        if (!connectionId) {
            return;
        }
        const encodedDb = encodeURIComponent(databases);
        const response = await authFetch(`/api/connection/${connectionId}/databases/${encodedDb}/tables`, {
            method: 'GET',
            headers: {
                'X-Connection-ID': connectionId,
            },
        });
        const res = (await response.json()) as ResponseObject<any>;
        if (isSuccess(res)) {
            setTables(res.data);
        }
    };

    return {
        tables: tables,
        refresh,
    };
}
