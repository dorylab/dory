import { ArtifactViewerClient } from './artifact-viewer.client';

export default async function ArtifactViewerPage({ params }: { params: Promise<{ organization: string; artifactId: string }> }) {
    const { organization, artifactId } = await params;
    return <ArtifactViewerClient organization={organization} artifactId={artifactId} />;
}
