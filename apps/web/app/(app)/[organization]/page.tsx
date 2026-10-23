import { redirect } from 'next/navigation';
import { getAppBootstrapState } from '@/lib/server/app-bootstrap';

export default async function Page({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    const bootstrap = await getAppBootstrapState({ organizationSlugOrId: organization });
    if (!bootstrap.session) redirect('/sign-in');
    redirect(`/${bootstrap.organization?.slug ?? organization}/work`);
}
