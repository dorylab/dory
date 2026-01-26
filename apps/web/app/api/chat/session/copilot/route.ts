import { NextRequest, NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import type { ChatSessionRecord } from '@/types';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

function toIso(value: Date | number | null | undefined) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function serializeSession(session: ChatSessionRecord) {
    return {
        id: session.id,
        title: session.title ?? null,
        type: session.type,
        tabId: session.tabId ?? null,

        connectionId: session.connectionId ?? null,
        activeDatabase: session.activeDatabase ?? null,
        activeSchema: session.activeSchema ?? null,

        metadata: session.metadata ?? null,

        createdAt: toIso(session.createdAt),
        updatedAt: toIso(session.updatedAt),
        archivedAt: toIso(session.archivedAt),
        lastMessageAt: toIso(session.lastMessageAt),
    };
}

/**
 * POST /api/chat/session/copilot
 */
export const POST = withUserAndTeamHandler(async ({ req, db, userId, teamId }) => {
    const locale = await getApiLocale();
    let payload: any = null;
    try {
        payload = await req.json();
    } catch {
        payload = null;
    }

    const envelope = payload?.envelope && typeof payload.envelope === 'object' ? payload.envelope : null;
    const tabId = typeof envelope?.meta?.tabId === 'string' ? envelope.meta.tabId.trim() : '';
    if (!tabId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: translateApi('Api.Chat.Errors.MissingTabId', undefined, locale),
            }),
            { status: 400 },
        );
    }

    const context = envelope?.context && typeof envelope.context === 'object' ? envelope.context : null;
    const connectionId =
        typeof envelope?.meta?.connectionId === 'string' ? envelope.meta.connectionId : null;
    const activeDatabase =
        envelope?.surface === 'sql'
            ? typeof context?.baseline?.database === 'string'
                ? context.baseline.database
                : null
            : typeof context?.database === 'string'
                ? context.database
                : null;
    const activeSchema =
        envelope?.surface === 'table' && typeof context?.table?.schema === 'string' ? context.table.schema : null;

    try {
        if (!db?.chat) throw new Error('Chat repository not available');

        const session = await db.chat.createOrGetCopilotSession({
            teamId,
            userId,
            tabId,
            connectionId,
            activeDatabase,
            activeSchema,
            metadata: envelope ? { copilotEnvelope: envelope } : null,
            title:
                envelope?.surface === 'table' && typeof context?.table?.name === 'string' && context.table.name.trim()
                    ? context.table.name.trim()
                    : null,
        });

        return NextResponse.json(
            ResponseUtil.success({
                session: serializeSession(session),
            }),
            { status: 200 },
        );
    } catch (error) {
        if (error instanceof DatabaseError) {
            const status = error.code === 403 ? 403 : error.code === 404 ? 404 : 500;
            return NextResponse.json(
                ResponseUtil.error({
                    code:
                        status === 403
                            ? ErrorCodes.UNAUTHORIZED
                            : status === 404
                                ? ErrorCodes.NOT_FOUND
                                : ErrorCodes.DATABASE_ERROR,
                    message: error.message,
                }),
                { status },
            );
        }

        console.error('[chat] create/get copilot session failed', error);
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.DATABASE_ERROR,
                message: translateApi('Api.Chat.Errors.FetchCopilotSessionFailed', undefined, locale),
            }),
            { status: 500 },
        );
    }
});

/**
 * GET /api/chat/session/copilot?tabId=...
 */
export const GET = withUserAndTeamHandler(async ({ req, db, userId, teamId }) => {
    const locale = await getApiLocale();
    const { searchParams } = new URL(req.url);
    const tabId = (searchParams.get('tabId') ?? '').trim();
    if (!tabId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: translateApi('Api.Chat.Errors.MissingTabId', undefined, locale),
            }),
            { status: 400 },
        );
    }

    try {
        if (!db?.chat) throw new Error('Chat repository not available');

        const session = await db.chat.findCopilotSessionByTab({ teamId, userId, tabId });
        return NextResponse.json(
            ResponseUtil.success({
                session: session ? serializeSession(session) : null,
            }),
            { status: 200 },
        );
    } catch (error) {
        if (error instanceof DatabaseError) {
            const status = error.code === 403 ? 403 : error.code === 404 ? 404 : 500;
            return NextResponse.json(
                ResponseUtil.error({
                    code:
                        status === 403
                            ? ErrorCodes.UNAUTHORIZED
                            : status === 404
                                ? ErrorCodes.NOT_FOUND
                                : ErrorCodes.DATABASE_ERROR,
                    message: error.message,
                }),
                { status },
            );
        }

        console.error('[chat] get copilot session failed', error);
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.DATABASE_ERROR,
                message: translateApi('Api.Chat.Errors.FetchCopilotSessionFailed', undefined, locale),
            }),
            { status: 500 },
        );
    }
});
