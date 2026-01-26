import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { ClickhouseDatasource } from '@/lib/connection/drivers/clickhouse/ClickhouseDatasource';
import { getOrCreateConnectionPool } from '@/lib/connection/connection-service';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

const ERROR_MESSAGE_KEYS = {
    missingConnection: 'Api.Privileges.Errors.MissingConnectionId',
    notClickhouse: 'Api.Privileges.Errors.NotClickhouse',
    fallback: 'Api.Privileges.Errors.Fallback',
    notFound: 'Api.Privileges.Errors.ConnectionUnavailable',
    userNotFound: 'Api.Privileges.Errors.UserNotFound',
    roleNotFound: 'Api.Privileges.Errors.RoleNotFound',
};

export type ResolvedDatasource = {
    instance: ClickhouseDatasource;
};

export async function resolveClickhouseDatasource(
    req: NextRequest,
    options?: { teamId?: string },
): Promise<{ response?: NextResponse; resolved?: ResolvedDatasource }> {
    const locale = await getApiLocale();
    const teamId = options?.teamId ?? (await getSessionFromRequest(req))?.user?.defaultTeamId ?? null;
    const connectionId =
        req.headers.get(X_CONNECTION_ID_KEY) ??
        req.headers.get(X_CONNECTION_ID_KEY.toLowerCase()) ??
        req.nextUrl.searchParams.get('connectionId');

    if (!connectionId) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: translateApi(ERROR_MESSAGE_KEYS.missingConnection, undefined, locale),
                }),
                { status: 400 },
            ),
        };
    }

    if (!teamId) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: translateApi('Api.Errors.MissingTeamContext', undefined, locale),
                }),
                { status: 401 },
            ),
        };
    }

    const entry = await getOrCreateConnectionPool(teamId, connectionId);
    if (!entry) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.NOT_FOUND,
                    message: translateApi(ERROR_MESSAGE_KEYS.notFound, undefined, locale),
                }),
                { status: 404 },
            ),
        };
    }

    const instance = entry.instance;
    const isClickhouse = entry.type === 'clickhouse' || instance?.config?.type === 'clickhouse' || instance?.constructor?.name === ClickhouseDatasource.name;
    if (!isClickhouse) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.BAD_REQUEST,
                    message: translateApi(ERROR_MESSAGE_KEYS.notClickhouse, undefined, locale),
                }),
                { status: 400 },
            ),
        };
    }

    return {
        resolved: {
            instance: instance as ClickhouseDatasource,
        },
    };
}

export async function handlePrivilegesError(
    error: unknown,
    fallbackMessage?: string,
    status = 500,
): Promise<NextResponse> {
    const locale = await getApiLocale();
    if (error instanceof Error) {
        if (error.message === 'USER_NOT_FOUND') {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.NOT_FOUND,
                    message: translateApi(ERROR_MESSAGE_KEYS.userNotFound, undefined, locale),
                }),
                { status: 404 },
            );
        }
        if (error.message === 'ROLE_NOT_FOUND') {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.NOT_FOUND,
                    message: translateApi(ERROR_MESSAGE_KEYS.roleNotFound, undefined, locale),
                }),
                { status: 404 },
            );
        }
        if (error.message === 'NOT_CLICKHOUSE_DATASOURCE') {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.BAD_REQUEST,
                    message: translateApi(ERROR_MESSAGE_KEYS.notClickhouse, undefined, locale),
                }),
                { status: 400 },
            );
        }
    }

    console.error('[privileges] unexpected error', error);
    return NextResponse.json(
        ResponseUtil.error({
            code: ErrorCodes.ERROR,
            message: error?.toString() || fallbackMessage || translateApi(ERROR_MESSAGE_KEYS.fallback, undefined, locale),
        }),
        { status },
    );
}
