import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import type { BaseConnection } from '@/lib/connection/base/base-connection';
import type { ClickhousePrivilegesImpl } from '@/lib/connection/drivers/clickhouse/capabilities/privileges';
import { getOrCreateConnectionPool } from '@/lib/connection/connection-service';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';

const ERROR_MESSAGE_KEYS = {
    missingConnection: 'Api.Privileges.Errors.MissingConnectionId',
    notClickhouse: 'Api.Privileges.Errors.NotClickhouse',
    fallback: 'Api.Privileges.Errors.Fallback',
    notFound: 'Api.Privileges.Errors.ConnectionUnavailable',
    userNotFound: 'Api.Privileges.Errors.UserNotFound',
    roleNotFound: 'Api.Privileges.Errors.RoleNotFound',
};

export type ResolvedPrivilegesConnection = {
    instance: BaseConnection;
    privileges: ClickhousePrivilegesImpl;
};

export async function resolvePrivilegesConnection(
    req: NextRequest,
    options?: { organizationId?: string },
): Promise<{ response?: NextResponse; resolved?: ResolvedPrivilegesConnection }> {
    const locale = await getApiLocale();
    const organizationId = options?.organizationId ?? resolveCurrentOrganizationId(await getSessionFromRequest(req));
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

    if (!organizationId) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: translateApi('Api.Errors.MissingOrganizationContext', undefined, locale),
                }),
                { status: 401 },
            ),
        };
    }

    const entry = await getOrCreateConnectionPool(organizationId, connectionId);
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
    const privileges = instance.capabilities.privileges as ClickhousePrivilegesImpl | undefined;
    if (!privileges || instance.config.type !== 'clickhouse') {
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
            instance,
            privileges,
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
