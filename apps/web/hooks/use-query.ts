import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';
import { executeActionClient } from '@/lib/actions/client';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { toast } from 'sonner';

export function useQuery() {
    const [result, setResult] = useState<any>({
        data: [],
        meta: {
            sql: '',
            refId: '',
        },
    });
    const currentConnection = useAtomValue(currentConnectionAtom);

    const run = useCallback(
        async (payload: any, options?: { signal?: AbortSignal }) => {
            console.log('useQuery run', payload);
            if (!currentConnection?.connection.id) {
                toast.error('No active connection');
                return;
            }
            try {
                console.log('query start');
                const data = await executeActionClient('query.execute', {
                    ...payload,
                    connectionId: currentConnection.connection.id,
                }, { signal: options?.signal, currentConnectionId: currentConnection.connection.id });
                const res = { code: 0, message: 'success', data };
                console.log('query end');
                console.log(res);
                setResult(res);
                return { ...res, sql: payload.sql };
            } catch (e: any) {
                console.log(e);
                if (e?.name === 'AbortError') {
                    throw e;
                }
                toast.error(e?.message || 'Request Failed');
                throw e;
            }
        },
        [currentConnection?.connection.id],
    );

    return {
        run,
        result,
    };
}
