import { ComparePageClient } from './compare-page.client';

export default async function ComparePage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    return <ComparePageClient organization={organization} />;
}
