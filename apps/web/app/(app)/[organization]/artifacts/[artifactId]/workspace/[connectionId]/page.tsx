import { ArtifactWorkspaceDrawerPage } from '@/components/artifacts/artifact-workspace-drawer-page';

export default async function ArtifactWorkspacePage({
    params,
}: {
    params: Promise<{
        organization: string;
        artifactId: string;
        connectionId: string;
    }>;
}) {
    const { organization, artifactId, connectionId } = await params;
    return <ArtifactWorkspaceDrawerPage organization={organization} artifactId={artifactId} connectionId={connectionId} />;
}
