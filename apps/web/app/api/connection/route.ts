import { NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { handleApiError } from '../utils/handle-error';
import { parseJsonBody } from '../utils/parse-json';
import { withTeamHandler, withUserAndTeamHandler } from '../utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

// GET /api/connections?id=xxx
export const GET = withTeamHandler(async ({ req, db, teamId }) => {
    const id = req.nextUrl.searchParams.get('id');
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    try {
        if (id) {
            const record = await db.connections.getById(teamId, id);
            if (!record) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.NOT_FOUND,
                        message: t('Api.Connection.Errors.NotFound'),
                    }),
                    { status: 404 },
                );
            }
            return NextResponse.json(ResponseUtil.success(record));
        }

        const data = await db.connections.list(teamId);
        return NextResponse.json(ResponseUtil.success(data));
    } catch (err: any) {
        return handleApiError(err);
    }
});

// POST /api/connections
export const POST = withUserAndTeamHandler(async ({ req, db, userId, teamId }) => {
    try {
        const payload = await req.json();
        const created = await db.connections.create(userId!, teamId, payload);
        return NextResponse.json(ResponseUtil.success(created), { status: 201 });
    } catch (err: any) {
        return handleApiError(err);
    }
});

// PATCH /api/connections?id=xxx
export const PATCH = withUserAndTeamHandler(async ({ req, db, userId, teamId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    try {
        // const payload = await parseJsonBody(req, UpdateConnectionSchema);
        const payload = await parseJsonBody(req);

        const searchId = req.nextUrl.searchParams.get('id');
        const connectionId = searchId ?? payload?.id;

        if (!connectionId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: t('Api.Connection.Errors.MissingConnectionId'),
                }),
                { status: 400 },
            );
        }

        const updated = await db.connections.update(userId as string, teamId, connectionId, payload);
        return NextResponse.json(ResponseUtil.success());
    } catch (err: any) {
        return handleApiError(err);
    }
});

// DELETE /api/connections?id=xxx
export const DELETE = withUserAndTeamHandler(async ({ req, db, userId, teamId }) => {
    console.log('userId', userId);
    console.log('teamId', teamId);
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    try {
        const id = req.nextUrl.searchParams.get('id');
        if (!id) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: t('Api.Connection.Errors.MissingConnectionId'),
                }),
                { status: 400 },
            );
        }

        await db.connections.delete(userId!, teamId, id);
        return NextResponse.json(ResponseUtil.success({ deleted: [id] }));
    } catch (err: any) {
        return handleApiError(err);
    }
});
