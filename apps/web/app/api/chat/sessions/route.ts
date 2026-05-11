import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';
import type { ChatSessionRecord, ChatSessionType } from '@dory/shared';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
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
export const GET = withUserAndOrganizationHandler(async ({ req, db, session, userId, organizationId }) => {
    const locale = await getApiLocale();
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') as ChatSessionType | null) ?? 'global';
    const connectionId = searchParams.get('connectionId');

    if (type !== 'global' && type !== 'copilot') {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: translateApi('Api.Chat.Errors.InvalidSessionType', undefined, locale),
            }),
            { status: 400 },
        );
    }

    if (!connectionId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: translateApi('Api.Chat.Errors.ConnectionIdRequired', undefined, locale),
            }),
            { status: 400 },
        );
    }

    try {
        if (!db?.chat) throw new Error('Chat repository not available');

        const sessions = await db.chat.listSessions({
            organizationId,
            userId,
            type,
            includeArchived: false,
            connectionId,
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
export const POST = withUserAndOrganizationHandler(async ({ req, db, session, userId, organizationId }) => {
    const locale = await getApiLocale();
    console.log('POST /api/chat/sessions called', userId, organizationId);

    let payload: { type?: string; connectionId?: string; activeDatabase?: string | null; activeSchema?: string | null } | null = null;
    try {
        payload = await req.json();
    } catch {
        payload = null;
    }

    const type = payload?.type ?? 'global';
    const connectionId = payload?.connectionId ?? null;
    const activeDatabase = payload?.activeDatabase ?? null;
    const activeSchema = payload?.activeSchema ?? null;

    if (type !== 'global') {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: translateApi('Api.Chat.Errors.CopilotCreationNotAllowed', undefined, locale),
            }),
            { status: 400 },
        );
    }

    if (!connectionId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: translateApi('Api.Chat.Errors.ConnectionIdRequired', undefined, locale),
            }),
            { status: 400 },
        );
    }

    try {
        if (!db?.chat) throw new Error('Chat repository not available');

        const created = await db.chat.createGlobalSession({
            organizationId,
            userId,
            connectionId,
            activeDatabase,
            activeSchema,
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
