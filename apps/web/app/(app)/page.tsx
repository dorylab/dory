import { redirect } from 'next/navigation';
import { getSessionFromRequest } from '@/lib/auth/session';

export default async function Page() {
    const session = await getSessionFromRequest();

    if (!session) redirect('/sign-in');
    const defaultTeamId = session.user.defaultTeamId;

    if (!defaultTeamId) {
        redirect('/create-team');
    }

    redirect(`/${defaultTeamId}/connections`);
}
