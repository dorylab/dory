// features/monitoring/api.ts
import type { QueryInsightsFilters, QueryInsightsSummary, QueryTimelinePoint, QueryInsightsRow } from '@/types/monitoring';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';

async function postWithAuth<T>(path: string, body: Record<string, unknown>, options?: { errorMessage?: string }) {
    let connectionId: string | null = null;
    try {
        const stored = JSON.parse(localStorage.getItem('currentConnection') || '{}');
        connectionId = stored?.connection?.id ?? null;
    } catch (error) {
        console.warn('Failed to parse currentConnection from localStorage', error);
    }

    if (!connectionId) {
        throw new Error('Invalid connection');
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    headers['X-Connection-ID'] = connectionId;

    const response = await authFetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    const payload = (await response.json()) as ResponseObject<T>;

    if (!isSuccess(payload)) {
        throw new Error(payload.message || options?.errorMessage || 'Request failed');
    }

    return payload;
}

export async function fetchQueryInsightsSummary(filters: QueryInsightsFilters, options?: { errorMessage?: string }): Promise<QueryInsightsSummary | null> {
    const res = await postWithAuth<Record<string, unknown>>('/api/monitoring/summary', { filters }, options);

    const payload = (res.data ?? {}) as Record<string, unknown>;
    return (payload as unknown as QueryInsightsSummary | null) ?? null;
}

export async function fetchQueryInsightsTimeline(filters: QueryInsightsFilters, options?: { errorMessage?: string }): Promise<QueryTimelinePoint[]> {
    const res = await postWithAuth<Record<string, unknown>>('/api/monitoring/timeline', { filters }, options);

    const payload = (res.data ?? {}) as Record<string, unknown>;
    return (payload as unknown as QueryTimelinePoint[]) ?? [];
}

export async function fetchQueryInsightsRecentQueries(filters: QueryInsightsFilters, limit: number, options?: { errorMessage?: string }): Promise<QueryInsightsRow[]> {
    const res = await postWithAuth('/api/monitoring/recent-queries', { filters, limit }, options);

    const payload = (res.data ?? {}) as { rows?: QueryInsightsRow[] };
    return payload.rows ?? [];
}

export type QueryListPagination = {
    pageIndex: number;
    pageSize: number;
};

export async function fetchQueryInsightsRows(filters: QueryInsightsFilters, pagination: QueryListPagination, options?: { errorMessage?: string }) {
    const res = await postWithAuth('/api/monitoring/query-logs', { filters, ...pagination }, options);

    if (!isSuccess(res)) throw new Error(res.message || options?.errorMessage || 'Request failed');

    return res.data as { rows: QueryInsightsRow[]; total: number };
}

export async function fetchQueryInsightsSlowQueries(filters: QueryInsightsFilters, pagination: QueryListPagination, options?: { errorMessage?: string }) {
    const res = await postWithAuth('/api/monitoring/slow-queries', { filters, ...pagination }, options);

    if (!isSuccess(res)) throw new Error(res.message || options?.errorMessage || 'Request failed');

    return res.data as { rows: QueryInsightsRow[]; total: number };
}

export async function fetchQueryInsightsErrorQueries(filters: QueryInsightsFilters, pagination: QueryListPagination, options?: { errorMessage?: string }) {
    const res = await postWithAuth('/api/monitoring/error-queries', { filters, ...pagination }, options);

    if (!isSuccess(res)) throw new Error(res.message || options?.errorMessage || 'Request failed');

    return res.data as { rows: QueryInsightsRow[]; total: number };
}
