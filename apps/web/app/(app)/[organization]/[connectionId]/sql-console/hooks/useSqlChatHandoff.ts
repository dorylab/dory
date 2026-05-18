'use client';

import { useCallback, useEffect } from 'react';
import type { SqlResultManualExecutionMode } from '@/components/@dory/ui/ai/sql-result/type';
import { useTranslations } from 'next-intl';
import { SQLTab } from '@dory/shared/types/tabs';
import { UpdateTab } from '../types';

export function useSqlChatHandoff({
    tabs,
    activeTabId,
    updateTab,
    addTab,
    setActiveTabId,
    setActiveDatabase,
    isLoading,
}: {
    tabs: SQLTab[];
    activeTabId: string | undefined;
    updateTab: UpdateTab;
    addTab: (payload?: { tabName?: string; content?: string; activate?: boolean }) => Promise<string>;
    setActiveTabId: (tabId: string) => void;
    setActiveDatabase: any;
    isLoading: boolean;
}) {
    const t = useTranslations('SqlConsole');
    const applyPendingSqlFromChat = useCallback(async () => {
        if (isLoading) return;

        let payload:
            | { sql?: string; database?: string | null; mode?: SqlResultManualExecutionMode; tabName?: string | null }
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

        const tabName = payload.tabName?.trim() || t('Tabs.ChatQuery');

        if (payload.mode === 'editor') {
            let shouldFallbackToActiveTab = false;
            let newTabId: string | null = null;
            try {
                newTabId = await addTab({
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

            if (newTabId) {
                setActiveTabId(newTabId);
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
    }, [activeTabId, addTab, isLoading, setActiveDatabase, setActiveTabId, t, tabs.length, updateTab]);

    useEffect(() => {
        void applyPendingSqlFromChat();
    }, [applyPendingSqlFromChat]);
}
