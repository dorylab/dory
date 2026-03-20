'use client';

import * as React from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/registry/new-york-v4/ui/sidebar';

export function OrganizationSwitcher({
    organizations,
}: {
    organizations: {
        name: string;
        logo: React.ElementType;
        plan: string;
    }[];
}) {
    const { isMobile } = useSidebar();
    const [activeOrganization, setActiveOrganization] = React.useState(organizations[0]);

    if (!activeOrganization) {
        return null;
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                                <activeOrganization.logo className="size-4" />
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">{activeOrganization.name}</span>
                                <span className="truncate text-xs">{activeOrganization.plan}</span>
                            </div>
                            <ChevronsUpDown className="ml-auto" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        align="start"
                        side={isMobile ? 'bottom' : 'right'}
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="text-muted-foreground text-xs">
                            Organizations
                        </DropdownMenuLabel>
                        {organizations.map((organization, index) => (
                            <DropdownMenuItem
                                key={organization.name}
                                onClick={() => setActiveOrganization(organization)}
                                className="gap-2 p-2"
                            >
                                <div className="flex size-6 items-center justify-center rounded-xs border">
                                    <organization.logo className="size-4 shrink-0" />
                                </div>
                                {organization.name}
                                <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 p-2">
                            <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                                <Plus className="size-4" />
                            </div>
                            <div className="text-muted-foreground font-medium">Add organization</div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
