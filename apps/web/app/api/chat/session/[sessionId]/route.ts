// app/api/chat/session/[sessionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import type { ChatMessageRecord, ChatSessionRecord } from '@/types';
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

function serializeMessage(message: ChatMessageRecord) {
    return {
        id: message.id,
        sessionId: message.sessionId,
        userId: message.userId,
        role: message.role,
        sequence: message.sequence,
        parts: message.parts,
        metadata: message.metadata ?? null,
        createdAt: toIso(message.createdAt),
    };
}

/**
 * GET /api/chat/sessions/:sessionId
 * => { session, messages }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
    return withUserAndTeamHandler(async ({ db, userId, teamId }) => {
        const locale = await getApiLocale();
        const { sessionId } = await params;
        console.log('Fetching chat session detail for sessionId:', sessionId);
        if (!sessionId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: translateApi('Api.Chat.Errors.MissingSessionId', undefined, locale),
                }),
                { status: 400 },
            );
        }

        try {
            if (!db?.chat) throw new Error('Chat repository not available');

            const sessionRecord = await db.chat.readSession({
                teamId,
                sessionId,
                actorUserId: userId,
            });

            if (!sessionRecord) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.NOT_FOUND,
                        message: translateApi('Api.Chat.Errors.SessionNotFound', undefined, locale),
                    }),
                    { status: 404 },
                );
            }

            const messages = await db.chat.listMessages({
                teamId,
                sessionId,
                actorUserId: userId,
                
            });

            return NextResponse.json(
                ResponseUtil.success({
                    session: serializeSession(sessionRecord),
                    messages: messages.map(serializeMessage),
                }),
                { status: 200 },
            );
        } catch (error) {
            if (error instanceof DatabaseError) {
                const status = error.code === 403 ? 403 : error.code === 404 ? 404 : 500;
                return NextResponse.json(
                    ResponseUtil.error({
                        code: status === 403 ? ErrorCodes.UNAUTHORIZED : status === 404 ? ErrorCodes.NOT_FOUND : ErrorCodes.DATABASE_ERROR,
                        message: error.message,
                    }),
                    { status },
                );
            }

            console.error('[chat] fetch session detail failed', error);
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.DATABASE_ERROR,
                    message: translateApi('Api.Chat.Errors.FetchSessionFailed', undefined, locale),
                }),
                { status: 500 },
            );
        }
    })(req);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
    return withUserAndTeamHandler(async ({ db, userId, teamId }) => {
        const locale = await getApiLocale();
        const { sessionId } = await params
        if (!sessionId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: translateApi('Api.Chat.Errors.MissingSessionId', undefined, locale),
                }),
                { status: 400 },
            );
        }

        let payload: any = null;
        try {
            payload = await req.json();
        } catch {
            payload = null;
        }

        const patch: { title?: string | null; metadata?: Record<string, unknown> | null } = {};
        let hasPayload = false;

        if (payload && Object.prototype.hasOwnProperty.call(payload, 'title')) {
            hasPayload = true;
            if (typeof payload.title === 'string') patch.title = payload.title;
            else if (payload.title === null) patch.title = null;
            else {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.BAD_REQUEST,
                        message: translateApi('Api.Chat.Errors.InvalidTitle', undefined, locale),
                    }),
                    { status: 400 },
                );
            }
        }

        if (payload && Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
            hasPayload = true;
            if (payload.metadata === null || typeof payload.metadata === 'object') patch.metadata = payload.metadata;
            else {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.BAD_REQUEST,
                        message: translateApi('Api.Chat.Errors.InvalidMetadata', undefined, locale),
                    }),
                    { status: 400 },
                );
            }
        }

        if (!hasPayload) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.BAD_REQUEST,
                    message: translateApi('Api.Chat.Errors.MissingUpdatePayload', undefined, locale),
                }),
                { status: 400 },
            );
        }

        try {
            if (!db?.chat) throw new Error('Chat repository not available');

            const updated = await db.chat.updateSession({
                teamId,
                sessionId,
                actorUserId: userId,
                patch,
            });

            return NextResponse.json(ResponseUtil.success({ session: serializeSession(updated) }), { status: 200 });
        } catch (error) {
            if (error instanceof DatabaseError) {
                const status = error.code === 403 ? 403 : error.code === 404 ? 404 : 500;
                return NextResponse.json(
                    ResponseUtil.error({
                        code: status === 403 ? ErrorCodes.UNAUTHORIZED : status === 404 ? ErrorCodes.NOT_FOUND : ErrorCodes.DATABASE_ERROR,
                        message: error.message,
                    }),
                    { status },
                );
            }

            console.error('[chat] update session failed', error);
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.DATABASE_ERROR,
                    message: translateApi('Api.Chat.Errors.UpdateSessionFailed', undefined, locale),
                }),
                { status: 500 },
            );
        }
    })(req);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
    return withUserAndTeamHandler(async ({ db, userId, teamId }) => {
        const locale = await getApiLocale();
        const { sessionId } = await params
        if (!sessionId) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.INVALID_PARAMS,
                    message: translateApi('Api.Chat.Errors.MissingSessionId', undefined, locale),
                }),
                { status: 400 },
            );
        }

        try {
            if (!db?.chat) throw new Error('Chat repository not available');

            
            if (typeof (db.chat as any).archiveSession === 'function') {
                await (db.chat as any).archiveSession({ teamId, sessionId, actorUserId: userId });
            } else {
                
                await (db.chat as any).deleteSession({ teamId, sessionId, actorUserId: userId });
            }

            return NextResponse.json(ResponseUtil.success(), { status: 200 });
        } catch (error) {
            if (error instanceof DatabaseError) {
                const status = error.code === 403 ? 403 : error.code === 404 ? 404 : 500;
                return NextResponse.json(
                    ResponseUtil.error({
                        code: status === 403 ? ErrorCodes.UNAUTHORIZED : status === 404 ? ErrorCodes.NOT_FOUND : ErrorCodes.DATABASE_ERROR,
                        message: error.message,
                    }),
                    { status },
                );
            }

            console.error('[chat] delete session failed', error);
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.DATABASE_ERROR,
                    message: translateApi('Api.Chat.Errors.DeleteSessionFailed', undefined, locale),
                }),
                { status: 500 },
            );
        }
    })(req);
}
