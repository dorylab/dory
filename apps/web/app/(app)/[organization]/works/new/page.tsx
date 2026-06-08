import { NewWorkPageClient } from '../../work/new/page.client';

export default async function NewWorkPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    return <NewWorkPageClient organization={organization} />;
}
