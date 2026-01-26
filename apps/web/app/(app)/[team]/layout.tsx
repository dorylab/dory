import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type React from 'react';
import { SidebarProvider, SidebarInset } from '@/registry/new-york-v4/ui/sidebar';
import { AppContentShell } from './components/app-sidebar/app-content-shell';
import { AppSidebar } from './components/app-sidebar/app-sidebar';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getTeamBySlugOrId } from '@/lib/server/team';


export default async function TeamLayout({ children, params }: { children: React.ReactNode; params: Promise<{ team: string } > }) {
    const cookieStore = await cookies();
    const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';
    const session = await getSessionFromRequest();

    if (!session) {
        redirect('/sign-in');
    }

    const defaultTeamId = session.user.defaultTeamId;

    if (!defaultTeamId) {
        redirect('/create-team');
    }

    const teamParam = (await params)?.team;
    const team = teamParam ? await getTeamBySlugOrId(teamParam, session.user.id) : null;

    if (!team) {
        redirect(`/${defaultTeamId}/connections`);
    }

    return (
        <SidebarProvider
            defaultOpen={defaultOpen}
            style={
                {
                    '--sidebar-width': 'calc(var(--spacing) * 50)',
                    '--sidebar-width-icon': '40px',
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" collapsible="icon" />
            <SidebarInset className="flex flex-col h-screen min-h-0" style={{ height: 'calc(100vh - 1rem)', width: 'calc(100% - 248px)' }}>
                <AppContentShell>{children}</AppContentShell>
            </SidebarInset>
        </SidebarProvider>
    );
}
