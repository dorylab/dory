'use client';

import { toast } from 'sonner';

import type { UITabPayload } from '@/types/tabs';
import { CopilotActionExecutor } from '../../chatbot/copilot/action-bridge';
import { useTranslations } from 'next-intl';

export function useSqlCopilotExecutor(params: {
    tabs: UITabPayload[];
    activeTabId: string;
    updateTab: (tabId: string, patch: Partial<UITabPayload>, options?: { immediate?: boolean }) => void;
    addTab: (payload?: { tabName?: string; content?: string; activate?: boolean }) => Promise<string>;
    setActiveTabId: (tabId: string) => void;
}): CopilotActionExecutor {
    const { tabs, activeTabId, updateTab, addTab, setActiveTabId } = params;
    const t = useTranslations('SqlConsole');

    return async (action) => {
        const active = tabs.find(t => t.tabId === activeTabId) ?? null;

        switch (action.type) {
            case 'sql.replace': {
                if (!active) {
                    toast.error(t('Copilot.Errors.NoActiveTab'));
                    return;
                }
                if (active.tabType !== 'sql') {
                    toast.error(t('Copilot.Errors.NotSqlTab'));
                    return;
                }

                updateTab(active.tabId, { content: action.sql }, { immediate: true });
                toast.success(t('Copilot.Success.ReplaceSql'));
                return;
            }

            case 'sql.newTab': {
                const newId = await addTab({
                    tabName: action.title ?? t('Copilot.NewTabTitle'),
                    content: action.sql,
                    activate: true,
                });

                
                setActiveTabId(newId);

                toast.success(t('Copilot.Success.NewTab'));
                return;
            }

            default:
                return;
        }
    };
}
