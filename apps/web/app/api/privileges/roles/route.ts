import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { resolveClickhouseDatasource, handlePrivilegesError } from '../_utils';
import type { CreateRolePayload } from '@/types/privileges';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';

export const GET = withUserAndTeamHandler(async ({ req, teamId }) => {
    const locale = await getApiLocale();
    const resolved = await resolveClickhouseDatasource(req, { teamId });
    if (resolved.response) return resolved.response;
    try {
        const roles = await resolved.resolved!.instance.privileges.listClickHouseRoles();
        return NextResponse.json(ResponseUtil.success(roles));
    } catch (error) {
        return handlePrivilegesError(error, translateApi('Api.Privileges.Roles.ListFailed', undefined, locale));
    }
});

export const POST = withUserAndTeamHandler(async ({ req, teamId }) => {
    const locale = await getApiLocale();
    const resolved = await resolveClickhouseDatasource(req, { teamId });
    if (resolved.response) return resolved.response;

    let payload: CreateRolePayload;
    try {
        payload = (await req.json()) as CreateRolePayload;
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
                message: translateApi('Api.Privileges.Roles.NameRequired', undefined, locale),
            }),
            { status: 400 },
        );
    }

    try {
        await resolved.resolved!.instance.privileges.createClickHouseRole(payload);
        return NextResponse.json(ResponseUtil.success());
    } catch (error) {
        return handlePrivilegesError(error, translateApi('Api.Privileges.Roles.CreateFailed', undefined, locale));
    }
});
