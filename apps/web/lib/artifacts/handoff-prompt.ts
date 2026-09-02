import type { ArtifactDetail } from './types';

export function buildArtifactHandoffPrompt(artifact: ArtifactDetail, url: string) {
    const workInstruction = artifact.workId
        ? `Reuse Dory workId "${artifact.workId}".`
        : `Create a Dory work on connectionId "${artifact.connectionId ?? 'the artifact source connection'}" before continuing.`;
    return [
        `Continue working from the existing Dory Artifact.`,
        ``,
        `Artifact context:`,
        `- Artifact ID: ${artifact.id}`,
        `- Title: ${artifact.title}`,
        `- Type: ${artifact.type}`,
        artifact.connectionId ? `- Connection ID: ${artifact.connectionId}` : null,
        artifact.sourceResultSetId ? `- Result Set ID: ${artifact.sourceResultSetId}` : null,
        `- Viewer URL: ${url}`,
        ``,
        `Instructions:`,
        `1. ${workInstruction}`,
        `2. Call dory_artifacts with artifactId "${artifact.id}" and that workId to read its bounded context.`,
        `3. Treat the Artifact as historical evidence and working context. Query the live source when the user needs current facts; inspect this snapshot to verify or continue the prior analysis.`,
        `4. Update the Dory workspace as needed and finish the work with a concise summary.`,
    ]
        .filter((line): line is string => line !== null)
        .join('\n');
}
