'use client';

import { IconCreditCard, IconDotsVertical, IconLogout, IconNotification, IconUserCircle } from '@tabler/icons-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/registry/new-york-v4/ui/avatar';
import BoringAvatar from 'boring-avatars';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, useSidebar } from '@/registry/new-york-v4/ui/sidebar';
import { signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { ModeToggle } from '@/components/mode-toggle';
import { User } from 'better-auth';


export function NavUser({
    user,
}: {
    user: User | null
}) {
    const { isMobile, state } = useSidebar();
    const router = useRouter();
    const collapsed = state === 'collapsed';
    if (collapsed) {
        return (
            <div className="flex flex-col items-center w-[34px]">
                <ModeToggle />
                <SidebarTrigger className="size-1 p-4 -ml-[2px] mb-2" />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                            <Avatar className="h-8 w-8 rounded-lg grayscale">
                                <AvatarImage src={user?.image || ''} alt={user?.name} />
                                <BoringAvatar size={32} name={user?.name || ''} variant="beam" />
                            </Avatar>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{user?.name}</span>
                                {/* <span className="text-muted-foreground truncate text-xs">{user?.email}</span> */}
                            </div>
                            <IconDotsVertical className="ml-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={4}>
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <Avatar className="h-8 w-8 rounded-lg">
                                    <AvatarImage src={user?.image || ''} alt={user?.name} />
                                    <BoringAvatar size={32} name={user?.name || ''} variant="beam" />
                                    {/* <AvatarFallback className="rounded-lg">{user?.name ? user.name.charAt(0) : 'U'}</AvatarFallback> */}
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">{user?.name}</span>
                                    <span className="text-muted-foreground truncate text-xs">{user?.email}</span>
                                </div>
                            </div>
                        </DropdownMenuLabel>
                        {/* <DropdownMenuSeparator /> */}
                        {/* <DropdownMenuGroup>
                            <DropdownMenuItem>
                                <IconUserCircle />
                                Account
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <IconCreditCard />
                                Billing
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <IconNotification />
                                Notifications
                            </DropdownMenuItem>
                        </DropdownMenuGroup> */}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={async e => {
                                e.preventDefault();
                                const res = await signOut();
                                console.log(res);
                                if (res.data?.success) {
                                    router.push('/sign-in');
                                }
                            }}
                        >
                            <IconLogout />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        );
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <div className="flex data-[state=open]:w-full items-center">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                                <Avatar className="h-8 w-8 rounded-lg grayscale">
                                    <AvatarImage src={user?.image || ''} alt={user?.name} />
                                    <BoringAvatar size={32} name={user?.name || ''} variant="beam" />
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">{user?.name}</span>
                                </div>
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                            side={isMobile ? 'bottom' : 'right'}
                            align="end"
                            sideOffset={4}
                        >
                            <DropdownMenuLabel className="p-0 font-normal">
                                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                    <Avatar className="h-8 w-8 rounded-lg">
                                        <AvatarImage src={user?.image || ''} alt={user?.name} />
                                        <BoringAvatar size={32} name={user?.name || ''} variant="beam" />
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-medium">{user?.name}</span>
                                        <span className="text-muted-foreground truncate text-xs">{user?.email}</span>
                                    </div>
                                </div>
                            </DropdownMenuLabel>
                            {/* <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem>
                                    <IconUserCircle />
                                    Account
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <IconCreditCard />
                                    Billing
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <IconNotification />
                                    Notifications
                                </DropdownMenuItem>
                            </DropdownMenuGroup> */}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={async e => {
                                    e.preventDefault();
                                    const res = await signOut();
                                    console.log(res);
                                    if (res.data?.success) {
                                        router.push('/sign-in');
                                    }
                                }}
                            >
                                <IconLogout />
                                Log out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <ModeToggle />
                    <SidebarTrigger className="ml-2 cursor-pointer" />
                </div>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
