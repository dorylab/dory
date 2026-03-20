import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { resolvePrivilegesConnection, handlePrivilegesError } from '../../_utils';
import type { UpdateUserPayload } from '@/types/privileges';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export async function GET(req: NextRequest, context: { params: Promise<{ name: string }> }) {
    return withUserAndOrganizationHandler(async ({ req, organizationId }) => {
        const locale = await getApiLocale();
        const resolved = await resolvePrivilegesConnection(req, { organizationId });
        if (resolved.response) return resolved.response;
        const params = await context.params;
        try {
            const user = await resolved.resolved!.privileges.getClickHouseUser(params.name);
            if (!user) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.NOT_FOUND,
                        message: translateApi('Api.Privileges.Errors.UserNotFound', undefined, locale),
                    }),
                    { status: 404 },
                );
            }
            return NextResponse.json(ResponseUtil.success(user));
        } catch (error) {
            return handlePrivilegesError(error, translateApi('Api.Privileges.Users.DetailFailed', undefined, locale));
        }
    })(req);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ name: string }> }) {
    return withUserAndOrganizationHandler(async ({ req, organizationId }) => {
        const locale = await getApiLocale();
        const resolved = await resolvePrivilegesConnection(req, { organizationId });
        if (resolved.response) return resolved.response;
        const params = await context.params;
        let payload: UpdateUserPayload;
        try {
            payload = (await req.json()) as UpdateUserPayload;
        } catch {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: translateApi('Api.Errors.BodyParseFailed', undefined, locale),
                }),
                { status: 400 },
            );
        }

        payload.name = params.name;

        try {
            await resolved.resolved!.privileges.updateClickHouseUser(payload);
            return NextResponse.json(ResponseUtil.success());
        } catch (error) {
            return handlePrivilegesError(error, translateApi('Api.Privileges.Users.UpdateFailed', undefined, locale));
        }
    })(req);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ name: string }> }) {
    return withUserAndOrganizationHandler(async ({ req, organizationId }) => {
        const locale = await getApiLocale();
        const resolved = await resolvePrivilegesConnection(req, { organizationId });
        if (resolved.response) return resolved.response;
        const params = await context.params;

        try {
            await resolved.resolved!.privileges.deleteClickHouseUser({ name: params.name });
            return NextResponse.json(ResponseUtil.success());
        } catch (error) {
            return handlePrivilegesError(error, translateApi('Api.Privileges.Users.DeleteFailed', undefined, locale));
        }
    })(req);
}
