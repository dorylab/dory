import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { resolvePrivilegesConnection, handlePrivilegesError } from '../../_utils';
import type { UpdateRolePayload } from '@/types/privileges';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export async function GET(req: NextRequest, context: { params: Promise<{ name: string }> }) {
    return withUserAndOrganizationHandler(async ({ req, organizationId }) => {
        const locale = await getApiLocale();
        const resolved = await resolvePrivilegesConnection(req, { organizationId });
        if (resolved.response) return resolved.response;
        const params = await context.params;
        try {
            const role = await resolved.resolved!.privileges.getClickHouseRole(params.name);
            if (!role) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.NOT_FOUND,
                        message: translateApi('Api.Privileges.Errors.RoleNotFound', undefined, locale),
                    }),
                    { status: 404 },
                );
            }
            return NextResponse.json(ResponseUtil.success(role));
        } catch (error) {
            return handlePrivilegesError(error, translateApi('Api.Privileges.Roles.DetailFailed', undefined, locale));
        }
    })(req);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ name: string }> }) {
    return withUserAndOrganizationHandler(async ({ req, organizationId }) => {
        const locale = await getApiLocale();
        const resolved = await resolvePrivilegesConnection(req, { organizationId });
        if (resolved.response) return resolved.response;
        const params = await context.params;

        let payload: UpdateRolePayload;
        try {
            payload = (await req.json()) as UpdateRolePayload;
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
            await resolved.resolved!.privileges.updateClickHouseRole(payload);
            return NextResponse.json(ResponseUtil.success());
        } catch (error) {
            return handlePrivilegesError(error, translateApi('Api.Privileges.Roles.UpdateFailed', undefined, locale));
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
            await resolved.resolved!.privileges.deleteClickHouseRole({ name: params.name });
            return NextResponse.json(ResponseUtil.success());
        } catch (error) {
            return handlePrivilegesError(error, translateApi('Api.Privileges.Roles.DeleteFailed', undefined, locale));
        }
    })(req);
}
