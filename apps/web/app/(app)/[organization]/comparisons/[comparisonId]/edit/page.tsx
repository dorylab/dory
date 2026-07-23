import { EditComparisonClient } from './edit-comparison.client';

export default async function EditComparisonPage({ params }: { params: Promise<{ organization: string; comparisonId: string }> }) {
    const { organization, comparisonId } = await params;
    return <EditComparisonClient organization={organization} comparisonId={comparisonId} />;
}
