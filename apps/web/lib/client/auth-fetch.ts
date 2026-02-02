import { getAuthToken } from './auth-token';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';

function getStoredConnectionId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem('currentConnection');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.connection?.id ?? null;
    } catch {
        return null;
    }
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const headers = new Headers(init.headers ?? {});
    const token = await getAuthToken();
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    const storedConnectionId = getStoredConnectionId();
    if (storedConnectionId && !headers.has(X_CONNECTION_ID_KEY)) {
        headers.set(X_CONNECTION_ID_KEY, storedConnectionId);
    }
    return fetch(input, { ...init, headers });
}
