import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    return withOrganizationHandler(async ({ db, organizationId, userId }) => {
        const locale = await getApiLocale();
        const t = (key: string) => translateApi(key, undefined, locale);

        if (!userId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: t('Api.Errors.Unauthorized'),
                }),
                { status: 401 },
            );
        }

        const { id } = await context.params;
        if (!id) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: t('Api.Mcp.MissingTokenId'),
                }),
                { status: 400 },
            );
        }

        const deleted = await db.mcp.deleteTokenForUser(organizationId, userId, id);
        if (!deleted) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.NOT_FOUND,
                    message: t('Api.Mcp.TokenNotFound'),
                }),
                { status: 404 },
            );
        }

        return NextResponse.json(ResponseUtil.success({ deleted: true }));
    })(req);
}
