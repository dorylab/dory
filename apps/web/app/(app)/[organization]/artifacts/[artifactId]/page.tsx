import { ArtifactViewerClient } from './artifact-viewer.client';

export default async function ArtifactViewerPage({
    params,
    searchParams,
}: {
    params: Promise<{ organization: string; artifactId: string }>;
    searchParams: Promise<{ fromAgentRun?: string }>;
}) {
    const { organization, artifactId } = await params;
    const { fromAgentRun } = await searchParams;
    return <ArtifactViewerClient organization={organization} artifactId={artifactId} fromAgentRun={fromAgentRun ?? null} />;
}
