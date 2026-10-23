'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { apiDeleteSession, apiRenameSession } from '@/app/(app)/[organization]/[connectionId]/chatbot/core/api';
import type { ChatSessionItem } from '@/app/(app)/[organization]/[connectionId]/chatbot/core/types';
import ChatSessionSidebar from '@/app/(app)/[organization]/[connectionId]/chatbot/sessions/chat-session-sidebar';
import SessionDeleteDialog from '@/app/(app)/[organization]/[connectionId]/chatbot/sessions/session-delete-dialog';

export function AgentSessionSidebar({
    organization,
    sessions,
    loading,
    chatId,
    disabled,
    onCreate,
    onSelect,
    onRefresh,
}: {
    organization: string;
    sessions: ChatSessionItem[];
    loading: boolean;
    chatId: string;
    disabled: boolean;
    onCreate: () => void;
    onSelect: (id: string) => void;
    onRefresh: () => void;
}) {
    const t = useTranslations('Chatbot');
    const client = useQueryClient();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const rename = useMutation({
        mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) => apiRenameSession({ sessionId, title }),
        onSuccess: async () => {
            setEditingId(null);
            await client.invalidateQueries({ queryKey: ['data-agent', organization] });
        },
        onError: () => setEditingId(null),
    });
    const remove = useMutation({
        mutationFn: (id: string) => apiDeleteSession(id),
        onSuccess: async (_, id) => {
            setDeleteId(null);
            if (id === chatId) onCreate();
            await client.invalidateQueries({ queryKey: ['data-agent', organization] });
            client.removeQueries({ queryKey: ['agent-history', organization, id] });
        },
    });
    const locked = disabled || rename.isPending || remove.isPending;
    const props = {
        sessions,
        loadingSessions: loading,
        selectedSessionId: chatId,
        creatingSession: locked,
        editingSessionId: editingId,
        editingValue,
        renameSubmittingId: rename.isPending ? editingId : null,
        onCreate: () => {
            if (!locked) {
                setEditingId(null);
                onCreate();
            }
        },
        onSelect: (id: string) => {
            if (!locked) {
                setEditingId(null);
                onSelect(id);
            }
        },
        onRenameStart: (id: string) => {
            if (locked) return;
            rename.reset();
            setEditingId(id);
            setEditingValue(sessions.find(session => session.id === id)?.title ?? '');
        },
        onRenameChange: setEditingValue,
        onRenameSubmit: () => {
            if (!locked && editingId && editingValue.trim()) rename.mutate({ sessionId: editingId, title: editingValue.trim() });
        },
        onRenameCancel: () => setEditingId(null),
        onDelete: (id: string) => {
            if (!locked) {
                remove.reset();
                setDeleteId(id);
            }
        },
        onRefresh,
    };
    const error = rename.error ?? remove.error;
    return (
        <>
            <div className="hidden h-full min-h-0 shrink-0 flex-col md:flex" inert={disabled}>
                <div className="min-h-0 flex-1">
                    <ChatSessionSidebar {...props} />
                </div>
                {error ? (
                    <p role="alert" className="w-72 p-3 text-sm text-destructive">
                        {error.message}
                    </p>
                ) : null}
            </div>
            <div className="flex items-center justify-between border-b p-3 md:hidden" inert={disabled}>
                <span className="text-sm font-semibold text-muted-foreground">{t('Sessions.Title')}</span>
                <ChatSessionSidebar {...props} variant="compact" emptySelectionLabel={t('Sessions.New')} />
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error.message}
                    </p>
                ) : null}
            </div>
            <SessionDeleteDialog
                open={Boolean(deleteId)}
                sessionTitle={sessions.find(session => session.id === deleteId)?.title}
                loading={remove.isPending || disabled}
                onConfirm={() => {
                    if (deleteId && !locked) remove.mutate(deleteId);
                }}
                onOpenChange={open => {
                    if (!open) setDeleteId(null);
                }}
            />
        </>
    );
}
