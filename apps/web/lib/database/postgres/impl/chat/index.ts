import { getClient } from '@/lib/database/postgres/client';
import { chatMessages, chatSessions } from '@/lib/database/postgres/schemas';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { translateDatabase } from '@/lib/database/i18n';

import { newEntityId } from '@/lib/id';

import type {
    ChatMessageInsert,
    ChatMessageRecord,
    ChatRepository,
    ChatSessionCreateGlobal,
    ChatSessionCreateOrGetCopilot,
    ChatSessionRecord,
    ChatSessionType,
    ChatSessionUpdate,
    PostgresDBClient,
} from '@/types';

type DBLike = PostgresDBClient;

export class PostgresChatRepository implements ChatRepository {
    private db!: PostgresDBClient;

    private deriveTitleFromParts(parts: ChatMessageInsert['parts']) {
        if (!Array.isArray(parts)) return null;
        const textPart = parts.find(part => part?.type === 'text' && typeof (part as any).text === 'string');
        const codePart = parts.find(part => part?.type === 'code' && typeof (part as any).text === 'string');
        const raw = (textPart as any)?.text ?? (codePart as any)?.text ?? '';
        const normalized = raw.replace(/\s+/g, ' ').trim();
        if (!normalized) return null;
        return normalized.length > 60 ? `${normalized.slice(0, 60)}...` : normalized;
    }

