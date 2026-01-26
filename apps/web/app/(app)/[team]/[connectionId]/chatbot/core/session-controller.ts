// chat/core/session-controller.ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';

import type { ChatSessionItem, ChatMode } from './types';
import { normalizeSessionsForDisplay } from './utils';
import {
    apiCreateSession,
    apiDeleteSession,
    apiFetchSessionDetail,
    apiFetchSessions,
    apiFetchCopilotSession,
    apiRenameSession,
} from './api';
import type { CopilotEnvelopeV1 } from '../copilot/types/copilot-envelope';

export function useChatSessions(params: { mode: ChatMode; copilotEnvelope?: CopilotEnvelopeV1 | null }) {
    const { mode, copilotEnvelope } = params;
    const copilotTabId = copilotEnvelope?.meta?.tabId ?? null;
    const t = useTranslations('Chatbot');

    const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const selectedSessionRef = useRef<string | null>(null);
    const lastCopilotTabIdRef = useRef<string | null>(null);

    const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);

    const [creatingSession, setCreatingSession] = useState(false);

    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editingSessionValue, setEditingSessionValue] = useState('');
    const [renameSubmittingId, setRenameSubmittingId] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<ChatSessionItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        selectedSessionRef.current = selectedSessionId;
    }, [selectedSessionId]);

    const fetchSessions = useCallback(
        async (preferredId?: string | null) => {
            if (mode === 'copilot') {
                setLoadingSessions(false);
                return;
            }

            setLoadingSessions(true);
            try {
                const list = await apiFetchSessions({ mode: 'global', errorMessage: t('Errors.FetchSessions') });
                setSessions(list);

                const currentPreferred = preferredId ?? selectedSessionRef.current;
                if (list.length === 0) {
                    setSelectedSessionId(null);
                    setInitialMessages([]);
                    return;
                }

                const hasPreferred = currentPreferred && list.some(item => item.id === currentPreferred);
                setSelectedSessionId(hasPreferred ? (currentPreferred as string) : list[0].id);
            } catch (e: any) {
                console.error('[chat] fetch sessions failed', e);
                toast.error(e?.message || t('Errors.FetchSessions'));
            } finally {
                setLoadingSessions(false);
            }
        },
        [mode, t],
    );

    const fetchSessionDetail = useCallback(async (sessionId: string) => {
        setLoadingMessages(true);
        try {
            const { detail, messages } = await apiFetchSessionDetail(sessionId, { errorMessage: t('Errors.FetchSessionDetail') });

            console.log('[chat] fetch session detail', detail, messages);

            if (detail?.session) {
                setSessions(prev => {
                    
                    const exists = prev.some(item => item.id === detail.session.id);
                    if (!exists) return [detail.session, ...prev];
                    return prev.map(item => (item.id === detail.session.id ? detail.session : item));
                });
            }
            setInitialMessages(messages);
        } catch (e: any) {
            console.error('[chat] fetch session detail failed', e);
            toast.error(e?.message || t('Errors.FetchSessionDetail'));
            setInitialMessages([]);
        } finally {
            setLoadingMessages(false);
        }
    }, [t]);

    
    const ensureCopilotSession = useCallback(async () => {
        if (mode !== 'copilot') return;
        if (!copilotTabId) {
            lastCopilotTabIdRef.current = null;
            setSessions([]);
            setSelectedSessionId(null);
            setInitialMessages([]);
            setLoadingSessions(false);
            return;
        }

        const shouldSyncSession = lastCopilotTabIdRef.current !== copilotTabId || !selectedSessionRef.current;
        if (lastCopilotTabIdRef.current !== copilotTabId) {
            lastCopilotTabIdRef.current = copilotTabId;
            setSessions([]);
            setSelectedSessionId(null);
            setInitialMessages([]);
        }

        if (!shouldSyncSession) {
            setLoadingSessions(false);
            return;
        }

        setLoadingSessions(true);
        try {
            const session = await apiFetchCopilotSession({ tabId: copilotTabId, errorMessage: t('Errors.FetchCopilotSession') });
            if (session?.id) {
                setSelectedSessionId(session.id);
                await fetchSessionDetail(session.id);
            } else {
                if (!selectedSessionRef.current) {
                    setSelectedSessionId(null);
                    setInitialMessages([]);
                }
            }
        } catch (e: any) {
            console.error('[chat] fetch copilot session failed', e);
            toast.error(e?.message || t('Errors.FetchCopilotSession'));
            if (!selectedSessionRef.current) {
                setSelectedSessionId(null);
                setInitialMessages([]);
            }
        } finally {
            setLoadingSessions(false);
        }
    }, [mode, copilotTabId, fetchSessionDetail, t]);

    
    useEffect(() => {
        if (mode === 'copilot') {
            ensureCopilotSession().catch(() => undefined);
        } else {
            fetchSessions().catch(() => undefined);
        }
    }, [mode, fetchSessions, ensureCopilotSession]);

    
    useEffect(() => {
        if (!selectedSessionId) {
            setInitialMessages([]);
            return;
        }
        fetchSessionDetail(selectedSessionId).catch(() => undefined);
    }, [selectedSessionId, fetchSessionDetail]);

    const handleCreateSession = useCallback(async () => {
        if (mode === 'copilot') {
            toast.message(t('Sessions.CopilotAutoCreate'));
            return;
        }

        if (creatingSession) return;
        setCreatingSession(true);
        try {
            const created = await apiCreateSession({ mode: 'global', errorMessage: t('Errors.CreateSession') });
            await fetchSessions(created?.id ?? null);
        } catch (e: any) {
            console.error('[chat] create session failed', e);
            toast.error(e?.message || t('Errors.CreateSession'));
        } finally {
            setCreatingSession(false);
        }
    }, [mode, creatingSession, fetchSessions, t]);

    const handleSessionSelect = useCallback(
        (sessionId: string) => {
            if (mode === 'copilot') return; 
            setSelectedSessionId(sessionId);
        },
        [mode],
    );

    const handleConversationActivity = useCallback(() => {
        if (mode === 'copilot') return;
        const currentId = selectedSessionRef.current;
        fetchSessions(currentId).catch(() => undefined);
    }, [mode, fetchSessions]);

    
    const handleRenameRequest = useCallback(
        (sessionId: string) => {
            if (mode === 'copilot') return toast.error(t('Errors.CopilotRenameUnsupported'));
            const target = sessions.find(item => item.id === sessionId);
            if (!target) return toast.error(t('Errors.SessionNotFoundRename'));
            setEditingSessionId(sessionId);
            setEditingSessionValue((target.title ?? '').trim() || t('Sessions.DefaultRename'));
        },
        [mode, sessions, t],
    );

    const handleRenameCancel = useCallback(() => {
        setEditingSessionId(null);
        setEditingSessionValue('');
    }, []);

    const handleRenameChange = useCallback((value: string) => {
        setEditingSessionValue(value);
    }, []);

    const handleRenameSubmit = useCallback(async () => {
        if (mode === 'copilot') return;
        if (!editingSessionId) return;

        const trimmed = editingSessionValue.trim();
        if (!trimmed) return toast.error(t('Errors.SessionNameRequired'));

        const sessionId = editingSessionId;
        const target = sessions.find(item => item.id === sessionId);
        if (!target) return toast.error(t('Errors.SessionNotFoundRename'));

        setEditingSessionId(null);
        setEditingSessionValue('');
        setRenameSubmittingId(sessionId);

        const prev = sessions;
        setSessions(s => s.map(item => (item.id === sessionId ? { ...item, title: trimmed } : item)));

        try {
            await apiRenameSession({ sessionId, title: trimmed, errorMessage: t('Errors.RenameSession') });
            await fetchSessions(sessionId);
        } catch (e: any) {
            console.error('[chat] rename session failed', e);
            setSessions(prev);
            toast.error(e?.message || t('Errors.RenameSession'));
        } finally {
            setRenameSubmittingId(cur => (cur === sessionId ? null : cur));
        }
    }, [mode, editingSessionId, editingSessionValue, sessions, fetchSessions, t]);

    
    const handleDeleteRequest = useCallback(
        (sessionId: string) => {
            if (mode === 'copilot') return toast.error(t('Errors.CopilotDeleteUnsupported'));
            const target = sessions.find(item => item.id === sessionId);
            if (!target) return toast.error(t('Errors.SessionNotFoundDelete'));
            setDeleteTarget(target);
        },
        [mode, sessions, t],
    );

    const handleDeleteDialogClose = useCallback(
        (force = false) => {
            if (deleting && !force) return;
            setDeleteTarget(null);
        },
        [deleting],
    );

    const handleDeleteSubmit = useCallback(async () => {
        if (mode === 'copilot') return;
        if (!deleteTarget) return;

        setDeleting(true);
        const sessionId = deleteTarget.id;

        try {
            await apiDeleteSession(sessionId, { errorMessage: t('Errors.DeleteSession') });
            setSessions(prev => prev.filter(item => item.id !== sessionId));

            if (selectedSessionId === sessionId) {
                setSelectedSessionId(null);
                setInitialMessages([]);
            }

            toast.success(t('Sessions.DeleteSuccess'));
            const preferred = selectedSessionId === sessionId ? null : selectedSessionId;
            await fetchSessions(preferred);
            handleDeleteDialogClose(true);
        } catch (e: any) {
            console.error('[chat] delete session failed', e);
            toast.error(e?.message || t('Errors.DeleteSession'));
        } finally {
            setDeleting(false);
        }
    }, [mode, deleteTarget, selectedSessionId, fetchSessions, handleDeleteDialogClose, t]);

    const sessionsForDisplay = useMemo(() => normalizeSessionsForDisplay(sessions, t('Sessions.Untitled')), [sessions, t]);

    const handleRefreshSessions = useCallback(() => {
        if (mode === 'copilot') {
            ensureCopilotSession().catch(() => undefined);
            return;
        }
        const currentId = selectedSessionRef.current;
        fetchSessions(currentId).catch(() => undefined);
    }, [mode, fetchSessions, ensureCopilotSession]);

    return {
        // data
        sessions,
        sessionsForDisplay,
        selectedSessionId,
        initialMessages,

        // loading
        loadingSessions,
        loadingMessages,
        creatingSession,

        // rename
        editingSessionId,
        editingSessionValue,
        renameSubmittingId,

        // delete
        deleteTarget,
        deleting,

        // actions
        fetchSessions,
        fetchSessionDetail,
        handleCreateSession,
        handleSessionSelect,
        handleConversationActivity,
        handleRenameRequest,
        handleRenameChange,
        handleRenameSubmit,
        handleRenameCancel,
        handleDeleteRequest,
        handleDeleteDialogClose,
        handleDeleteSubmit,
        handleRefreshSessions,

        
        setSelectedSessionId,
    };
}
