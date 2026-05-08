// chat/core/session-controller.ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import posthog from 'posthog-js';
import { useAtomValue } from 'jotai';

import type { ChatSessionItem, ChatMode } from './types';
import { normalizeSessionsForDisplay } from './utils';
import {
    apiCreateSession,
    apiDeleteSession,
    apiFetchCopilotSession,
    apiFetchSessionDetail,
    apiFetchSessions,
    apiRenameSession,
} from './api';
import type { CopilotEnvelopeV1 } from '../copilot/types/copilot-envelope';
import { activeDatabaseAtom, activeSchemaAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { getSidebarConfig } from '../../../components/sql-console-sidebar/sidebar-config';

export function useChatSessions(params: { mode: ChatMode; copilotEnvelope?: CopilotEnvelopeV1 | null; enabled?: boolean }) {
    const { mode, copilotEnvelope, enabled = true } = params;
    const copilotTabId = copilotEnvelope?.meta?.tabId ?? null;
    const t = useTranslations('Chatbot');
    const routeParams = useParams<{ connectionId: string }>();
    const connectionId = routeParams.connectionId;
    const activeDatabase = useAtomValue(activeDatabaseAtom);
    const activeSchema = useAtomValue(activeSchemaAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const sidebarConfig = useMemo(() => getSidebarConfig(currentConnection?.connection?.type), [currentConnection?.connection?.type]);
    const resolvedActiveDatabase = activeDatabase || currentConnection?.connection?.database || null;
    const resolvedActiveSchema =
        sidebarConfig.supportsSchemas
            ? activeSchema || (resolvedActiveDatabase ? (sidebarConfig.defaultSchemaName ?? null) : null)
            : null;

    const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const selectedSessionRef = useRef<string | null>(null);
    const lastCopilotTabIdRef = useRef<string | null>(null);
    const copilotSessionRequestSeqRef = useRef(0);
    const sessionsRequestSeqRef = useRef(0);
    const sessionDetailRequestSeqRef = useRef(0);
    const creatingSessionRef = useRef(false);
    const skipNextDetailFetchSessionRef = useRef<string | null>(null);

    const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(mode !== 'copilot');
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

            const requestSeq = ++sessionsRequestSeqRef.current;
            setLoadingSessions(true);
            try {
                const list = await apiFetchSessions({ mode: 'global', connectionId, errorMessage: t('Errors.FetchSessions') });
                if (requestSeq !== sessionsRequestSeqRef.current) return;

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
                if (requestSeq !== sessionsRequestSeqRef.current) return;

                console.error('[chat] fetch sessions failed', e);
                toast.error(e?.message || t('Errors.FetchSessions'));
            } finally {
                if (requestSeq === sessionsRequestSeqRef.current) {
                    setLoadingSessions(false);
                }
            }
        },
        [mode, connectionId, t],
    );

    const fetchSessionDetail = useCallback(
        async (sessionId: string) => {
            const requestSeq = ++sessionDetailRequestSeqRef.current;
            setLoadingMessages(true);
            try {
                const { detail, messages } = await apiFetchSessionDetail(sessionId, { errorMessage: t('Errors.FetchSessionDetail') });
                if (requestSeq !== sessionDetailRequestSeqRef.current || selectedSessionRef.current !== sessionId) return;

                if (detail?.session) {
                    setSessions(prev => {
                        const exists = prev.some(item => item.id === detail.session.id);
                        if (!exists) return [detail.session, ...prev];
                        return prev.map(item => (item.id === detail.session.id ? detail.session : item));
                    });
                }
                setInitialMessages(messages);
            } catch (e: any) {
                if (requestSeq !== sessionDetailRequestSeqRef.current) return;

                console.error('[chat] fetch session detail failed', e);
                toast.error(e?.message || t('Errors.FetchSessionDetail'));
                setInitialMessages([]);
            } finally {
                if (requestSeq === sessionDetailRequestSeqRef.current) {
                    setLoadingMessages(false);
                }
            }
        },
        [t],
    );

    const ensureCopilotSession = useCallback(async () => {
        if (mode !== 'copilot') return;
        if (!copilotTabId) {
            copilotSessionRequestSeqRef.current += 1;
            lastCopilotTabIdRef.current = null;
            setSessions([]);
            setSelectedSessionId(null);
            setInitialMessages([]);
            setLoadingSessions(false);
            return;
        }

        if (lastCopilotTabIdRef.current !== copilotTabId) {
            lastCopilotTabIdRef.current = copilotTabId;
            setSessions([]);
            setSelectedSessionId(null);
            setInitialMessages([]);
        }

        const requestSeq = ++copilotSessionRequestSeqRef.current;
        setLoadingSessions(true);
        try {
            const session = await apiFetchCopilotSession({
                tabId: copilotTabId,
                errorMessage: t('Errors.FetchCopilotSession'),
            });

            if (requestSeq !== copilotSessionRequestSeqRef.current) return;

            if (!session) {
                setSessions([]);
                setSelectedSessionId(null);
                setInitialMessages([]);
                return;
            }

            setSessions([session]);
            setSelectedSessionId(session.id);
        } catch (e: any) {
            if (requestSeq !== copilotSessionRequestSeqRef.current) return;

            console.error('[chat] fetch copilot session failed', e);
            toast.error(e?.message || t('Errors.FetchCopilotSession'));
            setSessions([]);
            setSelectedSessionId(null);
            setInitialMessages([]);
        } finally {
            if (requestSeq === copilotSessionRequestSeqRef.current) {
                setLoadingSessions(false);
            }
        }
    }, [mode, copilotTabId, t]);

    useEffect(() => {
        if (!enabled) {
            copilotSessionRequestSeqRef.current += 1;
            sessionsRequestSeqRef.current += 1;
            sessionDetailRequestSeqRef.current += 1;
            setLoadingSessions(false);
            setLoadingMessages(false);
            setSessions([]);
            setSelectedSessionId(null);
            setInitialMessages([]);
            return;
        }

        if (mode === 'copilot') {
            ensureCopilotSession().catch(() => undefined);
        } else {
            fetchSessions().catch(() => undefined);
        }
    }, [enabled, mode, fetchSessions, ensureCopilotSession]);

    useEffect(() => {
        if (!selectedSessionId) {
            setInitialMessages([]);
            return;
        }
        if (!enabled) {
            return;
        }
        if (skipNextDetailFetchSessionRef.current === selectedSessionId) {
            skipNextDetailFetchSessionRef.current = null;
            setInitialMessages([]);
            return;
        }
        fetchSessionDetail(selectedSessionId).catch(() => undefined);
    }, [enabled, selectedSessionId, fetchSessionDetail]);

    const handleCreateSession = useCallback(async () => {
        if (mode === 'copilot') {
            toast.message(t('Sessions.CopilotAutoCreate'));
            return null;
        }

        if (creatingSessionRef.current || creatingSession) return null;
        creatingSessionRef.current = true;
        setCreatingSession(true);
        try {
            const created = await apiCreateSession({
                mode: 'global',
                connectionId,
                activeDatabase: resolvedActiveDatabase,
                activeSchema: resolvedActiveSchema,
                errorMessage: t('Errors.CreateSession'),
            });
            if (created?.id) {
                posthog.capture('chat_session_created', { session_id: created.id });
                skipNextDetailFetchSessionRef.current = created.id;
                setSelectedSessionId(created.id);
                setInitialMessages([]);
                setSessions(prev => {
                    const exists = prev.some(item => item.id === created.id);
                    return exists ? prev : [created, ...prev];
                });
            }
            await fetchSessions(created?.id ?? null);
            return created ?? null;
        } catch (e: any) {
            console.error('[chat] create session failed', e);
            toast.error(e?.message || t('Errors.CreateSession'));
            return null;
        } finally {
            creatingSessionRef.current = false;
            setCreatingSession(false);
        }
    }, [mode, creatingSession, connectionId, fetchSessions, resolvedActiveDatabase, resolvedActiveSchema, t]);

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
            posthog.capture('chat_session_deleted', { session_id: sessionId });
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

    const handleNewChat = useCallback(() => {
        if (mode === 'copilot') {
            toast.message(t('Sessions.CopilotAutoCreate'));
            return;
        }
        setSelectedSessionId(null);
        setInitialMessages([]);
    }, [mode, t]);

    const handleRefreshSessions = useCallback(() => {
        if (mode === 'copilot') {
            const currentId = selectedSessionRef.current;
            if (currentId) {
                fetchSessionDetail(currentId).catch(() => undefined);
            }
            return;
        }
        const currentId = selectedSessionRef.current;
        fetchSessions(currentId).catch(() => undefined);
    }, [mode, fetchSessionDetail, fetchSessions]);

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
        handleNewChat,
        handleRefreshSessions,
        setSelectedSessionId,
    };
}
