import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';

export default function MonitoringOverviewLoading() {
    return (
        <div data-testid="monitoring-overview-loading" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-28" />
                ))}
            </div>
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-64 w-full" />
        </div>
    );
}
