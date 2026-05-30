'use client';

import { useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { OrganizationSettingsTabs, type OrganizationSettingsTab } from './organization-settings-tabs';

type OrganizationSettingsMeta = Record<OrganizationSettingsTab['slug'], { title: string; description: string }>;

export function OrganizationSettingsShell({
    organization,
    items,
    meta,
    children,
}: {
    organization: string;
    items: OrganizationSettingsTab[];
    meta: OrganizationSettingsMeta;
    children: ReactNode;
}) {
    const pathname = usePathname();
    const activeSlug = useMemo<OrganizationSettingsTab['slug']>(() => {
        const match = items.find(
            item => pathname === `/${organization}/settings/${item.slug}` || pathname?.startsWith(`/${organization}/settings/${item.slug}/`),
        );
        return match?.slug ?? 'organization';
    }, [items, organization, pathname]);
    const activeMeta = meta[activeSlug] ?? meta.organization;

    return (
        <div className="grid h-full min-h-0 w-full grid-cols-1 gap-3 overflow-hidden bg-background px-2 py-3 md:grid-cols-[196px_minmax(0,1fr)] md:gap-0 md:px-3 md:py-4">
            <OrganizationSettingsTabs organization={organization} items={items} activeSlug={activeSlug} />
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-auto md:pl-4">
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold tracking-tight">{activeMeta.title}</h2>
                    <p className="text-sm text-muted-foreground">{activeMeta.description}</p>
                </div>
                {children}
            </div>
        </div>
    );
}
