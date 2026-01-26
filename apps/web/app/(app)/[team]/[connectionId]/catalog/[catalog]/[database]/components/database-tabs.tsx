'use client';

import { Activity, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import DatabaseSummary from './database-summary';
import DatabaseTables from './database-tables';
import DatabaseViews from './database-views';
import DatabaseMaterializedViews from './database-materialized-views';
import { useTranslations } from 'next-intl';

type SubTab = 'summary' | 'tables' | 'views' | 'materialized-views' | 'dataset-map';

const SUB_TABS: SubTab[] = ['summary', 'tables', 'views', 'materialized-views'];

type DatabaseTabsProps = {
    catalog?: string;
    database?: string;
};

export default function DatabaseTabs({ catalog, database }: DatabaseTabsProps) {
    const [currentTab, setCurrentTab] = useState<SubTab>('summary');
    const t = useTranslations('Catalog');

    useEffect(() => {
        setCurrentTab('summary');
    }, [catalog, database]);

    return (
        <div className="p-6 h-full flex flex-col">
            <Tabs value={currentTab} onValueChange={value => setCurrentTab(value as SubTab)} className="flex flex-col h-full">
                <TabsList className="justify-start">
                    {SUB_TABS.map(tab => (
                        <TabsTrigger key={tab} value={tab} className="cursor-pointer">
                            {t(`Tabs.${tab}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <div className="mt-1 flex-1 min-h-0">
                    <TabsContent value="summary" className="h-full mt-0 data-[state=inactive]:hidden" forceMount>
                        <Activity mode={currentTab === 'summary' ? 'visible' : 'hidden'}>
                            <DatabaseSummary catalog={catalog} database={database} />
                        </Activity>
                    </TabsContent>
                    <TabsContent value="tables" className="h-full mt-0 data-[state=inactive]:hidden" forceMount>
                        <Activity mode={currentTab === 'tables' ? 'visible' : 'hidden'}>
                            <DatabaseTables />
                        </Activity>
                    </TabsContent>
                    <TabsContent value="views" className="h-full mt-0 data-[state=inactive]:hidden" forceMount>
                        <Activity mode={currentTab === 'views' ? 'visible' : 'hidden'}>
                            <DatabaseViews />
                        </Activity>
                    </TabsContent>
                    <TabsContent value="materialized-views" className="h-full mt-0 data-[state=inactive]:hidden" forceMount>
                        <Activity mode={currentTab === 'materialized-views' ? 'visible' : 'hidden'}>
                            <DatabaseMaterializedViews />
                        </Activity>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
