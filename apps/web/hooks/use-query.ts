import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';
import { isSuccess } from '@/lib/result';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
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
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (currentConnection?.connection.id) {
                    headers['X-Connection-ID'] = currentConnection.connection.id;
                }

                const response = await authFetch(`/api/query`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: options?.signal,
                });
                const res = (await response.json()) as ResponseObject<any>;
                console.log('query end');
                console.log(res);
                if (isSuccess(res)) {
                    setResult(res);
                } else {
                    toast.error(res.message || 'Request Failed');
                }
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
