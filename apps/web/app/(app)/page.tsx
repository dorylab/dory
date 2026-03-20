import { redirect } from 'next/navigation';
import { getSessionFromRequest } from '@/lib/auth/session';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';

export default async function Page() {
    const session = await getSessionFromRequest();

    if (!session) redirect('/sign-in');
    const currentOrganizationId = resolveCurrentOrganizationId(session);

    if (!currentOrganizationId) {
        redirect('/create-organization');
    }

    redirect(`/${currentOrganizationId}/connections`);
}
