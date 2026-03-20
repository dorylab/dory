import { withUserHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { NextResponse } from 'next/server';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';

export const runtime = 'nodejs';

export const GET = withUserHandler(async ({ req, session, userId }) => {
    const locale = await getApiLocale();
    const requestedTeamId = req.nextUrl.searchParams.get('organizationId');
    const organizationId = requestedTeamId ?? resolveCurrentOrganizationId(session);

    if (!organizationId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: translateApi('Api.Errors.MissingOrganizationContext', undefined, locale),
            }),
            { status: 400 },
        );
    }

    const access = await resolveOrganizationAccess(organizationId, userId);
    if (!access?.isMember) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.FORBIDDEN,
                message: translateApi('Api.Errors.Unauthorized', undefined, locale),
            }),
            { status: 403 },
        );
    }

    return NextResponse.json(ResponseUtil.success({ access }));
});
