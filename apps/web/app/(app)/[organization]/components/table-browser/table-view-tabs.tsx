'use client';

import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { useTranslations } from 'next-intl';
import TableStructure from './components/structure';
import TableStats from './components/stats';
import { TableOverview } from './components/overview';
import TableDataPreview from './components/data-preview';
import type { TableSubTab } from './types';
import { supportsTableStats } from './utils';
import type { SQLTab } from '@dory/shared/types/tabs';

type TableViewTabsProps = {
    activeTab?: SQLTab;
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    driver?: string;
    inspectorPortalMode?: 'preview' | 'viewport';
    activeSubTab?: TableSubTab;
    initialSubTab?: TableSubTab;
    onSubTabChange?: (tab: TableSubTab) => void;
};

export function TableViewTabs({
    activeTab,
    connectionId,
    databaseName,
    tableName,
    driver,
    inspectorPortalMode,
    activeSubTab,
    initialSubTab = 'overview',
    onSubTabChange,
}: TableViewTabsProps) {
    const t = useTranslations('TableBrowser');
    const subTabs = useMemo<TableSubTab[]>(() => (supportsTableStats(driver) ? ['overview', 'data', 'structure', 'stats'] : ['overview', 'data', 'structure']), [driver]);
    const contentKey = useMemo(() => `${databaseName ?? ''}:${tableName ?? ''}`, [databaseName, tableName]);
    const [localTabState, setLocalTabState] = useState<{ key: string; tab: TableSubTab }>(() => ({
        key: contentKey,
        tab: initialSubTab,
    }));
    const [paginationPortalContainer, setPaginationPortalContainer] = useState<HTMLElement | null>(null);
    const localTab = localTabState.key === contentKey ? localTabState.tab : initialSubTab;
    const currentTab = activeSubTab ?? localTab;

    const handleTabChange = (value: string) => {
        const next = (subTabs.find(tab => tab === value) ?? 'data') as TableSubTab;
        setLocalTabState({ key: contentKey, tab: next });
        onSubTabChange?.(next);
    };

    return (
        <Tabs value={currentTab} onValueChange={handleTabChange} className="flex h-full flex-col gap-0" key={contentKey}>
            <div className="flex-1 min-h-0">
                <TabsContent value="overview" className="h-full">
                    <TableOverview databaseName={databaseName} tableName={tableName} />
                </TabsContent>
                <TabsContent value="data" className="h-full">
                    <TableDataPreview
                        activeTab={activeTab}
                        connectionId={connectionId}
                        databaseName={databaseName}
                        tableName={tableName}
                        inspectorPortalMode={inspectorPortalMode}
                        paginationPortalContainer={paginationPortalContainer}
                        driver={driver}
                    />
                </TabsContent>
                <TabsContent value="structure" className="h-full">
                    <TableStructure databaseName={databaseName} tableName={tableName} />
                </TabsContent>
                {supportsTableStats(driver) ? (
                    <TabsContent value="stats" className="h-full">
                        <TableStats databaseName={databaseName} tableName={tableName} driver={driver} />
                    </TabsContent>
                ) : null}
            </div>

            <div className="no-scrollbar flex h-7 shrink-0 items-center gap-4 overflow-x-auto overflow-y-hidden border-t bg-card" data-testid="table-subtabs-footer">
                <TabsList className="h-7 shrink-0 justify-start p-0.5">
                    {subTabs.map(tab => (
                        <TabsTrigger key={tab} value={tab} className="h-6 cursor-pointer px-3 py-0 text-xs after:hidden">
                            {t(`Tabs.${tab}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <div ref={setPaginationPortalContainer} className="flex min-w-max flex-1 items-center justify-end" />
            </div>
        </Tabs>
    );
}
