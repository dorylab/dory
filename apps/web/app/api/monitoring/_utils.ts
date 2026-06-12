import { NextResponse } from 'next/server';
import z from 'zod';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';
import type { PaginationState, QueryInsightsFilters } from '@dory/shared/types/monitoring';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

const DEFAULT_MONITORING_PAGE_SIZE = 10;
const MAX_MONITORING_PAGE_SIZE = 200;

export const QueryInsightsFiltersSchema: z.ZodType<QueryInsightsFilters> = z.object({
    search: z.string().default(''),
    user: z.union([z.literal('all'), z.string().min(1)]).default('all'),
    database: z.union([z.literal('all'), z.string().min(1)]).default('all'),
    queryType: z.union([z.literal('all'), z.literal('select'), z.literal('insert'), z.literal('ddl'), z.literal('other')]).default('all'),
    minDurationMs: z.coerce.number().min(0).default(0),
    timeRange: z.union([z.literal('1h'), z.literal('6h'), z.literal('24h'), z.literal('7d')]).default('1h'),
});

export function parsePaginationFromPayload(payload: unknown): PaginationState {
    const source = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
    const rawPageIndex = Number(source.pageIndex);
    const rawPageSize = Number(source.pageSize);
    const pageIndex = Number.isFinite(rawPageIndex) && rawPageIndex > 0 ? Math.floor(rawPageIndex) : 0;
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(Math.floor(rawPageSize), MAX_MONITORING_PAGE_SIZE) : DEFAULT_MONITORING_PAGE_SIZE;

    return {
        pageIndex,
        pageSize,
    };
}

export async function parseFiltersFromPayload(payload: unknown): Promise<{ filters: QueryInsightsFilters } | { response: NextResponse }> {
    const locale = await getApiLocale();
    const filtersInput = (typeof payload === 'object' && payload !== null && 'filters' in payload ? (payload as Record<string, unknown>).filters : payload) ?? {};
    const parsed = await QueryInsightsFiltersSchema.safeParseAsync(filtersInput);

    if (!parsed.success) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: await translateApi('Api.Errors.InvalidParams', undefined, locale),
                    error: parsed.error,
                }),
                { status: 400 },
            ),
        };
    }

    return { filters: parsed.data };
}
