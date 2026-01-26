/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { ensureConnectionPoolForUser, mapConnectionErrorToResponse } from '@/app/api/connection/utils';
import { ClickhouseDatasource } from '@/lib/connection/drivers/clickhouse/ClickhouseDatasource';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

export async function GET(req: NextRequest, context: { params: Promise<{ database: string }> }) {
    return withUserAndTeamHandler(async ({ userId, teamId }) => {
        const locale = await getApiLocale();
        const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
        const errorMessages = {
            fallback: t('Api.Connection.Databases.Errors.TablesFailed'),
            notFound: t('Api.Connection.Errors.NotFound'),
            missingHost: t('Api.Connection.Errors.MissingHost'),
            missingDatabase: t('Api.Connection.Validation.DatabaseRequired'),
        };
        const headerId = req.headers.get('x-connection-id');
        const datasourceId = headerId;
        const databaseParam = (await context?.params)?.database;

        if (!datasourceId) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingConnectionId') }),
                { status: 400 },
            );
        }

        if (!databaseParam) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: errorMessages.missingDatabase }),
                { status: 400 },
            );
        }

        let database = databaseParam;
        try {
            database = decodeURIComponent(databaseParam);
        } catch {
            database = databaseParam;
        }

        try {
            const { entry } = await ensureConnectionPoolForUser(userId, teamId, datasourceId, null);
            const instance = entry.instance as ClickhouseDatasource;
            const tables = await instance.getTablesOnly(database);

            return NextResponse.json(ResponseUtil.success(tables));
        } catch (error) {
            return mapConnectionErrorToResponse(error, {
                notFound: errorMessages.notFound,
                missingHost: errorMessages.missingHost,
                fallback: errorMessages.fallback,
            });
        }
    })(req);
}
