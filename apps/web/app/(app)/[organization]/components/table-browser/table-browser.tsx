'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { SQLTab } from '@/types/tabs';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { useTranslations } from 'next-intl';
import { DriverTableBrowser } from './driver-table-browser';
import type { TableSubTab } from './types';

interface TableBrowserProps {
    activeTab: SQLTab;
    updateTab: (tabId: string, patch: Partial<SQLTab>, options?: { immediate?: boolean }) => void | Promise<void>;
}

export default function TableBrowser({ activeTab, updateTab }: TableBrowserProps) {
    const t = useTranslations('TableBrowser');
    const currentConnection = useAtomValue(currentConnectionAtom);
    if (!activeTab || activeTab.tabType !== 'table') {
        return (
            <Card className="m-6">
                <CardContent className="text-sm text-muted-foreground">{t('Select table tab to browse schema')}</CardContent>
            </Card>
        );
    }
    const initialTab = useMemo<TableSubTab>(() => {
        if (activeTab?.tabType === 'table' && activeTab.activeSubTab) {
            return activeTab.activeSubTab as TableSubTab;
        }
        return 'overview';
    }, [activeTab?.tabType, activeTab?.activeSubTab]);

    const [currentTab, setCurrentTab] = useState<TableSubTab>(initialTab);
    const driver = currentConnection?.connection.id === activeTab?.connectionId ? currentConnection.connection.type : undefined;

    useEffect(() => {
        setCurrentTab(initialTab);
    }, [initialTab]);

    const handleTabChange = useCallback(
        (value: string) => {
            const next = value as TableSubTab;
            setCurrentTab(next);

            if (activeTab?.tabId) {
                void updateTab(activeTab.tabId, { activeSubTab: next });
            }
        },
        [activeTab?.tabId, updateTab],
    );

    if (!activeTab || activeTab.tabType !== 'table') {
        return <div className="p-6 text-sm text-muted-foreground">{t('Select table tab to browse schema')}</div>;
    }

    return (
        <DriverTableBrowser
            driver={driver}
            activeTab={activeTab}
            connectionId={activeTab.connectionId}
            databaseName={activeTab.databaseName}
            tableName={activeTab.tableName}
            activeSubTab={currentTab}
            onSubTabChange={handleTabChange}
        />
    );
}
