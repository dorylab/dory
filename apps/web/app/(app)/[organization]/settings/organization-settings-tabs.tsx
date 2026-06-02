'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BadgeCheck, Bot, Building2, Users } from 'lucide-react';

import { cn } from '@dory/web-utils';

export type OrganizationSettingsTab = {
    slug: 'organization' | 'members' | 'ai' | 'billing';
    label: string;
};

const tabIcons = {
    organization: Building2,
    members: Users,
    ai: Bot,
    billing: BadgeCheck,
} satisfies Record<OrganizationSettingsTab['slug'], typeof Building2>;

export function OrganizationSettingsTabs({
    organization,
    items,
    activeSlug,
    onSelect,
}: {
    organization: string;
    items: OrganizationSettingsTab[];
    activeSlug?: OrganizationSettingsTab['slug'];
    onSelect?: (slug: OrganizationSettingsTab['slug']) => void;
}) {
    const pathname = usePathname();

    return (
        <nav className="flex min-h-0 flex-col border-b pb-3 md:h-full md:border-b-0 md:border-r md:pb-0 md:pr-3" aria-label="Organization settings">
            <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                {items.map(item => {
                    const Icon = tabIcons[item.slug];
                    const href = `/${organization}/settings/${item.slug}`;
                    const active = activeSlug ? activeSlug === item.slug : pathname === href || pathname?.startsWith(`${href}/`);
                    const className = cn(
                        'relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground md:w-full',
                        active && 'bg-muted/40 text-foreground',
                    );
                    const content = (
                        <>
                            {active ? <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-primary" /> : null}
                            <Icon className="size-4 shrink-0" />
                            <span className="min-w-0 truncate">{item.label}</span>
                        </>
                    );

                    if (onSelect) {
                        return (
                            <button key={item.slug} type="button" className={cn(className, 'text-left')} onClick={() => onSelect(item.slug)}>
                                {content}
                            </button>
                        );
                    }

                    return (
                        <Link key={item.slug} href={href} className={className}>
                            {content}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
