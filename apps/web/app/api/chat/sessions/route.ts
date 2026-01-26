import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import type { ChatSessionRecord, ChatSessionType } from '@/types';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';


function serializeSession(session: ChatSessionRecord) {
    const toIso = (value: Date | number | null | undefined) => {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.valueOf()) ? null : date.toISOString();
    };

    return {
        id: session.id,
        title: session.title ?? null,
        type: session.type,
        tabId: session.tabId ?? null,

        connectionId: session.connectionId ?? null,
        activeDatabase: session.activeDatabase ?? null,
        activeSchema: session.activeSchema ?? null,

        createdAt: toIso(session.createdAt),
        updatedAt: toIso(session.updatedAt),
        lastMessageAt: toIso(session.lastMessageAt),
    };
}

/**
 * GET /api/chat/sessions?type=global|copilot
 */
export const GET = withUserAndTeamHandler(async ({ req, db, userId, teamId }) => {
    const locale = await getApiLocale();
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') as ChatSessionType | null) ?? 'global';

    if (type !== 'global' && type !== 'copilot') {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: translateApi('Api.Chat.Errors.InvalidSessionType', undefined, locale),
            }),
            { status: 400 },
        );
    }

    try {
        if (!db?.chat) throw new Error('Chat repository not available');

        const sessions = await db.chat.listSessions({
            teamId,
            userId,
            type,
            includeArchived: false,
        });

        return NextResponse.json(
            ResponseUtil.success({
                sessions: sessions.map(serializeSession),
            }),
        );
    } catch (error) {
        console.error('[chat] list sessions failed', error);
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.DATABASE_ERROR,
                message: translateApi('Api.Chat.Errors.ListSessionsFailed', undefined, locale),
            }),
            { status: 500 },
        );
    }
});

/**
 * POST /api/chat/sessions
 */
export const POST = withUserAndTeamHandler(async ({ req, db, userId, teamId }) => {
    const locale = await getApiLocale();
    console.log('POST /api/chat/sessions called', userId, teamId);

    let payload: { type?: string } | null = null;
    try {
        payload = await req.json();
    } catch {
        payload = null;
    }

    const type = payload?.type ?? 'global';
    if (type !== 'global') {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: translateApi('Api.Chat.Errors.CopilotCreationNotAllowed', undefined, locale),
            }),
            { status: 400 },
        );
    }

    try {
        if (!db?.chat) throw new Error('Chat repository not available');

        const created = await db.chat.createGlobalSession({
            teamId,
            userId,
            title: null,
            metadata: null,
        });

        console.log('Created global session:', created);

        return NextResponse.json(
            ResponseUtil.success({
                session: serializeSession(created),
            }),
            { status: 201 },
        );
    } catch (error) {
        console.error('[chat] create global session failed', error);
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.DATABASE_ERROR,
                message: translateApi('Api.Chat.Errors.CreateSessionFailed', undefined, locale),
            }),
            { status: 500 },
        );
    }
});
