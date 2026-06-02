import type { ResponseObject } from '@dory/shared';
import { executeActionClient } from '@/lib/actions/client';

type FetchTablePreviewParams = {
    connectionId: string;
    databaseName: string;
    tableName: string;
    limit?: number;
    offset?: number;
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
    offset,
    sessionId,
    tabId,
    source,
    signal,
}: FetchTablePreviewParams) {
    const data = await executeActionClient(
        'table.preview',
        {
            connectionId,
            database: databaseName,
            table: tableName,
            limit,
            offset,
            sessionId,
            tabId,
            source,
        },
        { currentConnectionId: connectionId, signal },
    );

    return {
        code: 0,
        message: 'success',
        data,
    } as ResponseObject<any>;
}
