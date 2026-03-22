'use client';

import { IconDotsVertical, IconLogout } from '@tabler/icons-react';

import { Avatar, AvatarImage } from '@/registry/new-york-v4/ui/avatar';
import BoringAvatar from 'boring-avatars';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, useSidebar } from '@/registry/new-york-v4/ui/sidebar';
import { signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { ModeToggle } from '@/components/mode-toggle';
import { User } from 'better-auth';

export function NavUser({ user }: { user: User | null }) {
    const { isMobile, state } = useSidebar();
    const router = useRouter();
    const collapsed = state === 'collapsed';

    const renderMenuContent = () => (
        <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={4}>
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
    );

    if (collapsed) {
        return (
            <div className="flex w-full flex-col items-center gap-2 px-2">
                <div className="flex w-full justify-center">
                    <ModeToggle />
                </div>
                <div className="flex w-full justify-center">
                    <SidebarTrigger className="size-8 shrink-0" />
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="lg" className="w-full justify-center px-0 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
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
                    {renderMenuContent()}
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
                        {renderMenuContent()}
                    </DropdownMenu>
                    <ModeToggle />
                    <SidebarTrigger className="ml-2 cursor-pointer" />
                </div>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
