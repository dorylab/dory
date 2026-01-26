import { isSuccess } from '@/lib/result';
import type { ResponseObject } from '@/types';
import { ConnectionListItem, CreateConnectionPayload } from '@/types/connections';
import { authFetch } from '@/lib/client/auth-fetch';
import { translate } from '@/lib/i18n/i18n';
import { getClientLocale } from '@/lib/i18n/client-locale';

async function fetchJsonResponse<T>(
    input: RequestInfo,
    init: RequestInit,
    errorMessage: string,
): Promise<ResponseObject<T>> {
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


export async function addConnection(params: CreateConnectionPayload): Promise<ResponseObject<ConnectionListItem>> {
    console.log('addConnection params:', params);
    const res = await fetchJsonResponse<ConnectionListItem>(
        '/api/connection',
        {
            method: 'POST',
            body: JSON.stringify(params),
            headers: { 'Content-Type': 'application/json' },
        },
        translateConnectionsApi('Connections.Api.AddFailed'),
    );

    return res;
}


export async function updateConnection(
    params: CreateConnectionPayload & { id?: string },
): Promise<ResponseObject<ConnectionListItem>> {
    const id = params.id ?? params.connection?.id;

    if (!id) {
        throw new Error(translateConnectionsApi('Connections.Api.UpdateRequiresId'));
    }

    const res = await fetchJsonResponse<ConnectionListItem>(
        `/api/connection?id=${encodeURIComponent(id)}`,
        {
            method: 'PATCH',
            body: JSON.stringify(params),
            headers: { 'Content-Type': 'application/json' },
        },
        translateConnectionsApi('Connections.Api.UpdateFailed'),
    );

    return res;
}


export async function getConnections(): Promise<{ data: ConnectionListItem[] }> {
    const res = await fetchJsonResponse<ConnectionListItem[]>(
        '/api/connection',
        { method: 'GET' },
        translateConnectionsApi('Connections.Api.ListFailed'),
    );

    if (!isSuccess(res)) {
        throw new Error(res.message || translateConnectionsApi('Connections.Api.ListFailed'));
    }

    return { data: res.data ?? [] };
}


export async function deleteConnection(id: string): Promise<ResponseObject<null>> {
    const res = await fetchJsonResponse<null>(
        `/api/connection?id=${encodeURIComponent(id)}`,
        {
            method: 'DELETE',
        },
        translateConnectionsApi('Connections.Api.DeleteFailed'),
    );

    if (!isSuccess(res)) {
        throw new Error(res.message || translateConnectionsApi('Connections.Api.DeleteFailed'));
    }

    return res;
}


export async function getConnectionDetail(id: string): Promise<{ data: ConnectionListItem }> {
    const res = await fetchJsonResponse<ConnectionListItem>(
        `/api/connection?id=${encodeURIComponent(id)}`,
        { method: 'GET' },
        translateConnectionsApi('Connections.Api.DetailFailed'),
    );

    if (!isSuccess(res)) {
        throw new Error(res.message || translateConnectionsApi('Connections.Api.DetailFailed'));
    }

    const detail = res.data;
    if (!detail) {
        throw new Error(translateConnectionsApi('Connections.Api.DetailNotFound'));
    }

    return { data: detail };
}


export async function testConnection(
    params: CreateConnectionPayload & { timeout?: number },
): Promise<ResponseObject<unknown>> {
    const res = await fetchJsonResponse<unknown>(
        '/api/connection/test',
        {
            method: 'POST',
            body: JSON.stringify(params),
            headers: { 'Content-Type': 'application/json' },
        },
        translateConnectionsApi('Connections.Api.TestFailed'),
    );

    return res;
}


export async function connectConnection(params: ConnectionListItem): Promise<ResponseObject<unknown>> {
    const res = await fetchJsonResponse<unknown>(
        '/api/connection/connect',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        },
        translateConnectionsApi('Connections.Api.ConnectFailed'),
    );

    if (!isSuccess(res)) {
        throw new Error(res.message || translateConnectionsApi('Connections.Api.ConnectFailed'));
    }

    return res;
}
