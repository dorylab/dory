'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { useTranslations } from 'next-intl';
import TableStructure from './components/structure';
import TableStats from './components/stats';
import { TableOverview } from './components/overview';
import TableDataPreview from './components/data-preview';
import type { TableSubTab } from './types';

type TableViewTabsProps = {
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    driver?: string;
    activeSubTab?: TableSubTab;
    initialSubTab?: TableSubTab;
    onSubTabChange?: (tab: TableSubTab) => void;
};

const SUB_TABS: TableSubTab[] = ['overview', 'data', 'structure', 'stats'];

export function TableViewTabs({ connectionId, databaseName, tableName, driver, activeSubTab, initialSubTab = 'overview', onSubTabChange }: TableViewTabsProps) {
    const t = useTranslations('TableBrowser');
    const [currentTab, setCurrentTab] = useState<TableSubTab>(activeSubTab ?? initialSubTab);

    useEffect(() => {
        if (activeSubTab) {
            setCurrentTab(activeSubTab);
        }
    }, [activeSubTab]);

    const handleTabChange = (value: string) => {
        const next = (SUB_TABS.find(tab => tab === value) ?? 'data') as TableSubTab;
        setCurrentTab(next);
        onSubTabChange?.(next);
    };

    const contentKey = useMemo(() => `${databaseName ?? ''}:${tableName ?? ''}`, [databaseName, tableName]);

    return (
        <Tabs value={currentTab} onValueChange={handleTabChange} className="flex flex-col h-full" key={contentKey}>
            <TabsList className="justify-start">
                {SUB_TABS.map(tab => (
                    <TabsTrigger key={tab} value={tab} className="cursor-pointer">
                        {t(`Tabs.${tab}`)}
                    </TabsTrigger>
                ))}
            </TabsList>

            <div className="mt-1 flex-1 min-h-0">
                <TabsContent value="overview" className="h-full">
                    <TableOverview databaseName={databaseName} tableName={tableName} />
                </TabsContent>
                <TabsContent value="data" className="h-full">
                    <TableDataPreview connectionId={connectionId} databaseName={databaseName} tableName={tableName} />
                </TabsContent>
                <TabsContent value="structure" className="h-full">
                    <TableStructure databaseName={databaseName} tableName={tableName} />
                </TabsContent>
                <TabsContent value="stats" className="h-full">
                    <TableStats databaseName={databaseName} tableName={tableName} driver={driver} />
                </TabsContent>
            </div>
        </Tabs>
    );
}
