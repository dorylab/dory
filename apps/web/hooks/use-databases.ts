import { useAtom, useAtomValue } from 'jotai';
import { currentConnectionAtom, databasesAtom } from '@/shared/stores/app.store';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';

export function useDatabases() {
    const [databases, setDatabases] = useAtom(databasesAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const params = useParams<{ connectionId?: string | string[]; connection?: string | string[] }>();
    const routeConnectionParam = params?.connectionId ?? params?.connection;
    const routeConnectionId = Array.isArray(routeConnectionParam) ? routeConnectionParam[0] : routeConnectionParam;

    useEffect(() => {
        if (!routeConnectionId) return;
        refresh();
    }, [routeConnectionId]);

    const refresh = async () => {
        if (!routeConnectionId) return;
        const connectionId = routeConnectionId ?? currentConnection?.connection.id;
        if (!connectionId) {
            return;
        }
        const response = await authFetch(`/api/connection/${connectionId}/databases`, {
            method: 'GET',
            headers: {
                'X-Connection-ID': connectionId,
            },
        });
        const res = (await response.json()) as ResponseObject<any>;
        if (isSuccess(res)) {
            setDatabases(res.data);
        }
    };

    return {
        databases: databases,
        refresh,
    };
}
