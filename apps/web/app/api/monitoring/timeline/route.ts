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

    const payload = await req.json().catch(() => ({}));
    const filtersResult = await parseFiltersFromPayload(payload);
    if ('response' in filtersResult) {
        return filtersResult.response;
    }

    try {
        if (!insights) {
            throw new Error(t('Api.Monitoring.Errors.QueryFailed'));
        }
        const timeline = await insights.timeline(filtersResult.filters);
        return NextResponse.json(ResponseUtil.success(timeline || []));
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
