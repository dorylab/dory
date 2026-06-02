import type { ResponseObject } from '@dory/shared';
import { ConnectionListItem, CreateConnectionPayload } from '@dory/shared/types/connections';
import type {
    LocalFilesCreateRequest,
    LocalFilesDatasetDetailResponse,
    LocalFilesInspectRequest,
    LocalFilesInspectResponse,
    LocalFilesUpdateRequest,
} from '@dory/shared/types/local-files';
import { authFetch } from '@/lib/client/auth-fetch';
import { executeActionClient } from '@/lib/actions/client';
import { translate } from '@dory/i18n/translate';
import { getClientLocale } from '@dory/i18n/client';

async function fetchJsonResponse<T>(input: RequestInfo, init: RequestInit, errorMessage: string): Promise<ResponseObject<T>> {
    const response = await authFetch(input, init);
    const result = await response.json().catch(e => {
        console.error('Failed to parse JSON response', e);
    });

    if (!response.ok) {
        throw new Error((result as ResponseObject<T> | null)?.message || errorMessage);
    }

    if (!result) {
        throw new Error(errorMessage);
    }

    return result as ResponseObject<T>;
}

function translateConnectionsApi(key: string) {
    return translate(getClientLocale(), key);
}

function actionResponse<T>(data: T): ResponseObject<T> {
    return {
        code: 0,
        message: 'success',
        data,
    };
}

export async function addConnection(params: CreateConnectionPayload): Promise<ResponseObject<ConnectionListItem>> {
    return actionResponse(await executeActionClient<ConnectionListItem>('connection.create', { payload: params }));
}

export async function updateConnection(params: CreateConnectionPayload & { id?: string }): Promise<ResponseObject<ConnectionListItem>> {
    const id = params.id ?? params.connection?.id;

    if (!id) {
        throw new Error(translateConnectionsApi('Connections.Api.UpdateRequiresId'));
    }

    return actionResponse(await executeActionClient<ConnectionListItem>('connection.update', { id, patch: params }));
}

export async function getConnections(): Promise<{ data: ConnectionListItem[] }> {
    const res = await executeActionClient<{ connections: ConnectionListItem[] }>('connection.list', {});
    return { data: res.connections ?? [] };
}

export async function deleteConnection(id: string): Promise<ResponseObject<null>> {
    await executeActionClient('connection.delete', { id }, { confirmationToken: 'connection.delete' });
    return actionResponse(null);
}

export async function getConnectionDetail(id: string): Promise<{ data: ConnectionListItem }> {
    const detail = await executeActionClient<ConnectionListItem>('connection.get', { id });
    if (!detail) {
        throw new Error(translateConnectionsApi('Connections.Api.DetailNotFound'));
    }

    return { data: detail };
}

export async function testConnection(params: CreateConnectionPayload & { timeout?: number }): Promise<ResponseObject<unknown>> {
    return actionResponse(await executeActionClient('connection.test', { payload: params }));
}

type ConnectConnectionResult = {
    connectionId?: string;
    identityId?: string | null;
    status?: string;
    lastCheckStatus?: 'ok' | 'error' | 'unknown';
    lastCheckAt?: string | null;
    lastCheckLatencyMs?: number | null;
    lastCheckError?: string | null;
};

export async function connectConnection(params: ConnectionListItem): Promise<ResponseObject<ConnectConnectionResult>> {
    const connectionId = params.connection.id;
    const identityId = (params as ConnectionListItem & { identityId?: string | null }).identityId ?? params.identities.find(identity => identity.isDefault)?.id ?? null;
    return actionResponse(await executeActionClient<ConnectConnectionResult>('connection.connect', { connectionId, identityId }));
}

export async function inspectLocalFiles(params: LocalFilesInspectRequest): Promise<ResponseObject<LocalFilesInspectResponse>> {
    return fetchJsonResponse<LocalFilesInspectResponse>(
        '/api/local-files/inspect',
        {
            method: 'POST',
            body: JSON.stringify(params),
            headers: { 'Content-Type': 'application/json' },
        },
        'Failed to inspect local file',
    );
}

export async function createLocalFiles(params: LocalFilesCreateRequest): Promise<ResponseObject<unknown>> {
    return fetchJsonResponse<unknown>(
        '/api/local-files/create',
        {
            method: 'POST',
            body: JSON.stringify(params),
            headers: { 'Content-Type': 'application/json' },
        },
        'Failed to create Open Files dataset',
    );
}

export async function getLocalFilesDataset(params: { connectionId?: string; datasetId?: string }): Promise<ResponseObject<LocalFilesDatasetDetailResponse>> {
    const searchParams = new URLSearchParams();
    if (params.connectionId) searchParams.set('connectionId', params.connectionId);
    if (params.datasetId) searchParams.set('datasetId', params.datasetId);

    return fetchJsonResponse<LocalFilesDatasetDetailResponse>(
        `/api/local-files?${searchParams.toString()}`,
        {
            method: 'GET',
        },
        'Failed to load Open Files dataset',
    );
}

export async function updateLocalFiles(datasetId: string, params: LocalFilesUpdateRequest): Promise<ResponseObject<unknown>> {
    return fetchJsonResponse<unknown>(
        `/api/local-files?datasetId=${encodeURIComponent(datasetId)}`,
        {
            method: 'PATCH',
            body: JSON.stringify(params),
            headers: { 'Content-Type': 'application/json' },
        },
        'Failed to update Open Files dataset',
    );
}
