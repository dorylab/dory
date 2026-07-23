import { ComparisonRunClientPage } from './comparison-run.client';

export default async function ComparisonRunPage({ params }: { params: Promise<{ organization: string; comparisonId: string; runId: string }> }) {
    const { organization, comparisonId, runId } = await params;
    return <ComparisonRunClientPage organization={organization} comparisonId={comparisonId} runId={runId} />;
}
