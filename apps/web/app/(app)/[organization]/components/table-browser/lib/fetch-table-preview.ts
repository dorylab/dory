import { authFetch } from '@/lib/client/auth-fetch';
import type { ResponseObject } from '@/types';

type FetchTablePreviewParams = {
    connectionId: string;
    databaseName: string;
    tableName: string;
    limit?: number;
    sessionId?: string;
    tabId?: string;
    source?: string;
    signal?: AbortSignal;
};

export async function fetchTablePreview({
    connectionId,
    databaseName,
    tableName,
    limit,
    sessionId,
    tabId,
    source,
    signal,
}: FetchTablePreviewParams) {
    const encodedDb = encodeURIComponent(databaseName);
    const encodedTable = encodeURIComponent(tableName);
    const response = await authFetch(`/api/connection/${connectionId}/databases/${encodedDb}/tables/${encodedTable}/preview`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Connection-ID': connectionId,
        },
        body: JSON.stringify({
            limit,
            sessionId,
            tabId,
            source,
        }),
        signal,
    });

    return (await response.json()) as ResponseObject<any>;
}
