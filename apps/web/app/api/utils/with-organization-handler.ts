// lib/api/with-organization-handler.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getDBService } from '@/lib/database';
import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { canManageOrganization, resolveOrganizationAccess } from '@/lib/server/authz';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';

type OrganizationHandlerContext = {
    req: NextRequest;
    db: Awaited<ReturnType<typeof getDBService>>;
    session: Awaited<ReturnType<typeof getSessionFromRequest>>;
    userId: string | null;
    organizationId: string;
};

type UserHandlerContext = Omit<OrganizationHandlerContext, 'organizationId'> & {
    userId: string;
};

type UserOrganizationHandlerContext = Omit<OrganizationHandlerContext, 'userId'> & {
    userId: string;
};
type ManagedOrganizationHandlerContext = UserOrganizationHandlerContext & {
    access: Awaited<ReturnType<typeof resolveOrganizationAccess>>;
};

type OrganizationHandlerFn = (ctx: OrganizationHandlerContext) => Promise<Response>;
type UserHandlerFn = (ctx: UserHandlerContext) => Promise<Response>;
type UserOrganizationHandlerFn = (ctx: UserOrganizationHandlerContext) => Promise<Response>;
type ManagedOrganizationHandlerFn = (ctx: ManagedOrganizationHandlerContext) => Promise<Response>;
type PlatformAdminHandlerFn = (ctx: UserHandlerContext) => Promise<Response>;

function parseCsvEnv(name: string): string[] {
    const raw = process.env[name];
    if (!raw) return [];
    return raw
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function isPlatformAdmin(session: Awaited<ReturnType<typeof getSessionFromRequest>>): boolean {
    const user = session?.user;
    if (!user) return false;

    const adminIds = new Set(parseCsvEnv('DORY_PLATFORM_ADMIN_IDS'));
    const adminEmails = new Set(parseCsvEnv('DORY_PLATFORM_ADMIN_EMAILS').map(email => email.toLowerCase()));

    if (user.id && adminIds.has(user.id)) return true;
    if (user.email && adminEmails.has(user.email.toLowerCase())) return true;

    return false;
}

async function withHandlerErrorBoundary(handler: () => Promise<Response>) {
    const locale = await getApiLocale();

    try {
        return await handler();
    } catch (err: any) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.DATABASE_ERROR,
                message: err?.message ?? translateApi('Api.Errors.InternalError', undefined, locale),
                error: err,
            }),
            { status: 500 },
        );
    }
}

export function withUserHandler(handler: UserHandlerFn) {
    return async function routeHandler(req: NextRequest): Promise<Response> {
        const locale = await getApiLocale();
        const session = await getSessionFromRequest(req);
        const userId = session?.user?.id ?? null;

        if (!userId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: translateApi('Api.Errors.Unauthorized', undefined, locale),
                }),
                { status: 401 },
            );
        }

        const db = await getDBService();

        return withHandlerErrorBoundary(async () => {
            return handler({
                req,
                db,
                session,
                userId,
            });
        });
    };
}

export function withOrganizationHandler(handler: OrganizationHandlerFn) {
    return async function routeHandler(req: NextRequest): Promise<Response> {
        const locale = await getApiLocale();
        const session = await getSessionFromRequest(req);
        const organizationId = resolveCurrentOrganizationId(session);
        const userId = session?.user?.id ?? null;

        if (!organizationId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: translateApi('Api.Errors.MissingOrganizationContext', undefined, locale),
                }),
                { status: 401 },
            );
        }

        const db = await getDBService();

        return withHandlerErrorBoundary(async () => {
            return handler({
                req,
                db,
                session,
                userId,
                organizationId,
            });
        });
    };
}

export function withUserAndOrganizationHandler(handler: UserOrganizationHandlerFn) {
    return async function routeHandler(req: NextRequest): Promise<Response> {
        const locale = await getApiLocale();
        const session = await getSessionFromRequest(req);
        const organizationId = resolveCurrentOrganizationId(session);
        const userId = session?.user?.id ?? null;

        if (!userId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: translateApi('Api.Errors.Unauthorized', undefined, locale),
                }),
                { status: 401 },
            );
        }

        if (!organizationId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: translateApi('Api.Errors.MissingOrganizationContext', undefined, locale),
                }),
                { status: 401 },
            );
        }

        const db = await getDBService();

        return withHandlerErrorBoundary(async () => {
            return handler({
                req,
                db,
                session,
                userId,
                organizationId,
            });
        });
    };
}

export function withPlatformAdminHandler(handler: PlatformAdminHandlerFn) {
    return async function routeHandler(req: NextRequest): Promise<Response> {
        const locale = await getApiLocale();
        const session = await getSessionFromRequest(req);
        const userId = session?.user?.id ?? null;

        if (!userId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: translateApi('Api.Errors.Unauthorized', undefined, locale),
                }),
                { status: 401 },
            );
        }

        if (!isPlatformAdmin(session)) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.FORBIDDEN,
                    message: 'Forbidden',
                }),
                { status: 403 },
            );
        }

        const db = await getDBService();

        return withHandlerErrorBoundary(async () => {
            return handler({
                req,
                db,
                session,
                userId,
            });
        });
    };
}

export function withManagedOrganizationHandler(handler: ManagedOrganizationHandlerFn) {
    return withUserAndOrganizationHandler(async ctx => {
        const locale = await getApiLocale();
        const access = await resolveOrganizationAccess(ctx.organizationId, ctx.userId);

        if (!canManageOrganization(access)) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.FORBIDDEN,
                    message: translateApi('ErrorCodes.FORBIDDEN', undefined, locale),
                }),
                { status: 403 },
            );
        }

        return handler({
            ...ctx,
            access,
        });
    });
}
