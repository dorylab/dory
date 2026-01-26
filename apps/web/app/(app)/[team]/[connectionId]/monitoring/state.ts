'use client';

import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { PaginationState, QueryInsightsFilters, QueryListKey } from '@/types/monitoring';
import { DEFAULT_FILTERS, DEFAULT_PAGINATION } from './constants';

const queryInsightsFiltersAtom = atom<QueryInsightsFilters>(DEFAULT_FILTERS);
export const queryInsightsLoadingAtom = atom(false);
export function useQueryInsightsLoadingValue() {
    return useAtomValue(queryInsightsLoadingAtom);
}

export function useSetQueryInsightsLoading() {
    return useSetAtom(queryInsightsLoadingAtom);
}

export function useQueryInsightsFilters() {
    return useAtom(queryInsightsFiltersAtom);
}

export function useQueryInsightsFiltersValue() {
    return useAtomValue(queryInsightsFiltersAtom);
}

export function useResetQueryInsightsFilters() {
    const set = useSetAtom(queryInsightsFiltersAtom);
    return () => set(DEFAULT_FILTERS);
}

export const queryInsightsPaginationAtom = atom<Record<QueryListKey, PaginationState>>({
    logs: DEFAULT_PAGINATION,
    slow: DEFAULT_PAGINATION,
    errors: DEFAULT_PAGINATION,
});
