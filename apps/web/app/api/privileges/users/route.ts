import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { resolveClickhouseDatasource, handlePrivilegesError } from '../_utils';
import type { CreateUserPayload } from '@/types/privileges';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';

export const GET = withUserAndTeamHandler(async ({ req, teamId }) => {
    const locale = await getApiLocale();
    const resolved = await resolveClickhouseDatasource(req, { teamId });
    if (resolved.response) return resolved.response;
    try {
        const users = await resolved.resolved!.instance.privileges.listClickHouseUsers();
        return NextResponse.json(ResponseUtil.success(users));
    } catch (error) {
        console.error('Error listing ClickHouse users:', error);
        return handlePrivilegesError(error, translateApi('Api.Privileges.Users.ListFailed', undefined, locale));
    }
});

export const POST = withUserAndTeamHandler(async ({ req, teamId }) => {
    const locale = await getApiLocale();
    const resolved = await resolveClickhouseDatasource(req, { teamId });
    if (resolved.response) return resolved.response;
    let payload: CreateUserPayload;
    try {
        payload = (await req.json()) as CreateUserPayload;
    } catch {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: translateApi('Api.Errors.BodyParseFailed', undefined, locale),
            }),
            { status: 400 },
        );
    }

    if (!payload?.name) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: translateApi('Api.Privileges.Users.NameRequired', undefined, locale),
            }),
            { status: 400 },
        );
    }

    try {
        await resolved.resolved!.instance.privileges.createClickHouseUser(payload);
        return NextResponse.json(ResponseUtil.success());
    } catch (error) {
        return handlePrivilegesError(error, translateApi('Api.Privileges.Users.CreateFailed', undefined, locale));
    }
});
