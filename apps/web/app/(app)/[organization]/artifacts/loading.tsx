import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';

export default function ArtifactsLoading() {
    return (
        <div className="h-screen overflow-auto bg-n8 p-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        </div>
    );
}
