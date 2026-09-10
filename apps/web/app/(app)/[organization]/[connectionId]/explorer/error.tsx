'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/registry/new-york-v4/ui/button';

export default function ExplorerError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex h-full items-center justify-center p-6">
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div className="text-sm text-muted-foreground">Failed to render the explorer route.</div>
                <Button type="button" onClick={reset}>
                    Try again
                </Button>
            </div>
        </div>
    );
}
