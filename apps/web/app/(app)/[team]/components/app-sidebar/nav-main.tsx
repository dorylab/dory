'use client';

import type React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/registry/new-york-v4/ui/sidebar';

export type NavItem = {
    title: string;
    url: string;
    icon?: React.ComponentType<{ className?: string }>;
    requiresConnection?: boolean; 
};

export function NavMain({
    items,
    disabled = false, 
    hasActiveConnection = false, 
    className,
}: {
    items: NavItem[];
    disabled?: boolean;
    hasActiveConnection?: boolean;
    className?: string;
}) {
    const pathname = usePathname();

    return (
        <SidebarGroup className={cn(className)}>
            <SidebarGroupContent className="flex flex-col gap-2">
                <SidebarMenu>
                    {items.map(item => {
                        const IconComp = item.icon;
                        const itemDisabled = disabled || (item.requiresConnection && !hasActiveConnection);

                        const isActive = !itemDisabled && (pathname === item.url || pathname.startsWith(`${item.url}/`));

                        const content = (
                            <Link
                                href={item.url}
                                aria-disabled={itemDisabled}
                                tabIndex={itemDisabled ? -1 : 0}
                                onClick={e => {
                                    if (itemDisabled) {
                                        e.preventDefault();
                                    }
                                }}
                                className={cn('flex items-center gap-2', itemDisabled && 'cursor-not-allowed opacity-60 text-muted-foreground')}
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
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}
