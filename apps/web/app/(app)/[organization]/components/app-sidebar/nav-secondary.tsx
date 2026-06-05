'use client';

import * as React from 'react';
import type { Icon } from '@tabler/icons-react';
import Link from 'next/link';

import { ExternalLink } from 'lucide-react';
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/registry/new-york-v4/ui/sidebar';
import { SidebarSettingsEntry, SidebarThemeEntry } from './nav-settings';
import { cn } from '@dory/web-utils';

export function NavSecondary({
    items,
    disabled = false,
    onOpenExternal,
    ...props
}: {
    items: {
        title: string;
        url: string;
        icon: Icon;
        external?: boolean;
    }[];
    disabled?: boolean;
    onOpenExternal?: (event: React.MouseEvent<HTMLAnchorElement>, url: string) => void;
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
    return (
        <SidebarGroup {...props} className={cn(props.className)}>
            <SidebarGroupContent>
                <SidebarMenu>
                    <SidebarThemeEntry />
                    <SidebarSettingsEntry />
                    {items.map(item => {
                        const IconComp = item.icon;

                        const content = (
                            <Link
                                href={item.url}
                                target={item.external ? '_blank' : undefined}
                                rel={item.external ? 'noreferrer' : undefined}
                                aria-disabled={disabled}
                                tabIndex={disabled ? -1 : 0}
                                onClick={e => {
                                    if (disabled) {
                                        e.preventDefault();
                                        return;
                                    }

                                    if (item.external) {
                                        onOpenExternal?.(e, item.url);
                                    }
                                }}
                                className={cn(
                                    'flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0',
                                    disabled && 'cursor-not-allowed opacity-60 text-muted-foreground',
                                )}
                            >
                                {IconComp && <IconComp className="h-4 w-4 shrink-0" />}
                                <span>{item.title}</span>
                                {item.external && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
                            </Link>
                        );

                        return (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton asChild className={cn(disabled && 'pointer-events-none hover:bg-transparent hover:text-muted-foreground')}>
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
