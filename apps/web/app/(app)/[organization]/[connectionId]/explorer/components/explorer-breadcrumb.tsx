'use client';

import Link from 'next/link';

import type { BreadcrumbItem as ExplorerBreadcrumbItem } from '@/lib/explorer/types';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/registry/new-york-v4/ui/breadcrumb';

type ExplorerBreadcrumbProps = {
    items: ExplorerBreadcrumbItem[];
};

export function ExplorerBreadcrumb({ items }: ExplorerBreadcrumbProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <Breadcrumb>
            <BreadcrumbList>
                {items.map((item, index) => (
                    <BreadcrumbItem key={`${item.label}-${item.href}`}>
                        <BreadcrumbLink asChild>
                            <Link href={item.href}>{item.label}</Link>
                        </BreadcrumbLink>
                        {index < items.length - 1 ? <BreadcrumbSeparator /> : null}
                    </BreadcrumbItem>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    );
}
