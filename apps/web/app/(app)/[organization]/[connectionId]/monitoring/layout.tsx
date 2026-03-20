'use client';

import { useAtomValue } from 'jotai';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { ReactNode, useMemo, useEffect } from 'react';
import { QueryInsightsFilterBar } from './components/filter-bar';
import { useQueryClient } from '@tanstack/react-query';
import { useQueryInsightsFiltersValue } from './state'; 
import { useTranslations } from 'next-intl';
import { currentConnectionAtom } from '@/shared/stores/app.store';

interface QueryInsightsLayoutProps {
    children: ReactNode;
}

export default function QueryInsightsLayout({ children }: QueryInsightsLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const t = useTranslations('Monitoring');
    const params = useParams();
    const currentConnection = useAtomValue(currentConnectionAtom);
    console.log('QueryInsightsLayout params:', params);
    const { organization, connectionId } = params as { organization: string; connectionId: string };
    const isCurrentRouteConnection = currentConnection?.connection.id === connectionId;
    const isClickhouseConnection = isCurrentRouteConnection && currentConnection?.connection.type === 'clickhouse';

    
    const currentTab = useMemo<'overview' | 'logs' | 'slow-queries' | 'error-queries'>(() => {
        if (pathname?.includes('/monitoring/logs')) return 'logs';
        if (pathname?.includes('/monitoring/slow-queries')) return 'slow-queries';
        if (pathname?.includes('/monitoring/error-queries')) return 'error-queries';
        return 'overview';
    }, [pathname]);

    const enableDynamicThreshold = useMemo(() => {
        return currentTab === 'slow-queries' || currentTab === 'overview';
    }, [currentTab]);

    const handleTabChange = (value: string) => {
        if (value === currentTab) return;

        const qs = searchParams.toString();
        const base = `/${organization}/${connectionId}/monitoring/${value}`;
        router.push(qs ? `${base}?${qs}` : base);
    };

    
    const filters = useQueryInsightsFiltersValue();

    
    useEffect(() => {
        console.log('filters changed, invalidate monitoring', filters);
        queryClient.invalidateQueries({ queryKey: ['monitoring'] });
    }, [
        queryClient,
        filters.user,
        filters.database,
        filters.queryType,
        filters.timeRange,
        filters.minDurationMs,
        filters.search,
        
    ]);

    useEffect(() => {
        if (!organization || !connectionId || !isCurrentRouteConnection) return;
        if (isClickhouseConnection) return;

        router.replace(`/${organization}/${connectionId}/sql-console`);
    }, [connectionId, isClickhouseConnection, isCurrentRouteConnection, router, organization]);

    
    const handleRefresh = () => {
        console.log('Manually refreshing Monitoring data...');
        queryClient.invalidateQueries({ queryKey: ['monitoring'] });
    };

    if (isCurrentRouteConnection && !isClickhouseConnection) {
        return null;
    }

    return (
        <div className="p-6">
            <Tabs value={currentTab} onValueChange={handleTabChange}>
                <TabsList>
                    <TabsTrigger value="overview" className="cursor-pointer">
                        {t('Tabs.Overview')}
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="cursor-pointer">
                        {t('Tabs.QueryLogs')}
                    </TabsTrigger>
                    <TabsTrigger value="slow-queries" className="cursor-pointer">
                        {t('Tabs.SlowQueries')}
                    </TabsTrigger>
                    <TabsTrigger value="error-queries" className="cursor-pointer">
                        {t('Tabs.ErrorQueries')}
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="mt-4 space-y-4">
                
                <QueryInsightsFilterBar onRefresh={handleRefresh} enableDynamicThreshold={enableDynamicThreshold} />
                {children}
            </div>
        </div>
    );
}
