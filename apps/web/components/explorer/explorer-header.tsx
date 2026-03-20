'use client';

import type { BreadcrumbItem as ExplorerBreadcrumbItem } from '@/lib/explorer/types';
import { ExplorerBreadcrumb } from '@/app/(app)/[organization]/[connectionId]/explorer/components/explorer-breadcrumb';
import { Badge } from '@/registry/new-york-v4/ui/badge';

type ExplorerHeaderProps = {
    breadcrumbs: ExplorerBreadcrumbItem[];
    badgeLabel?: string;
};

export function ExplorerHeader({ breadcrumbs, badgeLabel }: ExplorerHeaderProps) {
    if (breadcrumbs.length === 0 && !badgeLabel) {
        return null;
    }

    return (
        <div className="flex items-center justify-between gap-4 border-b px-6 py-3">
            <ExplorerBreadcrumb items={breadcrumbs} />
            {badgeLabel ? (
                <Badge variant="outline" className="shrink-0">
                    {badgeLabel}
                </Badge>
            ) : null}
        </div>
    );
}
