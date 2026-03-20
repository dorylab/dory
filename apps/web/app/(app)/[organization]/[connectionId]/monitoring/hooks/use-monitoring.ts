'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { QueryInsightsFilters, QueryInsightsSummary, QueryTimelinePoint, QueryInsightsRow } from '@/types/monitoring';
import { fetchQueryInsightsSummary, fetchQueryInsightsTimeline, fetchQueryInsightsRecentQueries, QueryListPagination, fetchQueryInsightsRows, fetchQueryInsightsSlowQueries, fetchQueryInsightsErrorQueries } from '../api';
import { useTranslations } from 'next-intl';

interface SectionResult<T> {
    data: T;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useQueryInsightsSummary(filters: QueryInsightsFilters): SectionResult<QueryInsightsSummary | null> {
    const t = useTranslations('Monitoring');
    const query = useQuery<QueryInsightsSummary | null, Error>({
        queryKey: ['monitoring', 'summary', filters],
        refetchOnWindowFocus: false,
        queryFn: ({ signal }) => {
            
            return fetchQueryInsightsSummary(filters, { errorMessage: t('Errors.RequestFailed') });
        },
        staleTime: 0,
        gcTime: 5 * 60_000,
    });

    return {
        data: query.data ?? null,
        loading: query.isFetching,
        error: query.error ? query.error.message : null,
        refresh: () => void query.refetch(),
    };
}

export function useQueryInsightsTimeline(filters: QueryInsightsFilters): SectionResult<QueryTimelinePoint[]> {
    const t = useTranslations('Monitoring');
    const query = useQuery<QueryTimelinePoint[], Error>({
        queryKey: ['monitoring', 'timeline', filters],
        refetchOnWindowFocus: false,
        queryFn: () => fetchQueryInsightsTimeline(filters, { errorMessage: t('Errors.RequestFailed') }),
        staleTime: 0,
        gcTime: 5 * 60_000,
    });

    return {
        data: query.data ?? [],
        loading: query.isFetching,
        error: query.error ? query.error.message : null,
        refresh: () => void query.refetch(),
    };
}

export function useQueryInsightsRecentQueries(filters: QueryInsightsFilters, limit = 8): SectionResult<QueryInsightsRow[]> {
    const t = useTranslations('Monitoring');
    const query = useQuery<QueryInsightsRow[], Error>({
        queryKey: ['monitoring', 'recent-queries', filters, limit],
        refetchOnWindowFocus: false,
        queryFn: () => fetchQueryInsightsRecentQueries(filters, limit, { errorMessage: t('Errors.RequestFailed') }),
        staleTime: 0,
        gcTime: 5 * 60_000,
    });

    return {
        data: query.data ?? [],
        loading: query.isFetching,
        error: query.error ? query.error.message : null,
        refresh: () => void query.refetch(),
    };
}

export function useQueryInsightsRowsHook(filters: QueryInsightsFilters, pagination: QueryListPagination) {
    const t = useTranslations('Monitoring');
    const query = useQuery({
        queryKey: ['monitoring', 'rows', filters, pagination.pageIndex, pagination.pageSize],
        queryFn: () => fetchQueryInsightsRows(filters, pagination, { errorMessage: t('Errors.RequestFailed') }),
        placeholderData: keepPreviousData,
    });

    return {
        rows: query.data?.rows ?? [],
        total: query.data?.total ?? 0,
        loading: query.isFetching,
        error: query.error?.message ?? null,
    };
}

export function useQueryInsightsSlowQueriesHook(filters: QueryInsightsFilters, pagination: QueryListPagination) {
    const t = useTranslations('Monitoring');
    const query = useQuery({
        queryKey: ['monitoring', 'slow-queries', filters, pagination.pageIndex, pagination.pageSize],
        queryFn: () => fetchQueryInsightsSlowQueries(filters, pagination, { errorMessage: t('Errors.RequestFailed') }),
        placeholderData: keepPreviousData,
    });

    return {
        rows: query.data?.rows ?? [],
        total: query.data?.total ?? 0,
        loading: query.isFetching,
        error: query.error?.message ?? null,
    };
}

export function useQueryInsightsErrorQueriesHook(filters: QueryInsightsFilters, pagination: QueryListPagination) {
    const t = useTranslations('Monitoring');
    const query = useQuery({
        queryKey: ['monitoring', 'error-queries', filters, pagination.pageIndex, pagination.pageSize],
        queryFn: () => fetchQueryInsightsErrorQueries(filters, pagination, { errorMessage: t('Errors.RequestFailed') }),
        placeholderData: keepPreviousData,
    });

    return {
        rows: query.data?.rows ?? [],
        total: query.data?.total ?? 0,
        loading: query.isFetching,
        error: query.error?.message ?? null,
    };
}
