import type { ResponseObject } from '@dory/shared';
import type { TablePreviewFilter, TablePreviewSort } from '@dory/drivers/types';
import { executeActionClient } from '@/lib/actions/client';

type FetchTablePreviewParams = {
    connectionId: string;
    databaseName: string;
    tableName: string;
    limit?: number;
    offset?: number;
    countMode?: 'none' | 'exact';
    sort?: TablePreviewSort | null;
    filters?: TablePreviewFilter[];
    search?: string | null;
    searchColumns?: string[];
    sessionId?: string;
    tabId?: string;
    source?: string;
    signal?: AbortSignal;
};

type TablePreviewPayload = {
    queryResultSets?: unknown[];
    results?: unknown[];
};

export async function fetchTablePreview({
    connectionId,
    databaseName,
    tableName,
    limit,
    offset,
    countMode,
    sort,
    filters,
    search,
    searchColumns,
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
            countMode,
            sort,
            filters,
            search,
            searchColumns,
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
    } as ResponseObject<TablePreviewPayload>;
}
