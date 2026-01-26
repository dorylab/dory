import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { NextRequest, NextResponse } from 'next/server';
import { BaseConnection } from '../connection/base/base-connection';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getOrCreateConnectionPool } from '../connection/connection-service';
import { translate } from '@/lib/i18n/i18n';
import { Locale, routing } from '@/lib/i18n/routing';

type EnsureConnectionOptions = {
    locale?: Locale;
    messages?: {
        missingConnectionId?: string;
        missingTeamId?: string;
        connectionNotFound?: string;
    };
    teamId?: string;
};

function resolveLocale(req: NextRequest, explicitLocale?: Locale): Locale {
    if (explicitLocale && routing.locales.includes(explicitLocale)) {
        return explicitLocale;
    }
    const cookieLocale = req.cookies.get('locale')?.value as Locale | undefined;
    if (cookieLocale && routing.locales.includes(cookieLocale)) {
        return cookieLocale;
    }
    return routing.defaultLocale;
}

export async function ensureConnection(
    req: NextRequest,
    options?: EnsureConnectionOptions,
): Promise<
    | BaseConnection
    | { response: NextResponse }
> {
    const locale = resolveLocale(req, options?.locale);
    const connectionId =
        req.headers.get(X_CONNECTION_ID_KEY) ??
        req.headers.get(X_CONNECTION_ID_KEY.toLowerCase());

    if (!connectionId) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: options?.messages?.missingConnectionId ?? translate(locale, 'Utils.EnsureConnection.MissingConnectionId'),
                }),
                { status: 400 },
            ),
        };
    }

    const teamId = options?.teamId ?? (await getSessionFromRequest(req))?.user?.defaultTeamId ?? null;
    if (!teamId) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: options?.messages?.missingTeamId ?? translate(locale, 'Api.Errors.MissingTeamContext'),
                }),
                { status: 401 },
            ),
        };
    }

    const poolEntry = await getOrCreateConnectionPool(teamId, connectionId);
    if (!poolEntry) {
        return {
            response: NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.NOT_FOUND,
                    message: options?.messages?.connectionNotFound ?? translate(locale, 'Utils.EnsureConnection.ConnectionNotFound'),
                }),
                { status: 404 },
            ),
        };
    }

    const connection = poolEntry.instance;

    return connection;
}
