'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@dory/web-utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from '@/registry/new-york-v4/ui/sidebar';
import { instantNavigationEnabled } from '@/lib/env';

export type NavItem = {
    title: string;
    url: string;
    matchPrefix?: string;
    icon?: ComponentType<{ className?: string }>;
    requiresConnection?: boolean;
    instantNavigation?: boolean;
};

function getIsDisabled(item: NavItem, disabled: boolean, hasActiveConnection: boolean) {
    return item.requiresConnection ? disabled || !hasActiveConnection : false;
}

function getIsActive(item: NavItem, pathname: string, disabled: boolean, hasActiveConnection: boolean) {
    if (getIsDisabled(item, disabled, hasActiveConnection)) return false;
    const matchBase = item.matchPrefix ?? item.url;
    return pathname === item.url || pathname.startsWith(`${item.url}/`) || pathname === matchBase || pathname.startsWith(`${matchBase}/`);
}

export function NavMain({
    items,
    disabled = false,
    hasActiveConnection = false,
    moreItems = [],
    moreTitle,
    className,
}: {
    items: NavItem[];
    disabled?: boolean;
    hasActiveConnection?: boolean;
    moreItems?: NavItem[];
    moreTitle?: string;
    className?: string;
}) {
    const pathname = usePathname();
    const hasActiveMoreItem = moreItems.some(item => getIsActive(item, pathname, disabled, hasActiveConnection));
    const [moreOpen, setMoreOpen] = useState(hasActiveMoreItem);

    useEffect(() => {
        if (hasActiveMoreItem) setMoreOpen(true);
    }, [hasActiveMoreItem]);

    return (
        <SidebarGroup className={cn(className)}>
            <SidebarGroupContent className="flex flex-col gap-2">
                <SidebarMenu>
                    {items.map(item => {
                        const IconComp = item.icon;
                        const itemDisabled = getIsDisabled(item, disabled, hasActiveConnection);
                        const isActive = getIsActive(item, pathname, disabled, hasActiveConnection);
                        const shouldPrefetch = instantNavigationEnabled && item.instantNavigation === true;

                        const content = itemDisabled ? (
                            <span
                                aria-disabled="true"
                                className={cn(
                                    'flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0',
                                    'cursor-not-allowed opacity-60 text-muted-foreground',
                                )}
                            >
                                {IconComp && <IconComp className="h-4 w-4 shrink-0" />}
                                <span>{item.title}</span>
                            </span>
                        ) : (
                            <Link
                                href={item.url}
                                prefetch={shouldPrefetch ? null : false}
                                className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                            >
                                {IconComp && <IconComp className="h-4 w-4 shrink-0" />}
                                <span>{item.title}</span>
                            </Link>
                        );

                        return (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton
                                    asChild
                                    tooltip={item.title}
                                    isActive={isActive}
                                    className={cn(
                                        'data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary/90 data-[active=true]:hover:text-primary-foreground data-[active=true]:active:bg-primary/90 data-[active=true]:active:text-primary-foreground',
                                    )}
                                >
                                    {content}
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    })}
                    {moreItems.length && moreTitle ? (
                        <Collapsible asChild open={moreOpen} onOpenChange={setMoreOpen} className="group/collapsible">
                            <SidebarMenuItem>
                                <CollapsibleTrigger asChild>
                                    <SidebarMenuButton
                                        type="button"
                                        tooltip={moreTitle}
                                    >
                                        <MoreHorizontal className="h-4 w-4 shrink-0" />
                                        <span>{moreTitle}</span>
                                        <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                    </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <SidebarMenuSub>
                                        {moreItems.map(item => {
                                            const IconComp = item.icon;
                                            const itemDisabled = getIsDisabled(item, disabled, hasActiveConnection);
                                            const isActive = getIsActive(item, pathname, disabled, hasActiveConnection);
                                            const shouldPrefetch = instantNavigationEnabled && item.instantNavigation === true;

                                            return (
                                                <SidebarMenuSubItem key={item.title}>
                                                    {itemDisabled ? (
                                                        <span aria-disabled="true" className="flex cursor-not-allowed items-center gap-2 px-2 text-sm text-muted-foreground opacity-60">
                                                            {IconComp ? <IconComp className="h-4 w-4 shrink-0" /> : null}
                                                            <span>{item.title}</span>
                                                        </span>
                                                    ) : (
                                                        <SidebarMenuSubButton
                                                            asChild
                                                            isActive={isActive}
                                                            className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary/90 data-[active=true]:hover:text-primary-foreground data-[active=true]:active:bg-primary/90 data-[active=true]:active:text-primary-foreground data-[active=true]:[&>svg]:!text-primary-foreground"
                                                        >
                                                            <Link href={item.url} prefetch={shouldPrefetch ? null : false}>
                                                                {IconComp ? <IconComp className="h-4 w-4 shrink-0" /> : null}
                                                                <span>{item.title}</span>
                                                            </Link>
                                                        </SidebarMenuSubButton>
                                                    )}
                                                </SidebarMenuSubItem>
                                            );
                                        })}
                                    </SidebarMenuSub>
                                </CollapsibleContent>
                            </SidebarMenuItem>
                        </Collapsible>
                    ) : null}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}