    async init(): Promise<void> {
        try {
            this.db = (await getClient()) as PostgresDBClient;
        } catch (error) {
            console.error(translateDatabase('Database.Logs.ChatRepoInitFailed'), error);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError(translateDatabase('Database.Errors.NotInitialized'), 500);
    }

    /**
     * ✅ Unified session permission + state checks
     * - owner check
     * - strict team match
     * - archived is write-prohibited by default
     */
    private async assertSessionAccessOn(
        db: DBLike,
        params: {
            teamId: string;
            sessionId: string;
            actorUserId: string;
            allowArchived?: boolean;
        },
    ) {
        console.log('Asserting session access with params:', params);
        const [session] = await db
            .select({
                id: chatSessions.id,
                teamId: chatSessions.teamId,
                userId: chatSessions.userId,
                archivedAt: chatSessions.archivedAt,
                type: chatSessions.type,
                title: chatSessions.title,
            })
            .from(chatSessions)
            .where(and(eq(chatSessions.id, params.sessionId), eq(chatSessions.teamId, params.teamId)));

        if (!session) throw new DatabaseError(translateDatabase('Database.Errors.ChatSessionNotFound'), 404);
        if (session.userId !== params.actorUserId) {
            throw new DatabaseError(translateDatabase('Database.Errors.ChatSessionForbidden'), 403);
        }

        if (!params.allowArchived && session.archivedAt) {
            throw new DatabaseError(translateDatabase('Database.Errors.ChatSessionArchived'), 409);
        }

        return session;
    }

    private async assertSessionAccess(params: {
        teamId: string;
        sessionId: string;
        actorUserId: string;
        allowArchived?: boolean;
    }) {
        this.assertInited();
        return this.assertSessionAccessOn(this.db, params);
    }

    /**
     * ✅ createOrGet Copilot Session (concurrency-safe)
     */
    async createOrGetCopilotSession(
        input: ChatSessionCreateOrGetCopilot,
    ): Promise<ChatSessionRecord> {
        this.assertInited();

        const now = new Date();
        const id = newEntityId();

        const result = await this.db.execute(sql`
      INSERT INTO chat_sessions (
        id, team_id, user_id, type, tab_id,
        connection_id, active_database, active_schema,
        title, settings, metadata,
        created_at, updated_at, archived_at, last_message_at
      ) VALUES (
        ${id}, ${input.teamId}, ${input.userId}, 'copilot', ${input.tabId},
        ${input.connectionId ?? null}, ${input.activeDatabase ?? null}, ${input.activeSchema ?? null},
        ${input.title ?? null}, ${input.settings ?? null}, ${input.metadata ?? null},
        ${now}, ${now}, NULL, NULL
      )
      ON CONFLICT (team_id, user_id, tab_id) WHERE type = 'copilot'
      DO UPDATE SET
        connection_id = COALESCE(EXCLUDED.connection_id, chat_sessions.connection_id),
        active_database = COALESCE(EXCLUDED.active_database, chat_sessions.active_database),
        active_schema = COALESCE(EXCLUDED.active_schema, chat_sessions.active_schema),
        title = COALESCE(EXCLUDED.title, chat_sessions.title),
        settings = COALESCE(EXCLUDED.settings, chat_sessions.settings),
        metadata = COALESCE(EXCLUDED.metadata, chat_sessions.metadata),
        updated_at = ${now},
        archived_at = NULL
      RETURNING *;
    `);

        const row = (result as any)?.rows?.[0] ?? (result as any)?.[0];
        if (!row) throw new DatabaseError(translateDatabase('Database.Errors.ChatCopilotSessionFailed'), 500);
        return row as ChatSessionRecord;
    }

    async findCopilotSessionByTab(params: { teamId: string; userId: string; tabId: string }): Promise<ChatSessionRecord | null> {
        this.assertInited();

        const [record] = await this.db
            .select()
            .from(chatSessions)
            .where(
                and(
                    eq(chatSessions.teamId, params.teamId),
                    eq(chatSessions.userId, params.userId),
                    eq(chatSessions.tabId, params.tabId),
                    eq(chatSessions.type, 'copilot'),
                ),
            );

        return (record as ChatSessionRecord | undefined) ?? null;
    }

    /**
     * ✅ create Global Session (multiple allowed)
     */
    async createGlobalSession(input: ChatSessionCreateGlobal): Promise<ChatSessionRecord> {
        this.assertInited();

        const now = new Date();
        const id = input.id ?? newEntityId();

        const result = await this.db
            .insert(chatSessions)
            .values({
                id,
                teamId: input.teamId,
                userId: input.userId,
                type: 'global',
                tabId: null,
                connectionId: input.connectionId ?? null,
                activeDatabase: input.activeDatabase ?? null,
                activeSchema: input.activeSchema ?? null,
                title: input.title ?? null,
                settings: input.settings ?? null,
                metadata: input.metadata ?? null,
                createdAt: now,
                updatedAt: now,
                archivedAt: null,
                lastMessageAt: null,
            })
            .returning();

        const row = result?.[0];
        if (!row) throw new DatabaseError(translateDatabase('Database.Errors.ChatGlobalSessionFailed'), 500);
        return row as ChatSessionRecord;
    }

    async listSessions(params: {
        teamId: string;
        userId: string;
        includeArchived?: boolean;
        type?: ChatSessionType;
    }) {
        this.assertInited();

        const conds = [eq(chatSessions.teamId, params.teamId), eq(chatSessions.userId, params.userId)];
        if (!params.includeArchived) conds.push(isNull(chatSessions.archivedAt));
        if (params.type) conds.push(eq(chatSessions.type, params.type));

        const rows = await this.db
            .select()
            .from(chatSessions)
            .where(and(...conds))
            .orderBy(desc(chatSessions.lastMessageAt), desc(chatSessions.updatedAt));

        return rows as ChatSessionRecord[];
    }

    async readSession(params: {
        teamId: string;
        sessionId: string;
        actorUserId: string;
    }) {
        this.assertInited();
        await this.assertSessionAccess(params);

        const [record] = await this.db
            .select()
            .from(chatSessions)
            .where(and(eq(chatSessions.id, params.sessionId), eq(chatSessions.teamId, params.teamId)));

        return (record as ChatSessionRecord | undefined) ?? null;
    }

    async updateSession(params: {
        teamId: string;
        sessionId: string;
        actorUserId: string;
        patch: ChatSessionUpdate;
    }) {
        this.assertInited();
        await this.assertSessionAccess(params);

        const data = params.patch;
        const updatePayload: Record<string, any> = {};
        let hasChanges = false;

        const assign = (key: string, value: any) => {
            updatePayload[key] = value ?? null;
            hasChanges = true;
        };

        if (data.title !== undefined) assign('title', data.title);
        if (data.metadata !== undefined) assign('metadata', data.metadata);
        if ((data as any).settings !== undefined) assign('settings', (data as any).settings);
        if ((data as any).connectionId !== undefined) assign('connectionId', (data as any).connectionId);
        if ((data as any).activeDatabase !== undefined) assign('activeDatabase', (data as any).activeDatabase);
        if ((data as any).activeSchema !== undefined) assign('activeSchema', (data as any).activeSchema);
        if ((data as any).archivedAt !== undefined) assign('archivedAt', (data as any).archivedAt);

        if (hasChanges) {
            await this.db
                .update(chatSessions)
                .set({ ...updatePayload, updatedAt: new Date() } as any)
                .where(and(eq(chatSessions.id, params.sessionId), eq(chatSessions.teamId, params.teamId)));
        }

        const [updated] = await this.db
            .select()
            .from(chatSessions)
            .where(and(eq(chatSessions.id, params.sessionId), eq(chatSessions.teamId, params.teamId)));

        if (!updated) throw new DatabaseError(translateDatabase('Database.Errors.ChatUpdateSessionNotFound'), 404);
        return updated as ChatSessionRecord;
    }

    async archiveSession(params: {
        teamId: string;
        sessionId: string;
        actorUserId: string;
    }) {
        this.assertInited();
        await this.assertSessionAccess(params);

        await this.db
            .update(chatSessions)
            .set({ archivedAt: new Date(), updatedAt: new Date() } as any)
            .where(and(eq(chatSessions.id, params.sessionId), eq(chatSessions.teamId, params.teamId)));
    }

    /**
     * ✅ append-only
     * - strict consistency checks
     * - archived not allowed
     * - lastMessageAt is monotonic (avoid rollback)
     */
    async appendMessage(params: {
        teamId: string;
        sessionId: string;
        actorUserId: string;
        message: ChatMessageInsert;
    }): Promise<ChatMessageRecord> {
        this.assertInited();

        const now = new Date();
        const messageId = params.message.id ?? newEntityId();

        return await this.db.transaction(async tx => {
            const session = await this.assertSessionAccessOn(tx as any, {
                teamId: params.teamId,
                sessionId: params.sessionId,
                actorUserId: params.actorUserId,
                allowArchived: false,
            });

            const normalizedUserId =
                params.message.role === 'user'
                    ? params.actorUserId
                    : params.message.userId ?? null;

            const shouldAutoTitle =
                session.type === 'global' &&
                params.message.role === 'user' &&
                (!session.title || !session.title.trim());
            const autoTitle = shouldAutoTitle ? this.deriveTitleFromParts(params.message.parts) : null;

            const [inserted] = await (tx as any)
                .insert(chatMessages)
                .values({
                    id: messageId,
                    teamId: params.teamId,
                    sessionId: params.sessionId,
                    userId: normalizedUserId,
                    connectionId: params.message.connectionId ?? null,
                    role: params.message.role,
                    parts: params.message.parts as any,
                    metadata: params.message.metadata ?? null,
                    createdAt: now,
                } as any)
                .returning();

            await (tx as any)
                .update(chatSessions)
                .set({
                    lastMessageAt: sql`GREATEST(COALESCE(${chatSessions.lastMessageAt}, ${now}), ${now})`,
                    updatedAt: now,
                    ...(autoTitle ? { title: autoTitle } : {}),
                } as any)
                .where(and(eq(chatSessions.id, params.sessionId), eq(chatSessions.teamId, params.teamId)));

            if (!inserted) throw new DatabaseError(translateDatabase('Database.Errors.ChatInsertMessageFailed'), 500);
            return inserted as ChatMessageRecord;
        });
    }

    async listMessages(params: {
        teamId: string;
        sessionId: string;
        actorUserId: string;
        limit?: number;
    }) {
        this.assertInited();
        await this.assertSessionAccess(params);

        let q = this.db
            .select()
            .from(chatMessages)
            .where(and(eq(chatMessages.teamId, params.teamId), eq(chatMessages.sessionId, params.sessionId)))
            .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));

        if (params.limit && params.limit > 0) q = (q as any).limit(params.limit);

        const rows = await q;
        return rows as ChatMessageRecord[];
    }
}
