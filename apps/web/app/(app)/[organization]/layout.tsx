import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type React from 'react';
import { SidebarProvider, SidebarInset } from '@/registry/new-york-v4/ui/sidebar';
import { AppContentShell } from './components/app-sidebar/app-content-shell';
import { AppSidebar } from './components/app-sidebar/app-sidebar';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getOrganizationBySlugOrId } from '@/lib/server/organization';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';


export default async function TeamLayout({ children, params }: { children: React.ReactNode; params: Promise<{ organization: string } > }) {
    const cookieStore = await cookies();
    const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';
    const session = await getSessionFromRequest();

    if (!session) {
        redirect('/sign-in');
    }

    const currentOrganizationId = resolveCurrentOrganizationId(session);

    if (!currentOrganizationId) {
        redirect('/create-organization');
    }

    const teamParam = (await params)?.organization;
    const organization = teamParam ? await getOrganizationBySlugOrId(teamParam, session.user.id) : null;

    console.log('[organization][layout] resolve', {
        teamParam,
        currentOrganizationId,
        sessionUserId: session.user.id,
        hasOrganization: Boolean(organization),
    });

    if (!organization) {
        console.log('[organization][layout] redirect', {
            fromOrganization: teamParam,
            toOrganization: currentOrganizationId,
            sessionUserId: session.user.id,
        });
        redirect(`/${currentOrganizationId}/connections`);
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
            <AppSidebar variant="inset" collapsible="icon" initialUser={session.user as any} />
            <SidebarInset className="flex flex-col h-screen min-h-0" style={{ height: 'calc(100vh - 1rem)', width: 'calc(100% - 248px)' }}>
                <AppContentShell>{children}</AppContentShell>
            </SidebarInset>
        </SidebarProvider>
    );
}
