import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { NextRequest, NextResponse } from 'next/server';
import { testConnectService } from './service';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { CONNECTION_ERROR_CODES, getConnectionErrorCode } from '@/app/api/connection/utils';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
export const runtime = 'nodejs';
export const POST = withUserAndTeamHandler(async ({ req }) => {
    const payload = await req.json();
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    try {
        const result = await testConnectService(payload, {
            missingIdentityPassword: t('Api.Connection.Errors.MissingPassword'),
        });
        return NextResponse.json(ResponseUtil.success(result));
    } catch (error: unknown) {
        console.error('[connection] test connection failed', error);
        const code = getConnectionErrorCode(error);
        const fallbackMessage = t('Api.Connection.Errors.TestFailed');
        const messageFromError = error instanceof Error && error.message ? error.message : null;
        let message =
            code === CONNECTION_ERROR_CODES.missingHost
                ? t('Api.Connection.Errors.MissingHost')
                : code === CONNECTION_ERROR_CODES.missingUsername
                  ? t('Api.Connection.Errors.MissingUsername')
                  : code === CONNECTION_ERROR_CODES.missingIdentityInfo
                    ? t('Api.Connection.Errors.MissingIdentityInfo')
                    : code === CONNECTION_ERROR_CODES.missingPassword
                      ? t('Api.Connection.Errors.MissingPassword')
                      : code === CONNECTION_ERROR_CODES.missingSshPassword
                        ? t('Api.Connection.Errors.MissingSshPassword')
                        : code === CONNECTION_ERROR_CODES.missingSshPrivateKey
                          ? t('Api.Connection.Errors.MissingSshPrivateKey')
                          : messageFromError ?? fallbackMessage;
        message = (error as any).level ? `[${(error as any).level}] ${message}` : message;
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.ERROR, message }), { status: 200 });
    }
});
