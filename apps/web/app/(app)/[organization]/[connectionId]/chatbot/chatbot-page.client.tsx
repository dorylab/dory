'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/registry/new-york-v4/ui/button';
import { X } from 'lucide-react';

import ChatBotComp from './thread/chatbox';
import ChatWelcome from './components/empty';
import ChatSessionSidebar from './sessions/chat-session-sidebar';
import SessionDeleteDialog from './sessions/session-delete-dialog';

import { useChatSessions } from './core/session-controller';
import type { ChatMode } from './core/types';

import type { CopilotEnvelopeV1 } from './copilot/types/copilot-envelope';
import { CopilotActionExecutor } from './copilot/action-bridge';

type ChatBotPageContentProps = {
    variant?: 'sidebar' | 'compact';
    mode?: ChatMode;
    copilotEnvelope?: CopilotEnvelopeV1 | null;
    onClose?: () => void;
};

export default function ChatBotPageContent({ variant = 'sidebar', mode = 'global', copilotEnvelope = null, onClose }: ChatBotPageContentProps) {
    const [compactMode, setCompactMode] = useState<boolean>(variant === 'compact');
    const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
    const welcomeSendLockRef = useRef(false);
    useEffect(() => setCompactMode(variant === 'compact'), [variant]);
    const t = useTranslations('Chatbot');

    const chat = useChatSessions({
        mode,
        copilotEnvelope,
    });

    const sessionSelector = useMemo(
        () => (
            <ChatSessionSidebar
                variant={variant}
                sessions={chat.sessionsForDisplay}
                loadingSessions={chat.loadingSessions}
                creatingSession={chat.creatingSession}
                selectedSessionId={chat.selectedSessionId}
                editingSessionId={chat.editingSessionId}
                editingValue={chat.editingSessionValue}
                renameSubmittingId={chat.renameSubmittingId}
                onCreate={chat.handleNewChat}
                onSelect={chat.handleSessionSelect}
                onRenameStart={chat.handleRenameRequest}
                onRenameChange={chat.handleRenameChange}
                onRenameSubmit={chat.handleRenameSubmit}
                onRenameCancel={chat.handleRenameCancel}
                onDelete={chat.handleDeleteRequest}
                onRefresh={chat.handleRefreshSessions}
            />
        ),
        [
            variant,
            chat.sessionsForDisplay,
            chat.loadingSessions,
            chat.creatingSession,
            chat.selectedSessionId,
            chat.editingSessionId,
            chat.editingSessionValue,
            chat.renameSubmittingId,
            chat.handleNewChat,
            chat.handleSessionSelect,
            chat.handleRenameRequest,
            chat.handleRenameChange,
            chat.handleRenameSubmit,
            chat.handleRenameCancel,
            chat.handleDeleteRequest,
            chat.handleRefreshSessions,
        ],
    );

    const handleWelcomeSend = async (text: string) => {
        if (welcomeSendLockRef.current) return;
        welcomeSendLockRef.current = true;
        try {
            const created = await chat.handleCreateSession();
            if (created?.id) {
                setPendingPrompt(text);
            }
        } finally {
            welcomeSendLockRef.current = false;
        }
    };

    const onExecuteAction: CopilotActionExecutor = async action => {
        if (action.type === 'sql.replace') {
            console.log('replace sql', action.sql);
        }
        if (action.type === 'sql.newTab') {
            console.log('new tab', action.sql);
        }
    };

    const hasSessions = chat.sessionsForDisplay.length > 0;
    const shouldRenderThread = mode === 'copilot' || Boolean(chat.selectedSessionId);

    return (
        <div className="relative flex h-full min-h-0 overflow-hidden">
            {compactMode ? (
                <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
                    {hasSessions && sessionSelector}
                    <Button variant="outline" size="icon" title={t('Close')} onClick={() => onClose?.()} className="h-8 w-8">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                hasSessions && sessionSelector
            )}

            <main className="relative mt-10 flex min-h-0 min-w-0 flex-1">
                {shouldRenderThread ? (
                    <ChatBotComp
                        key={mode === 'copilot' ? (copilotEnvelope?.meta?.tabId ?? 'copilot') : chat.selectedSessionId}
                        sessionId={chat.selectedSessionId}
                        initialMessages={chat.initialMessages}
                        initialPrompt={pendingPrompt}
                        onInitialPromptConsumed={() => setPendingPrompt(null)}
                        onConversationActivity={chat.handleConversationActivity}
                        onExecuteAction={onExecuteAction}
                        onSessionCreated={sessionId => chat.setSelectedSessionId(sessionId)}
                        mode={mode}
                        copilotEnvelope={copilotEnvelope}
                    />
                ) : (
                    <ChatWelcome onSend={handleWelcomeSend} disabled={chat.creatingSession} />
                )}
            </main>

            <SessionDeleteDialog
                open={Boolean(chat.deleteTarget)}
                sessionTitle={chat.deleteTarget?.title ?? t('Sessions.Untitled')}
                loading={chat.deleting}
                onConfirm={chat.handleDeleteSubmit}
                onOpenChange={(open: boolean) => {
                    if (!open) chat.handleDeleteDialogClose();
                }}
            />
        </div>
    );
}
