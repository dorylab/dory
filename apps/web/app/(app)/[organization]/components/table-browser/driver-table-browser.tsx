'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import type { SQLTab } from '@dory/shared/types/tabs';
import { TableOverview } from './components/overview';
import TableStats from './components/stats';
import TableStructure from './components/structure';
import TableDataPreview from './components/data-preview';
import { TableIndexesTab } from './components/indexes';
import { TableViewTabs } from './table-view-tabs';
import type { TableSubTab } from './types';
import { isPostgresFamilyConnectionType } from '@dory/drivers/types';
import { supportsTableStats } from './utils';

type DriverTableBrowserProps = {
    driver?: string;
    activeTab?: SQLTab;
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    activeSubTab?: TableSubTab;
    initialSubTab?: TableSubTab;
    onSubTabChange?: (tab: TableSubTab) => void;
};

const DEFAULT_TAB: TableSubTab = 'data';
const POSTGRES_SUB_TABS: TableSubTab[] = ['overview', 'data', 'structure', 'stats', 'indexes'];

function normalizeTab(driver: string | undefined, tab?: TableSubTab): TableSubTab {
    if (!isPostgresFamilyConnectionType(driver) && tab === 'indexes') {
        return DEFAULT_TAB;
    }

    if (!supportsTableStats(driver) && tab === 'stats') {
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
    const resetKey = useMemo(() => `${driver ?? 'default'}:${databaseName ?? ''}:${tableName ?? ''}`, [databaseName, driver, tableName]);
    const [localTabState, setLocalTabState] = useState<{ key: string; tab: TableSubTab }>(() => ({
        key: resetKey,
        tab: normalizeTab(driver, activeSubTab ?? initialSubTab),
    }));
    const localTab = localTabState.key === resetKey ? localTabState.tab : normalizeTab(driver, activeSubTab ?? initialSubTab);
    const currentTab = normalizeTab(driver, activeSubTab ?? localTab);

    const handleTabChange = (value: string) => {
        const next = normalizeTab(driver, value as TableSubTab);
        setLocalTabState({ key: resetKey, tab: next });
        onSubTabChange?.(next);
    };

    if (!isPostgresFamilyConnectionType(driver)) {
        return (
            <div className="h-full flex flex-col px-6 pb-2 pt-3">
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
        <div className="h-full flex flex-col px-6 pb-2 pt-3">
            <Tabs value={currentTab} onValueChange={handleTabChange} className="flex h-full flex-col gap-1" key={resetKey}>
                <TabsList className="h-9 justify-start">
                    {POSTGRES_SUB_TABS.map(tab => (
                        <TabsTrigger key={tab} value={tab} className="h-8 cursor-pointer px-3">
                            {t(`Tabs.${tab}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <div className="flex-1 min-h-0">
                    <TabsContent value="overview" className="h-full mt-0">
                        <TableOverview databaseName={databaseName} tableName={tableName} />
                    </TabsContent>
                    <TabsContent value="data" className="h-full mt-0">
                        <TableDataPreview activeTab={activeTab} connectionId={connectionId} databaseName={databaseName} tableName={tableName} />
                    </TabsContent>
                    <TabsContent value="structure" className="h-full mt-0">
                        <TableStructure databaseName={databaseName} tableName={tableName} />
                    </TabsContent>
                    <TabsContent value="stats" className="h-full mt-0">
                        <TableStats databaseName={databaseName} tableName={tableName} driver={driver} />
                    </TabsContent>
                    <TabsContent value="indexes" className="h-full mt-0">
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
