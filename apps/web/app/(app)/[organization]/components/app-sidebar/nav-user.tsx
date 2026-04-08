'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { IconDotsVertical, IconLogin2, IconLogout } from '@tabler/icons-react';
import { Avatar, AvatarImage } from '@/registry/new-york-v4/ui/avatar';
import BoringAvatar from 'boring-avatars';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, useSidebar } from '@/registry/new-york-v4/ui/sidebar';
import { signOut } from '@/lib/auth-client';
import { ModeToggle } from '@/components/mode-toggle';
import { AuthLinkSheet } from '@/components/auth/auth-link-sheet';
import { User } from 'better-auth';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';

export function NavUser({ user }: { user: User | null }) {
    const { isMobile, state } = useSidebar();
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('AppSidebar');
    const collapsed = state === 'collapsed';
    const [authSheetOpen, setAuthSheetOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState<string | null>(null);
    const isAnonymous = isAnonymousUser(user);

    const callbackURL = (() => {
        const query = searchParams?.toString();
        return query ? `${pathname}?${query}` : pathname || '/';
    })();

    const displayName = isAnonymous ? t('GuestSession.Name') : user?.name;
    const displaySubtitle = isAnonymous ? t('GuestSession.Subtitle') : user?.email;

    function handleSignIn() {
        setAuthSheetOpen(true);
    }

    async function handleSignOut() {
        setSigningOut(true);
        setSignOutError(null);

        try {
            const res = await signOut();
            if (res.data?.success) {
                window.location.assign('/sign-in');
                return;
            }
            setSignOutError(isAnonymous ? t('GuestSession.DeleteFailed') : null);
        } catch {
            setSignOutError(isAnonymous ? t('GuestSession.DeleteFailed') : null);
        } finally {
            setSigningOut(false);
        }
    }

    const renderMenuContent = () => (
        <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage src={user?.image || ''} alt={displayName} />
                        <BoringAvatar size={32} name={displayName || ''} variant="beam" />
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">{displayName}</span>
                        <span className="text-muted-foreground truncate text-xs">{displaySubtitle}</span>
                    </div>
                </div>
            </DropdownMenuLabel>
            {isAnonymous ? (
                <DropdownMenuItem
                    onClick={e => {
                        e.preventDefault();
                        handleSignIn();
                    }}
                >
                    <IconLogin2 />
                    {t('GuestSession.SignIn')}
                </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
                onClick={async e => {
                    e.preventDefault();
                    await handleSignOut();
                }}
            >
                <IconLogout />
                {isAnonymous ? t('GuestSession.Exit') : t('LogOut')}
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
                            <Avatar className="h-8 w-8 rounded-lg">
                                <AvatarImage src={user?.image || ''} alt={displayName} />
                                <BoringAvatar size={32} name={displayName || ''} variant="beam" />
                            </Avatar>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{displayName}</span>
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
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <div className="flex data-[state=open]:w-full items-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                                    <Avatar className="h-8 w-8 rounded-lg">
                                        <AvatarImage src={user?.image || ''} alt={displayName} />
                                        <BoringAvatar size={32} name={displayName || ''} variant="beam" />
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-medium">{displayName}</span>
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
            <AuthLinkSheet open={authSheetOpen} onOpenChange={setAuthSheetOpen} callbackURL={callbackURL} />
        </>
    );
}
