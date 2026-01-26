import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { ensureConnectionPoolForUser, mapConnectionErrorToResponse } from '@/app/api/connection/utils';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

type CatalogContext = {
    database: string;
    entry: Awaited<ReturnType<typeof ensureConnectionPoolForUser>>['entry'];
};

export async function resolveCatalogContext(
    req: NextRequest,
    context: { params: Promise<{ database: string }> },
    auth: { userId: string; teamId: string },
): Promise<{ response?: NextResponse; resolved?: CatalogContext }> {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const errorMessages = {
        unauthorized: t('Api.Connection.Errors.Unauthorized'),
        fallback: t('Api.Connection.Errors.FetchCatalogFailed'),
        notFound: t('Api.Connection.Errors.NotFound'),
        missingHost: t('Api.Connection.Errors.MissingHost'),
        missingDatabase: t('Api.Connection.Validation.DatabaseRequired'),
    };
    const { userId, teamId } = auth;
    if (!userId || !teamId) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.UNAUTHORIZED, message: errorMessages.unauthorized }),
                { status: 401 },
            ),
        };
    }

    const datasourceId = req.headers.get('x-connection-id');
    const databaseParam = (await context?.params)?.database;

    if (!datasourceId) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingConnectionId') }),
                { status: 400 },
            ),
        };
    }

    if (!databaseParam) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: errorMessages.missingDatabase }),
                { status: 400 },
            ),
        };
    }

    let database = databaseParam;
    try {
        database = decodeURIComponent(databaseParam);
    } catch {
        database = databaseParam;
    }

    try {
        const { entry } = await ensureConnectionPoolForUser(userId, teamId, datasourceId, null);
        return {
            resolved: {
                database,
                entry,
            },
        };
    } catch (error) {
        return {
            response: mapConnectionErrorToResponse(error, {
                notFound: errorMessages.notFound,
                missingHost: errorMessages.missingHost,
                fallback: errorMessages.fallback,
            }),
        };
    }
}
