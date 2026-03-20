/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { ensureConnectionPoolForUser, mapConnectionErrorToResponse } from '@/app/api/connection/utils';
import { hasMetadataCapability } from '@/lib/connection/base/types';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string; database: string }> }) {
    return withUserAndOrganizationHandler(async ({ userId, organizationId }) => {
        const locale = await getApiLocale();
        const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
        const errorMessages = {
            fallback: t('Api.Connection.Databases.Errors.DetailFailed'),
            notFound: t('Api.Connection.Errors.NotFound'),
            missingHost: t('Api.Connection.Errors.MissingHost'),
            missingDatabase: t('Api.Connection.Validation.DatabaseRequired'),
        };
        const headerId = req.headers.get('x-connection-id');
        const datasourceId = (await context?.params)?.id ?? headerId;
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
            const { entry } = await ensureConnectionPoolForUser(userId, organizationId, datasourceId, null);
            const metadata = entry.instance.capabilities.metadata;
            if (!hasMetadataCapability(metadata, 'getDatabaseTablesDetail')) {
                throw new Error(errorMessages.fallback);
            }
            const tables = await metadata.getDatabaseTablesDetail(database);

            return NextResponse.json(ResponseUtil.success(tables));
        } catch (error) {
            console.log('Error fetching database tables:', error);
            return mapConnectionErrorToResponse(error, {
                notFound: errorMessages.notFound,
                missingHost: errorMessages.missingHost,
                fallback: errorMessages.fallback,
            });
        }
    })(req);
}
