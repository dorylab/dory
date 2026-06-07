import { WorkPageClient } from './page.client';

export default async function WorkPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    return <WorkPageClient organization={organization} />;
}
