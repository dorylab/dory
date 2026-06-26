'use client';

import type { User } from 'better-auth';
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@/registry/new-york-v4/ui/sidebar';
import { SettingsProvider } from '../../components/settings/settings';
import { AppContentShell } from './app-sidebar/app-content-shell';
import { AppSidebar } from './app-sidebar/app-sidebar';
import { ConnectionDialogRoot } from '../connections/components/connection-dialog-root';

function CollapsedSidebarTrigger() {
    const { isMobile, state } = useSidebar();

    if (isMobile || state !== 'collapsed') {
        return null;
    }

    return <SidebarTrigger className="absolute left-3 top-3 z-50 size-8 border border-border bg-background/95 shadow-sm backdrop-blur hover:bg-muted" aria-label="Open sidebar" />;
}

export function OrganizationAppShell({
    children,
    defaultOpen,
    initialUser,
    organizationId,
    runtime,
    billingManagementAvailable,
    desktopBillingHandoff,
    enterpriseLicense,
}: {
    children: React.ReactNode;
    defaultOpen: boolean;
    initialUser: User | null;
    organizationId: string;
    runtime: string;
    billingManagementAvailable: boolean;
    desktopBillingHandoff: boolean;
    enterpriseLicense: boolean;
}) {
    return (
        <SettingsProvider
            includeOrganizationSettings
            includeBillingSettings={billingManagementAvailable || desktopBillingHandoff}
            currentOrganizationId={organizationId}
            initialUserId={initialUser?.id ?? null}
            runtime={runtime}
            billingManagementAvailable={billingManagementAvailable}
            desktopBillingHandoff={desktopBillingHandoff}
        >
            <div className="flex h-screen min-h-0 flex-col overflow-hidden">
                <SidebarProvider
                    className="flex-1 !min-h-0"
                    defaultOpen={defaultOpen}
                    style={
                        {
                            '--sidebar-width': 'calc(var(--spacing) * 50)',
                            '--sidebar-width-icon': '40px',
                        } as React.CSSProperties
                    }
                >
                    <ConnectionDialogRoot />
                    <AppSidebar
                        className="md:top-0 md:bottom-0 md:h-auto"
                        variant="inset"
                        collapsible="offcanvas"
                        initialUser={initialUser}
                        organizationId={organizationId}
                        enterpriseLicense={enterpriseLicense}
                    />
                    <SidebarInset className="flex min-h-0 min-w-0 flex-col" style={{ height: 'calc(100% - 1rem)' }}>
                        <CollapsedSidebarTrigger />
                        <AppContentShell>{children}</AppContentShell>
                    </SidebarInset>
                </SidebarProvider>
            </div>
        </SettingsProvider>
    );
}
