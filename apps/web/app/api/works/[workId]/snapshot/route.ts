import { NextResponse, type NextRequest } from 'next/server';
import { getDBService } from '@dory/database';
import { getSessionFromRequest } from '@/lib/auth/session';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ workId: string }> }) {
    const session = await getSessionFromRequest(req);
    const userId = session?.user?.id ?? null;
    const organizationId = resolveCurrentOrganizationId(session);

    if (!userId || !organizationId) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.UNAUTHORIZED, message: 'Unauthorized.' }), { status: 401 });
    }

    const access = await resolveOrganizationAccess(organizationId, userId);
    if (!access?.isMember || !access.permissions.workspace.read) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.FORBIDDEN, message: 'Forbidden.' }), { status: 403 });
    }

    const workId = (await ctx.params).workId;
    if (!workId) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.VALIDATION_ERROR, message: 'Missing workId.' }), { status: 400 });
    }

    const db = await getDBService();
    const snapshot = await db.works.getSnapshot({ organizationId, userId, workId });
    if (!snapshot) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.NOT_FOUND, message: 'Work not found.' }), { status: 404 });
    }

    return NextResponse.json(ResponseUtil.success({ snapshot }));
}
