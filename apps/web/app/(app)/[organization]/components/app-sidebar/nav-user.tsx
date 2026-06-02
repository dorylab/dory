'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { IconDotsVertical, IconLogin2, IconLogout } from '@tabler/icons-react';
import { ClipboardList, LockKeyhole } from 'lucide-react';
import { Avatar, AvatarImage } from '@/registry/new-york-v4/ui/avatar';
import BoringAvatar from 'boring-avatars';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, useSidebar } from '@/registry/new-york-v4/ui/sidebar';
import { signOut } from '@/lib/auth-client';
import { AuthLinkSheet } from '@/components/auth/auth-link-sheet';
import { User } from 'better-auth';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';
import { getOrganizationBillingStatus } from '@/lib/billing/api';
import { getOrganizationAccess } from '@/lib/organization/api';
import { useSettings } from '../../../components/settings/settings';
import { cn } from '@dory/web-utils';

function PlanBadge({ label, plan }: { label: string; plan: 'hobby' | 'pro' }) {
    return (
        <span
            className={cn(
                'inline-flex h-4 shrink-0 items-center rounded-full border px-1.5 text-[10px] font-medium leading-none',
                plan === 'pro' ? 'border-primary/25 bg-primary/10 text-primary' : 'border-sidebar-border bg-sidebar-accent text-muted-foreground',
            )}
        >
            {label}
        </span>
    );
}

export function NavUser({ user, organizationId }: { user: User | null; organizationId: string }) {
    const { isMobile, state } = useSidebar();
    const params = useParams<{ organization?: string }>();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const t = useTranslations('AppSidebar');
    const planT = useTranslations('OrganizationSettings.Billing.Plan');
    const { openSettings } = useSettings();
    const collapsed = state === 'collapsed';
    const [authSheetOpen, setAuthSheetOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState<string | null>(null);
    const isAnonymous = isAnonymousUser(user);

    const callbackURL = (() => {
        const query = searchParams?.toString();
        return query ? `${pathname}?${query}` : pathname || '/';
    })();

    const displayName = isAnonymous ? t('GuestSession.Name') : user?.name;
    const displaySubtitle = isAnonymous ? t('GuestSession.Subtitle') : user?.email;
    const billingStatusQuery = useQuery({
        queryKey: ['organization-billing', organizationId],
        queryFn: () => getOrganizationBillingStatus(organizationId),
        enabled: Boolean(organizationId) && !isAnonymous,
        retry: false,
        staleTime: 60_000,
    });
    const accessQuery = useQuery({
        queryKey: ['organization-access', organizationId],
        queryFn: () => getOrganizationAccess(organizationId),
        enabled: Boolean(organizationId) && !isAnonymous,
        retry: false,
        staleTime: 60_000,
    });
    const plan = billingStatusQuery.data?.plan ?? null;
    const planLabel = plan === 'pro' ? planT('Pro') : plan === 'hobby' ? planT('Hobby') : null;
    const canViewQueryAudit = accessQuery.data?.role === 'owner' || accessQuery.data?.role === 'admin';
    const canUseQueryAudit = plan === 'pro';
    const queryAuditPlanResolved = plan !== null || billingStatusQuery.isError;
    const organizationSlug = params.organization ?? pathname?.split('/').filter(Boolean)[0] ?? '';

    function handleLockedQueryAudit(event: Event) {
        event.preventDefault();
        setMenuOpen(false);
        window.setTimeout(() => openSettings('billing'), 0);
    }

    function handleSignIn() {
        setMenuOpen(false);
        setAuthSheetOpen(true);
    }

    async function handleSignOut() {
        setMenuOpen(false);
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
                    <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate font-medium">{displayName}</span>
                            {plan && planLabel ? <PlanBadge label={planLabel} plan={plan} /> : null}
                        </div>
                        <span className="text-muted-foreground truncate text-xs">{displaySubtitle}</span>
                    </div>
                </div>
            </DropdownMenuLabel>
            {isAnonymous ? (
                <DropdownMenuItem
                    onSelect={() => {
                        handleSignIn();
                    }}
                >
                    <IconLogin2 />
                    {t('GuestSession.SignIn')}
                </DropdownMenuItem>
            ) : null}
            {canViewQueryAudit && organizationSlug && queryAuditPlanResolved ? (
                <>
                    <DropdownMenuSeparator />
                    {canUseQueryAudit ? (
                        <DropdownMenuItem asChild onSelect={() => setMenuOpen(false)}>
                            <Link href={`/${organizationSlug}/query-audit`}>
                                <ClipboardList />
                                Query Audit
                            </Link>
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem onSelect={handleLockedQueryAudit}>
                            <ClipboardList />
                            <span className="min-w-0 flex-1">Query Audit</span>
                            <span className="ml-auto inline-flex h-4 shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 text-[10px] font-medium leading-none text-primary">
                                <LockKeyhole className="size-2.5" />
                                Pro
                            </span>
                        </DropdownMenuItem>
                    )}
                </>
            ) : null}
            <DropdownMenuItem
                onSelect={async () => {
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
                    <SidebarTrigger className="size-8 shrink-0" />
                </div>
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="lg" className="w-full justify-center px-0 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                            <Avatar className="h-8 w-8 rounded-lg">
                                <AvatarImage src={user?.image || ''} alt={displayName} />
                                <BoringAvatar size={32} name={displayName || ''} variant="beam" />
                            </Avatar>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="min-w-0 flex-1 truncate font-medium">{displayName}</span>
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
                    <div className="flex w-full min-w-0 items-center gap-0.5">
                        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton
                                    size="lg"
                                    className="h-10 w-auto min-w-0 flex-1 basis-0 gap-1.5 px-1.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                                >
                                    <Avatar className="h-7 w-7 rounded-md">
                                        <AvatarImage src={user?.image || ''} alt={displayName} />
                                        <BoringAvatar size={28} name={displayName || ''} variant="beam" />
                                    </Avatar>
                                    <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                                        <div className="flex min-w-0 items-center gap-1">
                                            <span className="min-w-0 truncate font-medium">{displayName}</span>
                                            {/* {plan && planLabel ? <PlanBadge label={planLabel} plan={plan} /> : null} */}
                                        </div>
                                    </div>
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>
                            {renderMenuContent()}
                        </DropdownMenu>
                        <SidebarTrigger className="size-7 shrink-0 cursor-pointer" />
                    </div>
                </SidebarMenuItem>
            </SidebarMenu>
            <AuthLinkSheet open={authSheetOpen} onOpenChange={setAuthSheetOpen} callbackURL={callbackURL} />
        </>
    );
}
