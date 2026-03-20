import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { parseFiltersFromPayload } from '../_utils';
import { ensureConnection } from '@/lib/utils/ensure-connection';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export const POST = withUserAndOrganizationHandler(async ({ req, organizationId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const connection = await ensureConnection(req, { organizationId });
    if ('response' in connection) {
        return connection.response;
    }
    const insights = connection.capabilities.queryInsights;

    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const filtersResult = await parseFiltersFromPayload(payload);
    if ('response' in filtersResult) {
        return filtersResult.response;
    }

    const rawLimit = payload?.limit;
    const normalizedLimit = Number(rawLimit);
    const limit = Number.isFinite(normalizedLimit) ? Math.max(1, Math.floor(normalizedLimit)) : undefined;

    try {
        if (!insights) {
            throw new Error(t('Api.Monitoring.Errors.QueryFailed'));
        }
        const rows = await insights.recentQueries(filtersResult.filters, { limit });
        return NextResponse.json(
            ResponseUtil.success({
                rows,
            }),
        );
    } catch (error: any) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.DATABASE_ERROR,
                message: error?.message ?? t('Api.Monitoring.Errors.QueryFailed'),
                error,
            }),
            { status: 500 },
        );
    }
});
