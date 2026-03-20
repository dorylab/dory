import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';

export default function ExplorerLoading() {
    return (
        <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-56 w-full" />
        </div>
    );
}
