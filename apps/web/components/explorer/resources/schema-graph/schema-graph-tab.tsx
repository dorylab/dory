'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import type { ExplorerBaseParams } from '@/lib/explorer/types';

const SchemaGraphCanvas = dynamic(() => import('./schema-graph-canvas').then(module => module.SchemaGraphCanvas), {
    ssr: false,
    loading: () => (
        <div className="flex h-full min-h-[420px] flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="min-h-0 flex-1" />
        </div>
    ),
});

type SchemaGraphTabProps = {
    baseParams: ExplorerBaseParams;
    database: string;
    schema?: string;
};

export function SchemaGraphTab(props: SchemaGraphTabProps) {
    return <SchemaGraphCanvas {...props} />;
}
