import type { UIMessage } from 'ai';

import { getSqlResultFromPart } from '@/lib/agent-runs/sql-result';
// chat/core/utils.ts

import { DEFAULT_TITLE, type ChatSessionItem } from './types';

export { getSqlResultFromPart };

export { getChartResultFromPart } from '@/lib/agent-runs/chart-result';

export function extractGeneratedSqlFromAssistantMessage(message: UIMessage | null): string | null {
    if (!message || message.role !== 'assistant' || !Array.isArray(message.parts)) {
        return null;
    }

    for (const part of message.parts) {
        const sqlResult = getSqlResultFromPart(part);
        if (sqlResult?.sql?.trim()) {
            return sqlResult.sql.trim();
        }
    }

    const text = message.parts
        .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
        .map((part: any) => part.text)
        .join('\n')
        .trim();

    if (!text) {
        return null;
    }

    const fencedMatch = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? text;
    const normalized = candidate.replace(/^\s*sql\s*/i, '').trim();

    return normalized || null;
}

export const normalizeSessionTitle = (title?: string | null, fallback?: string) => {
    const t = title?.trim();
    return t && t.length > 0 ? t : (fallback ?? DEFAULT_TITLE);
};

export const toUIMessage = (message: { id: string; role: string; parts: unknown; metadata?: Record<string, unknown> | null }): UIMessage => {
    const parts = Array.isArray(message.parts) ? message.parts : typeof message.parts === 'string' ? [{ type: 'text', text: message.parts }] : [];

    return {
        id: message.id,
        role: message.role as UIMessage['role'],
        parts: parts as UIMessage['parts'],
        ...(message.metadata ? { metadata: message.metadata } : {}),
    };
};

export const normalizeSessionsForDisplay = (sessions: ChatSessionItem[], fallback?: string) => sessions.map(s => ({ ...s, title: normalizeSessionTitle(s.title, fallback) }));
