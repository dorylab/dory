'use client';

import { useCallback, useEffect } from 'react';
import type { SqlResultManualExecutionMode } from '@/components/@dory/ui/ai/sql-result/type';
import { useTranslations } from 'next-intl';
import { SQLTab } from '@/types/tabs';
import { UpdateTab } from '../types';

export function useSqlChatHandoff({
    tabs,
    activeTabId,
    updateTab,
    addTab,
    setActiveDatabase,
}: {
    tabs: SQLTab[];
    activeTabId: string | undefined;
    updateTab: UpdateTab;
    addTab: (payload?: { tabName?: string; content?: string; activate?: boolean }) => Promise<string>;
    setActiveDatabase: any;
}) {
    const t = useTranslations('SqlConsole');
    const applyPendingSqlFromChat = useCallback(async () => {
        let payload:
            | { sql?: string; database?: string | null; mode?: SqlResultManualExecutionMode }
            | null = null;
        try {
            const raw = localStorage.getItem('chatbot:pending-sql');
            if (raw) {
                payload = JSON.parse(raw);
                localStorage.removeItem('chatbot:pending-sql');
            }
        } catch (error) {
            console.error(`[SQLConsoleClient] ${t('Errors.ChatHandoffReadFailed')}`, error);
        }

        if (!payload?.sql) return;

        const applyDatabaseSelection = () => {
            if (payload?.database && typeof payload.database === 'string' && payload.database.trim()) {
                setActiveDatabase(payload.database.trim());
            }
        };

        const tabName = t('Tabs.ChatQuery');

        if (payload.mode === 'editor') {
            let shouldFallbackToActiveTab = false;
            try {
                await addTab({
                    tabName,
                    content: payload.sql,
                    activate: true,
                });
            } catch (error) {
                shouldFallbackToActiveTab = true;
                console.error('[SQLConsoleClient] Failed to create tab from chat handoff', error);
            }

            if (shouldFallbackToActiveTab && tabs.length && activeTabId) {
                await updateTab(activeTabId, {
                    content: payload.sql,
                    tabName,
                });
            }

            applyDatabaseSelection();
            return;
        }

        if (!tabs.length || !activeTabId) return;

        await updateTab(activeTabId, {
            content: payload.sql,
            tabName,
        });

        applyDatabaseSelection();
    }, [activeTabId, addTab, setActiveDatabase, t, tabs.length, updateTab]);

    useEffect(() => {
        void applyPendingSqlFromChat();
    }, [applyPendingSqlFromChat]);
}
