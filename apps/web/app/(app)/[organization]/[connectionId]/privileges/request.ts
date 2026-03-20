import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import type { ResponseObject } from '@/types';
import type {
    ClickHouseRole,
    ClickHouseUser,
    CreateRolePayload,
    CreateUserPayload,
    UpdateRolePayload,
    UpdateUserPayload,
} from '@/types/privileges';

type RequestOptions = {
    connectionId?: string;
    errorMessage?: string;
};

function getConnectionId(options?: RequestOptions) {
    if (options?.connectionId) {
        return options.connectionId;
    }

    const resolvedConnectionId = (() => {
        try {
            const stored = JSON.parse(localStorage.getItem('currentConnection') || '{}');
            return stored?.connection?.id ?? null;
        } catch (error) {
            console.warn('Failed to parse currentConnection from localStorage', error);
            return null;
        }
    })();

    if (!resolvedConnectionId) {
        throw new Error(options?.errorMessage ?? 'Invalid connection');
    }

    return resolvedConnectionId;
}

function createConnectionHeaders(options?: {
    connectionId?: string;
    errorMessage?: string;
    withContentType?: boolean;
}) {
    const connectionId = getConnectionId(options);

    const headers = new Headers();
    headers.set('X-Connection-ID', connectionId);

    if (options?.withContentType) {
        headers.set('Content-Type', 'application/json');
    }

    return headers;
}

export async function fetchClickHouseUsers(options?: RequestOptions) {
    const headers = createConnectionHeaders({ errorMessage: options?.errorMessage });

    const response = await authFetch('/api/privileges/users', { method: 'GET', headers });
    const payload = (await response.json()) as ResponseObject<ClickHouseUser[]>;
    if (!isSuccess(payload)) {
        throw new Error(payload.message ?? options?.errorMessage ?? 'Request failed');
    }
    return payload.data ?? [];
}

export async function fetchClickHouseRoles(options?: RequestOptions) {
    const headers = createConnectionHeaders({ errorMessage: options?.errorMessage });

    const response = await authFetch('/api/privileges/roles', { method: 'GET', headers });
    const payload = (await response.json()) as ResponseObject<ClickHouseRole[]>;
    if (!isSuccess(payload)) {
        throw new Error(payload.message ?? options?.errorMessage ?? 'Request failed');
    }
    return payload.data ?? [];
}

export async function fetchClickHouseClusters(options?: RequestOptions) {
    const headers = createConnectionHeaders({ errorMessage: options?.errorMessage });

    const response = await authFetch('/api/privileges/clusters', { method: 'GET', headers });
    const payload = (await response.json()) as ResponseObject<string[]>;
    if (!isSuccess(payload)) {
        throw new Error(payload.message ?? options?.errorMessage ?? 'Request failed');
    }
    return payload.data ?? [];
}

export async function fetchClickHouseUser(name: string, options?: RequestOptions) {
    const headers = createConnectionHeaders({ errorMessage: options?.errorMessage });

    const response = await authFetch(`/api/privileges/users/${encodeURIComponent(name)}`, {
        method: 'GET',
        headers,
    });
    const payload = (await response.json()) as ResponseObject<ClickHouseUser>;
    if (!isSuccess(payload)) {
        throw new Error(payload.message ?? options?.errorMessage ?? 'Request failed');
    }
    return payload.data!;
}

export async function fetchClickHouseRole(name: string, options?: RequestOptions) {
    const headers = createConnectionHeaders({ errorMessage: options?.errorMessage });

    const response = await authFetch(`/api/privileges/roles/${encodeURIComponent(name)}`, {
        method: 'GET',
        headers,
    });
    const payload = (await response.json()) as ResponseObject<ClickHouseRole>;
    if (!isSuccess(payload)) {
        throw new Error(payload.message ?? options?.errorMessage ?? 'Request failed');
    }
    return payload.data!;
}

export async function createClickHouseUserApi(payload: CreateUserPayload, options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to create user';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch('/api/privileges/users', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function updateClickHouseUserApi(name: string, payload: UpdateUserPayload, options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to update user';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch(`/api/privileges/users/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function deleteClickHouseUserApi(name: string, options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to delete user';
    const headers = createConnectionHeaders({ errorMessage });

    const response = await authFetch(`/api/privileges/users/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers,
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function grantUserGlobalPrivilegesApi(name: string, privileges: string[], options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to add global privileges';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch(`/api/privileges/users/${encodeURIComponent(name)}/global`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ privileges }),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function revokeUserGlobalPrivilegesApi(name: string, privileges: string[], options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to revoke global privileges';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch(`/api/privileges/users/${encodeURIComponent(name)}/global`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ privileges }),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export type ScopedPrivilegePayload = {
    scope: 'database' | 'table' | 'view';
    database: string;
    object?: string | null;
    privileges: string[];
    grantOption?: boolean;
};

export async function grantUserScopedPrivilegesApi(name: string, payload: ScopedPrivilegePayload, options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to grant privileges';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch(`/api/privileges/users/${encodeURIComponent(name)}/scoped`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function revokeUserScopedPrivilegesApi(name: string, payload: ScopedPrivilegePayload, options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to revoke privileges';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch(`/api/privileges/users/${encodeURIComponent(name)}/scoped`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function grantRoleGlobalPrivilegesApi(name: string, privileges: string[], options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to add global privileges';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch(`/api/privileges/roles/${encodeURIComponent(name)}/global`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ privileges }),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function revokeRoleGlobalPrivilegesApi(name: string, privileges: string[], options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to revoke global privileges';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch(`/api/privileges/roles/${encodeURIComponent(name)}/global`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ privileges }),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function grantRoleScopedPrivilegesApi(name: string, payload: ScopedPrivilegePayload, options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to grant privileges';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch(`/api/privileges/roles/${encodeURIComponent(name)}/scoped`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function revokeRoleScopedPrivilegesApi(name: string, payload: ScopedPrivilegePayload, options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to revoke privileges';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch(`/api/privileges/roles/${encodeURIComponent(name)}/scoped`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function fetchPrivilegeTargets(type: 'database' | 'table' | 'view', params?: { database?: string }, options?: RequestOptions) {
    const search = new URLSearchParams({ type });
    if (params?.database) {
        search.set('database', params.database);
    }
    const errorMessage = options?.errorMessage ?? 'Failed to fetch targets';
    const headers = createConnectionHeaders({ errorMessage });

    const response = await authFetch(`/api/privileges/targets?${search.toString()}`, {
        method: 'GET',
        headers,
    });
    const payload = (await response.json()) as ResponseObject<{ label: string; value: string }[]>;
    if (!isSuccess(payload)) {
        throw new Error(payload.message ?? errorMessage);
    }
    return payload.data ?? [];
}

export async function createClickHouseRoleApi(payload: CreateRolePayload, options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to create role';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch('/api/privileges/roles', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function updateClickHouseRoleApi(name: string, payload: UpdateRolePayload, options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to update role';
    const headers = createConnectionHeaders({ errorMessage, withContentType: true });

    const response = await authFetch(`/api/privileges/roles/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}

export async function deleteClickHouseRoleApi(name: string, options?: RequestOptions) {
    const errorMessage = options?.errorMessage ?? 'Failed to delete role';
    const headers = createConnectionHeaders({ errorMessage });

    const response = await authFetch(`/api/privileges/roles/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers,
    });
    const responsePayload = (await response.json()) as ResponseObject<unknown>;
    if (!isSuccess(responsePayload)) {
        throw new Error(responsePayload.message ?? errorMessage);
    }
    return responsePayload;
}
