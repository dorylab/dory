'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BadgeCheck, Bot, Building2 } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';

type OrganizationSettingsTab = {
    slug: 'organization' | 'ai' | 'billing';
    label: string;
};

const tabIcons = {
    organization: Building2,
    ai: Bot,
    billing: BadgeCheck,
} satisfies Record<OrganizationSettingsTab['slug'], typeof Building2>;

export function OrganizationSettingsTabs({ organization, items }: { organization: string; items: OrganizationSettingsTab[] }) {
    const pathname = usePathname();
    const activeTab = pathname.endsWith('/settings/billing') ? 'billing' : pathname.endsWith('/settings/ai') ? 'ai' : 'organization';

    return (
        <Tabs value={activeTab} className="w-fit">
            <TabsList>
                {items.map(item => {
                    const Icon = tabIcons[item.slug];

                    return (
                        <TabsTrigger key={item.slug} value={item.slug} asChild>
                            <Link href={`/${organization}/settings/${item.slug}`}>
                                <Icon className="size-4" />
                                {item.label}
                            </Link>
                        </TabsTrigger>
                    );
                })}
            </TabsList>
        </Tabs>
    );
}
