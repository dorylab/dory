'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import TableStructure from './components/structure';
import TableStats from './components/stats';
import { TableOverview } from './components/overview';
import { UrlTablePreview } from './components/table-preview';
import { useTranslations } from 'next-intl';

type SubTab = 'overview' | 'data' | 'structure' | 'stats';

const SUB_TABS: SubTab[] = ['overview', 'data', 'structure', 'stats'];

type UrlTableBrowserProps = {
    catalog?: string;
    databaseName?: string;
    tableName?: string;
};

export default function UrlTableBrowser({ catalog, databaseName, tableName }: UrlTableBrowserProps) {
    const [currentTab, setCurrentTab] = useState<SubTab>('overview');
    const t = useTranslations('TableBrowser');

    useEffect(() => {
        setCurrentTab('overview');
    }, [catalog, databaseName, tableName]);

    if (!databaseName || !tableName) {
        return (
            <Card className="m-6">
                <CardContent className="text-sm text-muted-foreground">
                    {t('Select table to browse schema')}
                </CardContent>
            </Card>
        );
    }

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
                    <TabsContent value="overview" className="h-full">
                        <TableOverview databaseName={databaseName} tableName={tableName} />
                    </TabsContent>
                    <TabsContent value="data" className="h-full">
                        <UrlTablePreview />
                    </TabsContent>
                    <TabsContent value="structure" className="h-full">
                        <TableStructure databaseName={databaseName} tableName={tableName} />
                    </TabsContent>
                    <TabsContent value="stats" className="h-full">
                        <TableStats databaseName={databaseName} tableName={tableName} />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
