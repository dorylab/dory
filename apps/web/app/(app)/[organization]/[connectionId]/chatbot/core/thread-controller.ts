// chat/core/thread-controller.ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { toast } from 'sonner';
import { authFetch } from '@/lib/client/auth-fetch';
import { useTranslations } from 'next-intl';

import type { ChatMode } from './types';
import type { CopilotEnvelopeV1 } from '../copilot/types/copilot-envelope';


import { normalizeMessage } from '@/app/api/chat/utils';

type SendOptions = {
    model?: string | null;
    webSearch?: boolean;
};

type UseChatThreadParams = {
    mode: ChatMode;

    
    sessionId: string | null;
    initialMessages: UIMessage[];

    // copilot
    copilotEnvelope?: CopilotEnvelopeV1 | null;

    
    onConversationActivity?: () => void;

    
    onReloadSessionDetail?: (sessionId: string) => Promise<void> | void;
};

export function useChatThread(params: UseChatThreadParams) {
    const { mode, sessionId, initialMessages, copilotEnvelope, onConversationActivity, onReloadSessionDetail } = params;
    const t = useTranslations('Chatbot');

    const [messages, setMessages] = useState<UIMessage[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const lastSessionIdRef = useRef<string | null>(null);

    
    useEffect(() => {
        if (lastSessionIdRef.current !== sessionId) {
            lastSessionIdRef.current = sessionId;
            const normalized = Array.isArray(initialMessages) ? initialMessages.map(m => (typeof normalizeMessage === 'function' ? normalizeMessage(m) : m)) : [];
            setMessages(normalized);
            setInput('');
            setIsStreaming(false);
            abortRef.current?.abort();
            abortRef.current = null;
            return;
        }

        
        const normalized = Array.isArray(initialMessages) ? initialMessages.map(m => (typeof normalizeMessage === 'function' ? normalizeMessage(m) : m)) : [];
        setMessages(normalized);
    }, [sessionId, initialMessages]);

    const canSend = useMemo(() => {
        return Boolean(sessionId) && !isStreaming && input.trim().length > 0;
    }, [sessionId, isStreaming, input]);

    const stop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsStreaming(false);
    }, []);

    const send = useCallback(
        async (opts?: SendOptions) => {
            if (!sessionId) {
                toast.error(t('Errors.SessionNotSelected'));
                return;
            }
            const text = input.trim();
            if (!text) return;
            if (isStreaming) return;

            
            const userMsg: UIMessage = {
                id: `msg_${Math.random().toString(16).slice(2)}`,
                role: 'user',
                parts: [{ type: 'text', text }],
            } as any;

            const nextMessages = [...messages, userMsg].map(m => (typeof normalizeMessage === 'function' ? normalizeMessage(m) : m));

            setMessages(nextMessages);
            setInput('');
            setIsStreaming(true);

            
            const tabId = mode === 'copilot' ? (copilotEnvelope?.meta?.tabId ?? null) : null;

            const connectionId = copilotEnvelope?.meta?.connectionId ?? null;

            const database =
                copilotEnvelope?.surface === 'sql'
                    ? copilotEnvelope.context.baseline.database ?? null
                    : copilotEnvelope?.context.database ?? null;

            const table =
                copilotEnvelope?.surface === 'table'
                    ? copilotEnvelope.context.table.name ?? null
                    : null;

            const controller = new AbortController();
            abortRef.current = controller;

            
            
            try {
                const res = await authFetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    signal: controller.signal,
                    body: JSON.stringify({
                        id: `req_${Date.now()}`,
                        chatId: sessionId, 
                        tabId, 
                        connectionId,
                        database,
                        table,
                        model: opts?.model ?? null,
                        webSearch: Boolean(opts?.webSearch),
                        messages: nextMessages,
                    }),
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || t('Errors.RequestFailed'));
                }

                
                const returnedChatId = res.headers.get('x-chat-id');
                

                
                
                
                
                
                
                //
                
                

                
                const reader = res.body?.getReader();
                if (reader) {
                    
                    
                    while (true) {
                        const { done } = await reader.read();
                        if (done) break;
                    }
                }

                
                if (typeof onReloadSessionDetail === 'function') {
                    await onReloadSessionDetail(sessionId);
                }

                
                onConversationActivity?.();
            } catch (e: any) {
                if (e?.name === 'AbortError') return;

                console.error('[chat] send failed', e);
                toast.error(e?.message || t('Errors.SendFailed'));

                
                setMessages(prev => prev.slice(0, -1));
            } finally {
                setIsStreaming(false);
                abortRef.current = null;
            }
        },
        [mode, sessionId, messages, input, isStreaming, copilotEnvelope, onConversationActivity, onReloadSessionDetail, t],
    );

    const reloadSession = useCallback(async () => {
        if (!sessionId) return;
        await onReloadSessionDetail?.(sessionId);
    }, [sessionId, onReloadSessionDetail]);

    return {
        // state
        messages,
        input,
        isStreaming,
        canSend,

        // actions
        setInput,
        send,
        stop,
        reloadSession,
        setMessages,
    };
}
