import { verifyGitHubWebhook } from '@/lib/server/github-app';
import { handleGitHubConnectorWebhook } from '@/lib/server/knowledge-connector-sync';
import { getDBService } from '@dory/database';

export const runtime = 'nodejs';

export async function POST(req: Request) {
    const length = Number(req.headers.get('content-length') ?? 0);
    if (length > 1_000_000) return new Response('Payload too large.', { status: 413 });
    const rawBody = await req.text();
    if (!verifyGitHubWebhook(rawBody, req.headers.get('x-hub-signature-256'))) return new Response('Invalid GitHub webhook signature.', { status: 401 });
    const event = req.headers.get('x-github-event');
    if (!['push', 'installation', 'installation_repositories'].includes(event ?? '')) return new Response(null, { status: 204 });
    await handleGitHubConnectorWebhook(await getDBService(), event!, JSON.parse(rawBody));
    return Response.json({ accepted: true }, { status: 202 });
}
