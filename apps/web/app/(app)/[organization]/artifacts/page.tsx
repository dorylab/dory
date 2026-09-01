import { ArtifactsPageClient } from './artifacts-page.client';

export default async function ArtifactsPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    return <ArtifactsPageClient organization={organization} />;
}
