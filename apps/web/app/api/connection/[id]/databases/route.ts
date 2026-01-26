/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { headers } from 'next/headers';
import { ensureConnectionPoolForUser, mapConnectionErrorToResponse } from '../../utils';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    return withUserAndTeamHandler(async ({ userId, teamId }) => {
        const locale = await getApiLocale();
        const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
        const errorMessages = {
            fallback: t('Api.Connection.Databases.Errors.ListFailed'),
            notFound: t('Api.Connection.Errors.NotFound'),
            missingHost: t('Api.Connection.Errors.MissingHost'),
        };
        const datasourceId = (await headers()).get('x-connection-id') || (await context?.params)?.id;

        if (!datasourceId) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingConnectionId') }),
                { status: 400 },
            );
        }

        try {
            const { entry } = await ensureConnectionPoolForUser(userId, teamId, datasourceId, null);

            const databases = await entry.instance.getDatabases();
            const payload = databases;
            return NextResponse.json(ResponseUtil.success(payload));
        } catch (error) {
            console.log('Error fetching databases:', error);
            return mapConnectionErrorToResponse(error, {
                notFound: errorMessages.notFound,
                missingHost: errorMessages.missingHost,
                fallback: errorMessages.fallback,
            });
        }
    })(_req);
}
