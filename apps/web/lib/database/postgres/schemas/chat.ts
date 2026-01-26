import { pgTable, text, timestamp, jsonb, integer, index, uniqueIndex, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { newEntityId } from '@/lib/id';

/**
 * chat_sessions (v2 mature) - no FKs
 */
export const chatSessions = pgTable(
    'chat_sessions',
    {
        id: text('id').primaryKey().$defaultFn(() => newEntityId()),

        teamId: text('team_id').notNull(),
        userId: text('user_id').notNull(),

        // 'copilot' | 'global' | 'task'(future)
        type: text('type').notNull().default('copilot'),

        // copilot required: bind SQL tab
        tabId: text('tab_id'),

        // Store one connection at session level
        connectionId: text('connection_id'),

        // Low-frequency context (default scope)
        activeDatabase: text('active_database'),
        activeSchema: text('active_schema'),

        title: text('title'),

        settings: jsonb('settings').$type<Record<string, unknown> | null>(),
        metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),

        archivedAt: timestamp('archived_at', { withTimezone: true }),

        lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    },
    t => [
        // Composite unique: enforce team consistency for messages/state (app-level)
        unique('uq_chat_sessions_id_team').on(t.id, t.teamId),

        // Type constraint: copilot must have tabId; non-copilot must not
        check(
            'ck_chat_sessions_type_tab',
            sql`((${t.type} = 'copilot' AND ${t.tabId} IS NOT NULL) OR (${t.type} <> 'copilot' AND ${t.tabId} IS NULL))`,
        ),

        // List index (active sessions)
        index('idx_chat_sessions_list').on(t.teamId, t.userId, t.archivedAt, t.lastMessageAt),
        index('idx_chat_sessions_team_user_type').on(t.teamId, t.userId, t.type),

        // Common filters: by connection / db
        index('idx_chat_sessions_team_conn').on(t.teamId, t.connectionId),
        index('idx_chat_sessions_team_db').on(t.teamId, t.activeDatabase),

        // Tab -> session uniqueness (copilot), partial unique
        uniqueIndex('uidx_chat_sessions_copilot_tab')
            .on(t.teamId, t.userId, t.tabId)
            .where(sql`${t.type} = 'copilot'`),
    ],
);

/**
 * chat_messages (v2 mature) - no FKs
 */
export const chatMessages = pgTable(
    'chat_messages',
    {
        id: text('id').primaryKey().$defaultFn(() => newEntityId()),

        teamId: text('team_id').notNull(),
        sessionId: text('session_id').notNull(),

        // Sender (user messages filled; assistant/tool can be null)
        userId: text('user_id'),

        // Optional: record which connection produced the message (for audit)
        connectionId: text('connection_id'),

        // 'system' | 'user' | 'assistant' | 'tool'
        role: text('role').notNull(),

        parts: jsonb('parts').notNull(),
        metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        // Fetch messages by time/insert order
        index('idx_chat_messages_session_time').on(t.teamId, t.sessionId, t.createdAt),
        index('idx_chat_messages_session_id').on(t.teamId, t.sessionId, t.id),

        // Audit/troubleshoot by connection
        index('idx_chat_messages_team_conn_time').on(t.teamId, t.connectionId, t.createdAt),
    ],
);

/**
 * chat_session_state (v2 mature) - no FKs
 */
export const chatSessionState = pgTable(
    'chat_session_state',
    {
        sessionId: text('session_id').primaryKey(),
        teamId: text('team_id').notNull(),

        // Redundant with session but speeds up queries
        connectionId: text('connection_id'),

        activeTabId: text('active_tab_id'),
        activeDatabase: text('active_database'),
        activeSchema: text('active_schema'),

        editorContext: jsonb('editor_context').$type<{
            sqlText?: string;
            selectionText?: string;
            cursorOffset?: number;
            mentionedTables?: string[];
        } | null>(),

        lastRunSummary: jsonb('last_run_summary').$type<{
            queryRunId?: string;
            resultId?: string;
            ok?: boolean;
            error?: string;
            columns?: string[];
            sampleRows?: unknown[];
            rowCount?: number;
            elapsedMs?: number;
        } | null>(),

        stableContext: jsonb('stable_context').$type<Record<string, unknown> | null>(),

        revision: integer('revision').notNull().default(0),

        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
    },
    t => [
        index('idx_chat_state_team_conn').on(t.teamId, t.connectionId),
        index('idx_chat_state_team_tab').on(t.teamId, t.activeTabId),
        index('idx_chat_state_team_updated').on(t.teamId, t.updatedAt),
    ],
);
