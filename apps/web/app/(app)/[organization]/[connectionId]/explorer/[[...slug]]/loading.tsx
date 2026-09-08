import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';

export default function ExplorerLoading() {
    return (
        <div className="flex min-h-0 flex-1 gap-4 p-4 sm:p-6">
            <aside className="hidden w-64 shrink-0 space-y-3 border-r pr-4 lg:block">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-11/12" />
            </aside>
            <div className="min-w-0 flex-1 space-y-4">
                <Skeleton className="h-7 w-52" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-56 w-full" />
            </div>
        </div>
    );
}
