'use client';

import { useParams } from 'next/navigation';
import { IconDatabase, IconFileAi, IconHelp, IconUsers } from '@tabler/icons-react';
import type React from 'react';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/registry/new-york-v4/ui/sidebar';
import { NavMain } from './nav-main';
import { NavUser } from './nav-user';
import { authClient } from '@/lib/auth-client';
import { FileChartColumnIncreasing, SquareCode } from 'lucide-react';
import { NavSecondary } from './nav-secondary';
import { ConnectionSwitcher } from './connection-switcher';
import { Separator } from '@/registry/new-york-v4/ui/separator';
import { DoryLogo, DoryLogoLite } from '@/components/@dory/ui/logo';
import { ConnectionDialogRoot } from '../../connections/components/connection-dialog-root';

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
    const params = useParams<{ team: string; connectionId?: string }>();
    const { data: session } = authClient.useSession();
    const team = params.team;
    const connectionId = params.connectionId;

    const navMain = [
        {
            title: 'SQL Console',
            url: connectionId ? `/${team}/${connectionId}/sql-console` : `/${team}/connections`,
            icon: SquareCode,
            requiresConnection: true,
        },
        {
            title: 'Schema',
            url: connectionId ? `/${team}/${connectionId}/catalog/default` : `/${team}/connections`,
            icon: IconDatabase,
            requiresConnection: true,
        },
        {
            title: 'Chatbot',
            url: connectionId ? `/${team}/${connectionId}/chatbot` : `/${team}/chatbot`,
            icon: IconFileAi,
            requiresConnection: true,
        },
        {
            title: 'Monitoring',
            url: connectionId ? `/${team}/${connectionId}/monitoring` : `/${team}/connections`,
            icon: FileChartColumnIncreasing,
            requiresConnection: true,
        },
        {
            title: 'Privileges',
            url: connectionId ? `/${team}/${connectionId}/privileges` : `/${team}/privileges`,
            icon: IconUsers,
            requiresConnection: true,
        },
    ];

    const navSecondary = [
        {
            title: 'Get Help',
            url: 'https://github.com/dorylab/dory/discussions',
            icon: IconHelp,
            external: true,
        },
    ];

    return (
        <Sidebar {...props}>
            <ConnectionDialogRoot />
            <SidebarHeader className="pb-2">
                <ConnectionSwitcher />
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={navMain} disabled={!connectionId} hasActiveConnection={!!connectionId} />
                <NavSecondary items={navSecondary} className="mt-auto" disabled={!connectionId} />
            </SidebarContent>


            <div className="px-5 pb-3 pt-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
                <a
                    href="https://github.com/dorylab/dory"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Dory"
                >
                    <DoryLogo className="h-5 w-auto group-data-[collapsible=icon]:hidden" />
                    {/* <DoryLogoLite className="h-5 w-5 hidden group-data-[collapsible=icon]:block" /> */}
                </a>
            </div>

            <Separator />

            <SidebarFooter>
                <NavUser user={session?.user as any} />
            </SidebarFooter>
        </Sidebar>
    );
}
