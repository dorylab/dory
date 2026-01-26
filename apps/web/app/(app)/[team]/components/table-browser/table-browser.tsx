'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { SQLTab, TableTabPayload } from '@/types/tabs';
import TableStructure from './components/structure';
import TablePreview from './components/table-preview';
import TableStats from './components/stats';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { TableOverview } from './components/overview';
import { useTranslations } from 'next-intl';

type SubTab = NonNullable<TableTabPayload['activeSubTab']>;

const SUB_TABS: SubTab[] = ['overview', 'data', 'structure', 'stats'];

interface TableBrowserProps {
    activeTab: SQLTab;
    updateTab: (tabId: string, patch: Partial<SQLTab>, options?: { immediate?: boolean }) => void | Promise<void>;
    runQuery: (tab: SQLTab, options?: { sqlOverride?: string; databaseOverride?: string | null }) => void | Promise<void>;
}

export default function TableBrowser({ activeTab, updateTab, runQuery }: TableBrowserProps) {
    const t = useTranslations('TableBrowser');
    if (!activeTab || activeTab.tabType !== 'table') {
        return (
            <Card className="m-6">
                <CardContent className="text-sm text-muted-foreground">
                    {t('Select table tab to browse schema')}
                </CardContent>
            </Card>
        );
    }
    const initialTab = useMemo<SubTab>(() => {
        if (activeTab?.tabType === 'table' && activeTab.activeSubTab) {
            return activeTab.activeSubTab as SubTab;
        }
        return 'overview';
    }, [activeTab?.tabType, activeTab?.activeSubTab]);

    const [currentTab, setCurrentTab] = useState<SubTab>(initialTab);

    useEffect(() => {
        setCurrentTab(initialTab);
    }, [initialTab]);

    const handleTabChange = useCallback(
        (value: string) => {
            const next = (SUB_TABS.find(t => t === value) ?? 'data') as SubTab;
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
        <div className="p-6 h-full flex flex-col">
            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex flex-col h-full">
                <TabsList className="justify-start">
                    {SUB_TABS.map(tab => (
                        <TabsTrigger key={tab} value={tab} className="cursor-pointer">
                            {t(`Tabs.${tab}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <div className="mt-1 flex-1 min-h-0">
                    <TabsContent value="overview" className="h-full">
                        <TableOverview databaseName={activeTab.databaseName} tableName={activeTab.tableName} />
                    </TabsContent>
                    <TabsContent value="data" className="h-full">
                        <TablePreview activeTab={activeTab} onRefresh={runQuery} />
                    </TabsContent>
                    <TabsContent value="structure" className="h-full">
                        <TableStructure databaseName={activeTab.databaseName} tableName={activeTab.tableName} />
                    </TabsContent>
                    <TabsContent value="stats" className="h-full">
                        <TableStats databaseName={activeTab.databaseName} tableName={activeTab.tableName} />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
