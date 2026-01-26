// lib/api/with-team-handler.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getDBService } from '@/lib/database';
import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

type TeamHandlerContext = {
    req: NextRequest;
    db: Awaited<ReturnType<typeof getDBService>>;
    session: Awaited<ReturnType<typeof getSessionFromRequest>>;
    userId: string | null;
    teamId: string;
};

type UserTeamHandlerContext = Omit<TeamHandlerContext, 'userId'> & {
    userId: string;
};

type TeamHandlerFn = (ctx: TeamHandlerContext) => Promise<Response>;
type UserTeamHandlerFn = (ctx: UserTeamHandlerContext) => Promise<Response>;


export function withTeamHandler(handler: TeamHandlerFn) {
    return async function routeHandler(req: NextRequest): Promise<Response> {
        const locale = await getApiLocale();
        const session = await getSessionFromRequest(req);
        const teamId = session?.user?.defaultTeamId ?? null;
        const userId = session?.user?.id ?? null;

        if (!teamId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: translateApi('Api.Errors.MissingTeamContext', undefined, locale),
                }),
                { status: 401 },
            );
        }

        const db = await getDBService();

        try {
            return await handler({
                req,
                db,
                session,
                userId,
                teamId,
            });
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
    };
}


export function withUserAndTeamHandler(handler: UserTeamHandlerFn) {
    return async function routeHandler(req: NextRequest): Promise<Response> {
        const locale = await getApiLocale();
        const session = await getSessionFromRequest(req);
        const teamId = session?.user?.defaultTeamId ?? null;
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

        if (!teamId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.UNAUTHORIZED,
                    message: translateApi('Api.Errors.MissingTeamContext', undefined, locale),
                }),
                { status: 401 },
            );
        }

        const db = await getDBService();

        try {
            return await handler({
                req,
                db,
                session,
                userId: userId as string,
                teamId,
            });
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
    };
}
