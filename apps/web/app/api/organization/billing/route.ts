import { NextResponse } from 'next/server';
import { withUserHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { getOrganizationBillingStatus } from '@/lib/billing/server';
import { canManageOrganizationBilling } from '@/lib/billing/authz';
import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { resolveOrganizationAccess } from '@/lib/server/authz';

export const runtime = 'nodejs';

export const GET = withUserHandler(async ({ req, userId }) => {
    const locale = await getApiLocale();
    const organizationId = req.nextUrl.searchParams.get('organizationId');

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

    const billingStatus = await getOrganizationBillingStatus(organizationId, canManageOrganizationBilling(access.role));

    return NextResponse.json(
        ResponseUtil.success({
            billingStatus,
        }),
    );
});
