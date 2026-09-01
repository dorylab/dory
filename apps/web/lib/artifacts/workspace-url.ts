export function buildArtifactWorkspacePath(organization: string, artifactId: string, connectionId: string) {
    return `/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(artifactId)}/workspace/${encodeURIComponent(connectionId)}`;
}
