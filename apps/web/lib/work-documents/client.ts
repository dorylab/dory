import { authFetch } from '@/lib/client/auth-fetch';
export async function workRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await authFetch(url, {
        ...(body === undefined ? {} : { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? data.message ?? 'Request failed.');
    return data as T;
}
