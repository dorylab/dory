'use client';

import { useCallback } from 'react';
import { SQLTab, UITabPayload } from '@dory/shared/types/tabs';
import { shouldAutoNameTab } from '../utils';
import { UpdateTab } from '../types';
import { executeActionClient } from '@/lib/actions/client';
import { useTranslations } from 'next-intl';

export function useSqlAiTabTitle(activeDatabase: string | null | undefined, updateTab: UpdateTab) {
    const t = useTranslations('SqlConsole');
    const requestAITabTitle = useCallback(
        async (tab: SQLTab, options?: { force?: boolean; sqlTextOverride?: string }) => {
            if (!tab || tab.tabType !== 'sql') return;

            const sqlText = (options?.sqlTextOverride ?? tab.content ?? '').trim();
            if (!sqlText) return;
            if (!options?.force && !shouldAutoNameTab(tab, { defaultNames: [t('Tabs.NewQuery'), t('Tabs.UntitledQuery')] })) return;

            try {
                const data = await executeActionClient<{ title?: string | null }>('ai.tabTitle', {
                    sql: sqlText,
                    database: activeDatabase ?? null,
                });
                const title = data.title?.trim();
                if (!title) return;

                await updateTab(tab.tabId, {
                    tabName: title,
                });
            } catch (error) {
                console.error('[requestAITabTitle] error:', error);
            }
        },
        [activeDatabase, updateTab, t],
    );

    const manualRenameTab = useCallback(
        (tab: SQLTab) => requestAITabTitle(tab, { force: true }),
        [requestAITabTitle],
    );

    return { requestAITabTitle, manualRenameTab };
}
