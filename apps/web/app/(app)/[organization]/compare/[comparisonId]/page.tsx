import { ComparisonDetailClient } from './comparison-detail.client';

export default async function ComparisonDetailPage({ params }: { params: Promise<{ organization: string; comparisonId: string }> }) {
    const { organization, comparisonId } = await params;
    return <ComparisonDetailClient organization={organization} comparisonId={comparisonId} />;
}
