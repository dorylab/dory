// chat/core/api.ts
import type { ChatMode, ChatSessionItem } from './types';
import type { UIMessage } from 'ai';
import { toUIMessage } from './utils';
import type { CopilotEnvelopeV1 } from '../copilot/types/copilot-envelope';
import { authFetch } from '@/lib/client/auth-fetch';

type ApiEnvelope<T> = {
    code: number;
    message?: string;
    data?: T;
};

export type ChatSessionDetailResponse = {
    session: ChatSessionItem;
    messages: Array<{
        id: string;
        role: string;
        parts: unknown;
        metadata?: Record<string, unknown> | null;
    }>;
};

function assertOk<T>(res: Response, data: ApiEnvelope<T>, fallback: string) {
    if (!res.ok || !data || data.code !== 0) {
        throw new Error(data?.message || fallback);
    }
}

export async function apiFetchSessions(params?: { mode?: ChatMode; errorMessage?: string }) {
    const type = params?.mode ?? 'global';
    const res = await authFetch(`/api/chat/sessions?type=${encodeURIComponent(type)}`, {
        method: 'GET',
        cache: 'no-store',
    });

    const data = (await res.json()) as ApiEnvelope<{ sessions: ChatSessionItem[] }>;
    assertOk(res, data, params?.errorMessage ?? 'Failed to fetch sessions');

    return (data.data?.sessions ?? []) as ChatSessionItem[];
}

export async function apiFetchSessionDetail(sessionId: string, options?: { errorMessage?: string }) {
    const res = await authFetch(`/api/chat/session/${encodeURIComponent(sessionId)}`, {
        method: 'GET',
        cache: 'no-store',
    });

    const data = (await res.json()) as ApiEnvelope<ChatSessionDetailResponse>;
    assertOk(res, data, options?.errorMessage ?? 'Failed to fetch session details');

    const detail = data.data as ChatSessionDetailResponse;
    const messages: UIMessage[] = Array.isArray(detail?.messages) ? detail.messages.map(toUIMessage) : [];
    return { detail, messages };
}

export async function apiCreateSession(params: { mode: ChatMode; errorMessage?: string; copilotNotSupportedMessage?: string }) {
    if (params.mode === 'copilot') {
        throw new Error(params.copilotNotSupportedMessage ?? 'Copilot sessions cannot be created manually.');
    }

    const res = await authFetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
            type: 'global',
        }),
    });

    const data = (await res.json()) as ApiEnvelope<{ session: ChatSessionItem | null }>;
    assertOk(res, data, params.errorMessage ?? 'Failed to create session');

    return (data.data?.session ?? null) as ChatSessionItem | null;
}

export async function apiRenameSession(params: { sessionId: string; title: string; errorMessage?: string }) {
    const res = await authFetch(`/api/chat/session/${encodeURIComponent(params.sessionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ title: params.title }),
    });

    const data = (await res.json()) as ApiEnvelope<{}>;
    assertOk(res, data, params.errorMessage ?? 'Failed to rename session');
}

export async function apiDeleteSession(sessionId: string, options?: { errorMessage?: string }) {
    const res = await authFetch(`/api/chat/session/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        cache: 'no-store',
    });

    const data = (await res.json()) as ApiEnvelope<{}>;
    assertOk(res, data, options?.errorMessage ?? 'Failed to delete session');
}

export async function apiGetOrCreateCopilotSession(input: { envelope?: CopilotEnvelopeV1 | null; errorMessage?: string }) {
    const res = await authFetch('/api/chat/session/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(input),
    });

    const data = (await res.json()) as ApiEnvelope<{ session: ChatSessionItem }>;
    assertOk(res, data, input.errorMessage ?? 'Failed to fetch Copilot session');

    return data.data!.session;
}

export async function apiFetchCopilotSession(params: { tabId: string; errorMessage?: string }) {
    const res = await authFetch(`/api/chat/session/copilot?tabId=${encodeURIComponent(params.tabId)}`, {
        method: 'GET',
        cache: 'no-store',
    });

    const data = (await res.json()) as ApiEnvelope<{ session: ChatSessionItem | null }>;
    assertOk(res, data, params.errorMessage ?? 'Failed to fetch Copilot session');

    return (data.data?.session ?? null) as ChatSessionItem | null;
}
