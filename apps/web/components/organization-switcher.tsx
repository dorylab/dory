'use client';

import * as React from 'react';
import { Building2, ChevronsUpDown, Loader2, Plus, Settings } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

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
import { createOrganization, listOrganizations, setActiveOrganization, slugifyOrganizationName } from '@/lib/organization/api';
import { useSettings } from '@/app/(app)/components/settings/settings';

function replaceOrganizationInPath(pathname: string, currentSlug: string | undefined, nextSlug: string) {
    if (!currentSlug) {
        return `/${nextSlug}/connections`;
    }

    const segments = pathname.split('/').filter(Boolean);
    if (!segments.length) {
        return `/${nextSlug}/connections`;
    }

    segments[0] = nextSlug;
    return `/${segments.join('/')}`;
}

export function OrganizationSwitcher() {
    const { isMobile } = useSidebar();
    const router = useRouter();
    const pathname = usePathname();
    const params = useParams<{ organization?: string }>();
    const { openSettings } = useSettings();
    const currentOrganizationSlug = params.organization;
    const [submitting, setSubmitting] = React.useState<string | null>(null);
    const organizationsQuery = useQuery({
        queryKey: ['organization-list'],
        queryFn: listOrganizations,
    });

    const organizations = organizationsQuery.data ?? [];
    const activeOrganization =
        organizations.find(org => org.slug === currentOrganizationSlug || org.id === currentOrganizationSlug) ?? organizations[0];

    if (!activeOrganization) {
        return null;
    }

    const handleSwitch = async (organizationId: string, slug: string) => {
        try {
            setSubmitting(organizationId);
            await setActiveOrganization({ organizationId });
            router.push(replaceOrganizationInPath(pathname, currentOrganizationSlug, slug));
            router.refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to switch organization');
        } finally {
            setSubmitting(null);
        }
    };

    const handleCreate = async () => {
        const name = window.prompt('Organization name');
        if (!name?.trim()) return;

        try {
            setSubmitting('create');
            const organization = await createOrganization({
                name: name.trim(),
                slug: `${slugifyOrganizationName(name)}-${crypto.randomUUID().slice(0, 8)}`,
            });
            router.push(`/${organization.slug}/connections`);
            router.refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create organization');
        } finally {
            setSubmitting(null);
        }
    };

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
                                <Building2 className="size-4" />
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">{activeOrganization.name}</span>
                                <span className="truncate text-xs">{activeOrganization.slug}</span>
                            </div>
                            {organizationsQuery.isLoading || submitting ? <Loader2 className="ml-auto size-4 animate-spin" /> : <ChevronsUpDown className="ml-auto" />}
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
                                key={organization.id}
                                onClick={() => void handleSwitch(organization.id, organization.slug)}
                                className="gap-2 p-2"
                            >
                                <div className="flex size-6 items-center justify-center rounded-xs border">
                                    <Building2 className="size-4 shrink-0" />
                                </div>
                                {organization.name}
                                <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 p-2" onClick={() => void handleCreate()}>
                            <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                                <Plus className="size-4" />
                            </div>
                            <div className="text-muted-foreground font-medium">Add organization</div>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 p-2" onClick={() => openSettings('organization')}>
                            <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                                <Settings className="size-4" />
                            </div>
                            <div className="text-muted-foreground font-medium">Organization settings</div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
