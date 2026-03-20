'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import type { ExplorerDriver } from '@/lib/explorer/types';
import type { SQLTab } from '@/types/tabs';
import { TableOverview } from './components/overview';
import TableStats from './components/stats';
import TableStructure from './components/structure';
import TableDataPreview from './components/data-preview';
import { TableIndexesTab } from './components/indexes';
import { TableViewTabs } from './table-view-tabs';
import type { TableSubTab } from './types';

type DriverTableBrowserProps = {
    driver?: ExplorerDriver;
    activeTab?: SQLTab;
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    activeSubTab?: TableSubTab;
    initialSubTab?: TableSubTab;
    onSubTabChange?: (tab: TableSubTab) => void;
};

const DEFAULT_TAB: TableSubTab = 'overview';
const POSTGRES_SUB_TABS: TableSubTab[] = ['overview', 'data', 'structure', 'stats', 'indexes'];

function normalizeTab(driver: ExplorerDriver | undefined, tab?: TableSubTab): TableSubTab {
    if (driver !== 'postgres' && tab === 'indexes') {
        return DEFAULT_TAB;
    }

    return tab ?? DEFAULT_TAB;
}

export function DriverTableBrowser({
    driver,
    activeTab,
    connectionId,
    databaseName,
    tableName,
    activeSubTab,
    initialSubTab = DEFAULT_TAB,
    onSubTabChange,
}: DriverTableBrowserProps) {
    const t = useTranslations('PostgresExplorer');
    const [currentTab, setCurrentTab] = useState<TableSubTab>(() => normalizeTab(driver, activeSubTab ?? initialSubTab));

    useEffect(() => {
        setCurrentTab(normalizeTab(driver, activeSubTab ?? initialSubTab));
    }, [activeSubTab, driver, initialSubTab, databaseName, tableName]);

    const resetKey = useMemo(() => `${driver ?? 'default'}:${databaseName ?? ''}:${tableName ?? ''}`, [databaseName, driver, tableName]);

    const handleTabChange = (value: string) => {
        const next = normalizeTab(driver, value as TableSubTab);
        setCurrentTab(next);
        onSubTabChange?.(next);
    };

    if (driver !== 'postgres') {
        return (
            <div className="p-6 h-full flex flex-col">
                <TableViewTabs
                    connectionId={connectionId}
                    databaseName={databaseName}
                    tableName={tableName}
                    driver={driver}
                    activeSubTab={currentTab}
                    initialSubTab={normalizeTab(driver, initialSubTab)}
                    onSubTabChange={handleTabChange}
                />
            </div>
        );
    }

    return (
        <div className="p-6 h-full flex flex-col">
            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex h-full flex-col" key={resetKey}>
                <TabsList className="justify-start">
                    {POSTGRES_SUB_TABS.map(tab => (
                        <TabsTrigger key={tab} value={tab} className="cursor-pointer">
                            {t(`Tabs.${tab}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <div className="mt-1 flex-1 min-h-0">
                    <TabsContent value="overview" className="h-full mt-0 data-[state=inactive]:hidden" forceMount>
                        <TableOverview databaseName={databaseName} tableName={tableName} />
                    </TabsContent>
                    <TabsContent value="data" className="h-full mt-0 data-[state=inactive]:hidden" forceMount>
                        <TableDataPreview activeTab={activeTab} connectionId={connectionId} databaseName={databaseName} tableName={tableName} />
                    </TabsContent>
                    <TabsContent value="structure" className="h-full mt-0 data-[state=inactive]:hidden" forceMount>
                        <TableStructure databaseName={databaseName} tableName={tableName} />
                    </TabsContent>
                    <TabsContent value="stats" className="h-full mt-0 data-[state=inactive]:hidden" forceMount>
                        <TableStats databaseName={databaseName} tableName={tableName} driver={driver} />
                    </TabsContent>
                    <TabsContent value="indexes" className="h-full mt-0 data-[state=inactive]:hidden" forceMount>
                        <TableIndexesTab
                            connectionId={activeTab?.connectionId ?? connectionId}
                            database={databaseName ?? ''}
                            table={tableName ?? ''}
                            emptyText={t('Indexes.Empty')}
                        />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
