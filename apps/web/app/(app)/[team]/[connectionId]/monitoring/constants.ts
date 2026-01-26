import { PaginationState, QueryInsightsFilters, TimeRange } from '@/types/monitoring';

export const DEFAULT_FILTERS: QueryInsightsFilters = {
  user: 'all',
  database: 'all',
  queryType: 'all',
  timeRange: '1h',
  minDurationMs: 0,
  thresholdMode: 'dynamic',
};

export const TIME_RANGE_BUCKET_MS: Record<TimeRange, number> = {
    '1h': 60 * 1000, // 1 min
    '6h': 10 * 60 * 1000, // 10 min
    '24h': 30 * 60 * 1000, // 30 min
    '7d': 6 * 60 * 60 * 1000, // 6 h
};

export const DEFAULT_PAGINATION: PaginationState = {
    pageIndex: 0,
    pageSize: 50,
};


export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];
