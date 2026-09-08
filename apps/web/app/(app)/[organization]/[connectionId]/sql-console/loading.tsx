import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';

export default function SqlConsoleLoading() {
    return (
        <div data-testid="sql-console-loading" className="flex h-full min-h-0 gap-3 p-3">
            <aside className="hidden w-64 shrink-0 space-y-3 border-r pr-3 lg:block">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-5/6" />
            </aside>
            <main className="flex min-w-0 flex-1 flex-col gap-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="min-h-72 flex-1" />
                <Skeleton className="h-36 w-full" />
            </main>
        </div>
    );
}
