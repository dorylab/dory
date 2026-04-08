'use client';

import { AppCapabilitiesProvider } from '@/components/app-capabilities-provider';
import { SidebarInset, SidebarProvider } from '@/registry/new-york-v4/ui/sidebar';
import { SettingsProvider } from '../../components/settings/settings';
import { AppContentShell } from './app-sidebar/app-content-shell';
import { AppSidebar } from './app-sidebar/app-sidebar';
import { OfflineModeBanner } from './offline-mode-banner';

export function OrganizationAppShell({
    children,
    defaultOpen,
    initialUser,
    isOffline,
    canUseCloudFeatures,
}: {
    children: React.ReactNode;
    defaultOpen: boolean;
    initialUser: any;
    isOffline: boolean;
    canUseCloudFeatures: boolean;
}) {
    return (
        <AppCapabilitiesProvider value={{ isOffline, canUseCloudFeatures }}>
            <SettingsProvider>
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
                        <AppSidebar
                            className="md:top-0 md:bottom-0 md:h-auto"
                            variant="inset"
                            collapsible="icon"
                            initialUser={initialUser}
                        />
                        <SidebarInset className="flex min-h-0 flex-col" style={{ height: 'calc(100% - 1rem)', width: 'calc(100% - 248px)' }}>
                            <AppContentShell>
                                {isOffline ? (
                                    <div className="px-4 pt-4">
                                        <OfflineModeBanner />
                                    </div>
                                ) : null}
                                {children}
                            </AppContentShell>
                        </SidebarInset>
                    </SidebarProvider>
                </div>
            </SettingsProvider>
        </AppCapabilitiesProvider>
    );
}
