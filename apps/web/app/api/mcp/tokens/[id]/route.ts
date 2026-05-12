import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withManagedOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    return withManagedOrganizationHandler(async ({ db, organizationId }) => {
        const { id } = await context.params;
        if (!id) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: 'Missing MCP token id.',
                }),
                { status: 400 },
            );
        }

        const deleted = await db.mcp.deleteToken(organizationId, id);
        if (!deleted) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.NOT_FOUND,
                    message: 'MCP token not found.',
                }),
                { status: 404 },
            );
        }

        return NextResponse.json(ResponseUtil.success({ deleted: true }));
    })(req);
}
