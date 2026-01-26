import { getAuthToken } from './auth-token';

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const headers = new Headers(init.headers ?? {});
    const token = await getAuthToken();
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers });
}
