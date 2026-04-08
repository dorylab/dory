import { redirect } from 'next/navigation';
import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';

export default async function Page() {
    const bootstrap = await getAppBootstrapState();
    const session = bootstrap.session;

    if (!session) redirect('/sign-in');
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

    redirect(`/${bootstrap.organization?.slug ?? currentOrganizationId}/connections`);
}
