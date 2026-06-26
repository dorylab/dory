export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export type ApiResult<T> = {
    code: 0 | string | number;
    message?: string;
    data?: T;
    details?: unknown;
};

export class DoryMcpApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'DoryMcpApiError';
    }
}

export async function postJson<T>(url: string, body: unknown, fetchFn: FetchLike = fetch): Promise<T> {
    const response = await fetchFn(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json',
        },
        body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as ApiResult<T> | null;

    if (!response.ok || payload?.code !== 0) {
        throw new DoryMcpApiError(payload?.message ?? `Request failed with status ${response.status}`, response.status, payload?.details);
    }

    return payload.data as T;
}
