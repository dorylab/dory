import { NextRequest, NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { resolveClickhouseDatasource, handlePrivilegesError } from '../../../_utils';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';

type GlobalPrivilegePayload = {
    privileges: string[];
};

async function parsePayload(req: NextRequest): Promise<GlobalPrivilegePayload | null> {
    try {
        const body = (await req.json()) as GlobalPrivilegePayload;
        if (!body || !Array.isArray(body.privileges)) {
            return null;
        }
        return body;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest, context: { params: Promise<{ name: string }> }) {
    const locale = await getApiLocale();
    return withUserAndTeamHandler(async ({ req, teamId }) => {
        const resolved = await resolveClickhouseDatasource(req, { teamId });
        if (resolved.response) return resolved.response;
        const params = await context.params;
        const payload = await parsePayload(req);

        if (!payload) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: translateApi('Api.Errors.BodyParseFailed', undefined, locale),
                }),
                { status: 400 },
            );
        }

        try {
            await resolved.resolved!.instance.privileges.grantUserGlobalPrivileges({
                name: params.name,
                privileges: payload.privileges,
            });
            return NextResponse.json(ResponseUtil.success());
        } catch (error) {
            return handlePrivilegesError(error, translateApi('Api.Privileges.Users.GrantGlobalFailed', undefined, locale));
        }
    })(req);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ name: string }> }) {
    const locale = await getApiLocale();
    return withUserAndTeamHandler(async ({ req, teamId }) => {
        const resolved = await resolveClickhouseDatasource(req, { teamId });
        if (resolved.response) return resolved.response;
        const params = await context.params;
        const payload = await parsePayload(req);

        if (!payload) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: translateApi('Api.Errors.BodyParseFailed', undefined, locale),
                }),
                { status: 400 },
            );
        }

        try {
            await resolved.resolved!.instance.privileges.revokeUserGlobalPrivileges({
                name: params.name,
                privileges: payload.privileges,
            });
            return NextResponse.json(ResponseUtil.success());
        } catch (error) {
            return handlePrivilegesError(error, translateApi('Api.Privileges.Users.RevokeGlobalFailed', undefined, locale));
        }
    })(req);
}
