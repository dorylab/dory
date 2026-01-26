// app/api/sql/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { getOrCreateConnectionPool } from '@/lib/connection/connection-service';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

export const POST = withUserAndTeamHandler(async ({ req, teamId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const connectionId = req.headers.get(X_CONNECTION_ID_KEY);
    const body = await req.json().catch(() => ({}));
    const sessionId: string | undefined = body.sessionId;

    if (!connectionId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.UNAUTHORIZED,
                message: t('Api.Query.Errors.MissingConnectionId'),
            }),
            { status: 400 },
        );
    }

    if (!sessionId || typeof sessionId !== 'string') {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: t('Api.Query.Errors.MissingSessionId'),
            }),
            { status: 400 },
        );
    }

    const poolEntry = await getOrCreateConnectionPool(teamId, connectionId);
    if (!poolEntry) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.UNAUTHORIZED,
                message: t('Api.Query.Errors.DatasourceNotFound'),
            }),
            { status: 404 },
        );
    }

    const datasource = poolEntry.instance;

    if (typeof datasource.cancelQuery !== 'function') {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: t('Api.Query.Errors.CancelNotSupported'),
            }),
            { status: 400 },
        );
    }

    try {
        await datasource.cancelQuery(sessionId);
        return NextResponse.json(ResponseUtil.success({ ok: true }));
    } catch (e: any) {
        return NextResponse.json(ResponseUtil.error(e));
    }
});
