// -----------------------------
// Session
// -----------------------------

export type ChatSessionType = 'copilot' | 'global' | 'task';

export interface ChatSessionSettings {
    model?: string; // e.g. "gpt-5.2"
    temperature?: number;
    top_p?: number;
    maxOutputTokens?: number;
    systemPrompt?: string;
    toolsEnabled?: boolean;
    [k: string]: unknown;
}

export interface ChatSessionRecord {
    id: string;

    teamId: string;
    userId: string;

    type: ChatSessionType;

    // copilot 必填；global 必须为空（由 DB check 保证）
    tabId: string | null;

    connectionId: string | null;
    activeDatabase: string | null;
    activeSchema: string | null;

    title: string | null;
    settings: ChatSessionSettings | null;
    metadata: Record<string, unknown> | null;

    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
    lastMessageAt: Date | null;
}

export interface ChatSessionCreateGlobal {
    id?: string;
    teamId: string;
    userId: string;

    type?: 'global';
    connectionId?: string | null;
    activeDatabase?: string | null;
    activeSchema?: string | null;

    title?: string | null;
    settings?: ChatSessionSettings | null;
    metadata?: Record<string, unknown> | null;
}

export interface ChatSessionCreateOrGetCopilot {
    teamId: string;
    userId: string;
    tabId: string;

    connectionId?: string | null;
    activeDatabase?: string | null;
    activeSchema?: string | null;

    title?: string | null;
    settings?: ChatSessionSettings | null;
    metadata?: Record<string, unknown> | null;
}

export interface ChatSessionUpdate {
    title?: string | null;
    metadata?: Record<string, unknown> | null;
    settings?: ChatSessionSettings | null;

    connectionId?: string | null;
    activeDatabase?: string | null;
    activeSchema?: string | null;

    archivedAt?: Date | null;
}

export interface ChatSessionPatchById {
    id: string;
    teamId: string;
    userId: string;

    title?: string | null;
    metadata?: Record<string, unknown> | null;
    settings?: ChatSessionSettings | null;

    connectionId?: string | null;
    activeDatabase?: string | null;
    activeSchema?: string | null;

    archivedAt?: Date | null;
    lastMessageAt?: Date | null;
}


export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessagePart =
    | { type: 'text'; text: string }
    | { type: 'code'; lang?: string; text: string }
    | {
          type: 'action';
          name: 'apply_sql';
          payload: {
              mode: 'replace_selection' | 'replace_all' | 'insert_at_cursor';
              sql: string;
          };
      }
    | {
          type: 'tool_call';
          tool: string;
          callId: string;
          args: Record<string, unknown>;
      }
    | {
          type: 'tool_result';
          callId: string;
          ok: boolean;
          result?: unknown;
          error?: string;
      };

export interface ChatMessageMetadata {
    model?: string;
    latencyMs?: number;
    tokenUsage?: { input?: number; output?: number; total?: number };
    requestId?: string;
    error?: { message: string; code?: string };
    [k: string]: unknown;
}

export interface ChatMessageRecord {
    id: string;

    teamId: string;
    sessionId: string;

    userId: string | null;
    connectionId: string | null;

    role: ChatRole;

    parts: ChatMessagePart[];
    metadata: ChatMessageMetadata | null;

    createdAt: Date;

    sequence: string;
}

export interface ChatMessageInsert {
    id?: string;

    teamId: string;
    sessionId: string;

    userId?: string | null;
    connectionId?: string | null;

    role: ChatRole;

    parts: ChatMessagePart[];
    metadata?: ChatMessageMetadata | null;

    createdAt?: Date;
}

export interface ChatRepository {
    init(): Promise<void>;

    createOrGetCopilotSession(input: ChatSessionCreateOrGetCopilot): Promise<ChatSessionRecord>;
    findCopilotSessionByTab(params: { teamId: string; userId: string; tabId: string }): Promise<ChatSessionRecord | null>;

    createGlobalSession(input: ChatSessionCreateGlobal): Promise<ChatSessionRecord>;

    listSessions(params: { teamId: string; userId: string; includeArchived?: boolean; type?: ChatSessionType }): Promise<ChatSessionRecord[]>;

    readSession(params: { teamId: string; sessionId: string; actorUserId: string }): Promise<ChatSessionRecord | null>;

    updateSession(params: { teamId: string; sessionId: string; actorUserId: string; patch: ChatSessionUpdate }): Promise<ChatSessionRecord>;

    archiveSession(params: { teamId: string; sessionId: string; actorUserId: string }): Promise<void>;

    appendMessage(params: {
        teamId: string;
        sessionId: string;
        actorUserId: string;
        message: ChatMessageInsert;
    }): Promise<ChatMessageRecord>;

    listMessages(params: { teamId: string; sessionId: string; actorUserId: string; limit?: number }): Promise<ChatMessageRecord[]>;
}
