import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type React from 'react';
import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';
import { OrganizationAppShell } from './components/organization-app-shell';

export default async function TeamLayout({ children, params }: { children: React.ReactNode; params: Promise<{ organization: string }> }) {
    const cookieStore = await cookies();
    const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';
    const teamParam = (await params)?.organization;
    const bootstrap = await getAppBootstrapState({ organizationSlugOrId: teamParam });
    const session = bootstrap.session;

    if (!session) {
        redirect('/sign-in');
    }

    const currentOrganizationId = bootstrap.activeOrganizationId;

    if (!currentOrganizationId) {
        const fallbackOrganization = bootstrap.organization;
        if (fallbackOrganization) {
            redirect(`/${fallbackOrganization.slug}/connections`);
        }

        if (isAnonymousUser(session.user)) {
            redirect('/sign-in');
        }

        redirect('/create-organization');
    }

    const organization = bootstrap.organization;

    console.log('[organization][layout] resolve', {
        teamParam,
        currentOrganizationId,
        sessionUserId: session.user.id,
        hasOrganization: Boolean(organization),
    });

    if (!organization) {
        console.log('[organization][layout] redirect', {
            fromOrganization: teamParam,
            toOrganization: bootstrap.organization?.slug ?? currentOrganizationId,
            sessionUserId: session.user.id,
        });
        redirect(`/${bootstrap.organization?.slug ?? currentOrganizationId}/connections`);
    }

    return (
        <OrganizationAppShell
            defaultOpen={defaultOpen}
            initialUser={session.user as any}
            isOffline={bootstrap.isOffline}
            canUseCloudFeatures={bootstrap.canUseCloudFeatures}
        >
            {children}
        </OrganizationAppShell>
    );
}
