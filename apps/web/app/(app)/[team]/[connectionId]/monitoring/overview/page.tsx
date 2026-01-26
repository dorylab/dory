'use client';
import { useQueryInsightsFiltersValue, useSetQueryInsightsLoading } from '../state';
import { useQueryInsightsRecentQueries, useQueryInsightsSummary, useQueryInsightsTimeline } from '../hooks/use-monitoring';
import { QueryInsightsSummaryCards } from '../components/summary';
import { QueryTimeline } from '../components/query-timeline';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RecentQueriesCard } from './components/recent-queries';

export default function QueryInsightsOverview() {
    const filters = useQueryInsightsFiltersValue();
    const router = useRouter();

    const summaryResult = useQueryInsightsSummary(filters);
    const timelineResult = useQueryInsightsTimeline(filters);
    const recentQueriesResult = useQueryInsightsRecentQueries(filters);

    const setLoading = useSetQueryInsightsLoading();

    const mainLoading = summaryResult.loading || timelineResult.loading || recentQueriesResult.loading;

    useEffect(() => {
        setLoading(mainLoading);
    }, [mainLoading, setLoading]);

    return (
        <div>
            <QueryInsightsSummaryCards
                filters={filters}
                summary={summaryResult.data}
                loading={summaryResult.loading}
                onNavigate={target => {
                    switch (target) {
                        case 'total':
                        case 'activeUsers':
                            router.push('logs');
                            break;
                        case 'slow':
                            router.push('slow-queries');
                            break;
                        case 'error':
                            router.push('error-queries');
                            break;
                    }
                }}
            />

            <QueryTimeline points={timelineResult.data} loading={timelineResult.loading} timeRange={filters.timeRange} />

            <RecentQueriesCard
                queries={recentQueriesResult.data}
                loading={recentQueriesResult.loading}
                error={recentQueriesResult.error}
                onViewAll={() => router.push('logs')}
            />
        </div>
    );
}
