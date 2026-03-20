'use client';

import { useEffect, useState } from 'react';
import type { ExplorerDriver } from '@/lib/explorer/types';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { useTranslations } from 'next-intl';
import { DriverTableBrowser } from './driver-table-browser';
import type { TableSubTab } from './types';

type UrlTableBrowserProps = {
    catalog?: string;
    driver?: ExplorerDriver;
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    initialTab?: TableSubTab;
};

export default function UrlTableBrowser({ catalog, driver, connectionId, databaseName, tableName, initialTab = 'overview' }: UrlTableBrowserProps) {
    const [currentTab, setCurrentTab] = useState<TableSubTab>(initialTab);
    const t = useTranslations('TableBrowser');

    useEffect(() => {
        setCurrentTab(initialTab);
    }, [catalog, databaseName, initialTab, tableName]);

    if (!databaseName || !tableName) {
        return (
            <Card className="m-6">
                <CardContent className="text-sm text-muted-foreground">{t('Select table to browse schema')}</CardContent>
            </Card>
        );
    }

    return (
        <DriverTableBrowser
            driver={driver}
            connectionId={connectionId}
            databaseName={databaseName}
            tableName={tableName}
            activeSubTab={currentTab}
            onSubTabChange={value => setCurrentTab(value)}
        />
    );
}
