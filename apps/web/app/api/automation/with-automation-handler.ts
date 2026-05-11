import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getDBService } from '@dory/database';
import { ErrorCodes } from '@dory/shared/errors';
import { ResponseUtil } from '@/lib/result';
import { resolveOrganizationAccess } from '@/lib/server/authz';

type AutomationHandlerContext = {
    req: NextRequest;
    db: Awaited<ReturnType<typeof getDBService>>;
    userId: string;
    organizationId: string;
};

type AutomationHandlerFn = (ctx: AutomationHandlerContext) => Promise<Response>;

import { resolveOrganizationIdFromHeaders } from './utils';

/**
 * Handler wrapper for Automation API endpoints.
 *
 * Supports authentication via:
 * - Cookie-based session (same as web UI)
 * - Bearer token in Authorization header (for CLI / external usage)
 *
 * Organization context is resolved from:
 * - x-organization-id header (required for automation)
 */
export function withAutomationHandler(handler: AutomationHandlerFn) {
    return async function routeHandler(req: NextRequest): Promise<Response> {
        try {
            const session = await getSessionFromRequest(req);
            const userId = session?.user?.id ?? null;

            if (!userId) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.UNAUTHORIZED,
                        message: 'Authentication required. Provide a session cookie or Authorization: Bearer <token> header.',
                    }),
                    { status: 401 },
                );
            }

            const organizationId = resolveOrganizationIdFromHeaders(req.headers);
            if (!organizationId) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.UNAUTHORIZED,
                        message: 'Missing organization context. Provide x-organization-id header.',
                    }),
                    { status: 400 },
                );
            }

            const access = await resolveOrganizationAccess(organizationId, userId);
            if (!access?.isMember) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.FORBIDDEN,
                        message: 'You do not have access to this organization.',
                    }),
                    { status: 403 },
                );
            }

            const db = await getDBService();

            return await handler({ req, db, userId, organizationId });
        } catch (err: any) {
            console.error('[automation] handler error', err);
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.DATABASE_ERROR,
                    message: err?.message ?? 'Internal server error',
                }),
                { status: 500 },
            );
        }
    };
}
