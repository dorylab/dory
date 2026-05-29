'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BadgeCheck, Bot, Building2, ClipboardList, Users } from 'lucide-react';

import { cn } from '@dory/web-utils';

type OrganizationSettingsTab = {
    slug: 'organization' | 'members' | 'ai' | 'query-audit' | 'billing';
    label: string;
};

const tabIcons = {
    organization: Building2,
    members: Users,
    ai: Bot,
    'query-audit': ClipboardList,
    billing: BadgeCheck,
} satisfies Record<OrganizationSettingsTab['slug'], typeof Building2>;

export function OrganizationSettingsTabs({ organization, items }: { organization: string; items: OrganizationSettingsTab[] }) {
    const pathname = usePathname();

    return (
        <nav className="border-b pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-3" aria-label="Organization settings">
            <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                {items.map(item => {
                    const Icon = tabIcons[item.slug];
                    const href = `/${organization}/settings/${item.slug}`;
                    const active = pathname === href || pathname?.startsWith(`${href}/`);

                    return (
                        <Link
                            key={item.slug}
                            href={href}
                            className={cn(
                                'flex h-9 shrink-0 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:w-full',
                                active && 'bg-muted text-foreground',
                            )}
                        >
                            <Icon className="size-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
