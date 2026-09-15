import { githubAppConfigured, signGitHubConnectorState, verifyGitHubConnectorState } from '@/lib/server/github-app';

export const runtime = 'nodejs';

export function GET(req: Request) {
    const url = new URL(req.url);
    if (!githubAppConfigured()) return new Response('GitHub App is not configured.', { status: 503 });
    const installationId = url.searchParams.get('installation_id');
    if (!installationId) return new Response('GitHub App installation was not completed.', { status: 400 });
    const state = url.searchParams.get('state');
    if (!state) return new Response('GitHub connection session is missing.', { status: 400 });
    try {
        const session = verifyGitHubConnectorState(state);
        if (!session.returnPath.startsWith('/') || session.returnPath.startsWith('//')) throw new Error('Invalid return path.');
        const destination = new URL(session.returnPath, url.origin);
        destination.searchParams.set('githubInstallationId', installationId);
        destination.searchParams.set(
            'githubConnectionState',
            signGitHubConnectorState({
                organizationId: session.organizationId,
                knowledgeModelId: session.knowledgeModelId,
                userId: session.userId,
                returnPath: session.returnPath,
                installationId,
            }),
        );
        return Response.redirect(destination, 303);
    } catch (error) {
        return new Response(error instanceof Error ? error.message : 'Invalid GitHub connection session.', { status: 400 });
    }
}
