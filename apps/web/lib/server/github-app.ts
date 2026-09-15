import 'server-only';

import { createHmac, createSign, timingSafeEqual } from 'node:crypto';

type GitHubInstallationToken = { token: string; expires_at: string };
const installationTokenCache = new Map<string, { token: GitHubInstallationToken; validUntil: number }>();

function required(name: 'GITHUB_APP_ID' | 'GITHUB_APP_PRIVATE_KEY') {
    const value = process.env[name]?.replace(/\\n/g, '\n').trim();
    if (!value) throw new Error(`GitHub App is not configured: ${name}`);
    return value;
}

function base64url(value: string | Buffer) {
    return Buffer.from(value).toString('base64url');
}

export function githubAppConfigured() {
    return Boolean(process.env.GITHUB_APP_ID?.trim() && process.env.GITHUB_APP_PRIVATE_KEY?.trim() && process.env.GITHUB_APP_SLUG?.trim());
}

export function githubWebhookConfigured() {
    return githubAppConfigured() && Boolean(process.env.GITHUB_APP_WEBHOOK_SECRET?.trim());
}

export function createGitHubAppJwt() {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ iat: now - 30, exp: now + 9 * 60, iss: required('GITHUB_APP_ID') }));
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    return `${header}.${payload}.${signer.sign(required('GITHUB_APP_PRIVATE_KEY'), 'base64url')}`;
}

export async function installationToken(installationId: string): Promise<GitHubInstallationToken> {
    const cached = installationTokenCache.get(installationId);
    if (cached && cached.validUntil > Date.now()) return cached.token;
    const response = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
        method: 'POST',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${createGitHubAppJwt()}`, 'X-GitHub-Api-Version': '2022-11-28' },
        cache: 'no-store',
    });
    if (!response.ok) throw new Error(`GitHub installation token request failed (${response.status}).`);
    const token = (await response.json()) as GitHubInstallationToken;
    installationTokenCache.set(installationId, { token, validUntil: Math.max(Date.now(), Date.parse(token.expires_at) - 60_000) });
    return token;
}

export function verifyGitHubWebhook(rawBody: string, signature: string | null) {
    const secret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim();
    if (!secret || !signature) return false;
    const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type GitHubConnectorState = { organizationId: string; knowledgeModelId: string; userId: string; returnPath: string; installationId?: string; expiresAt: number };

function stateSecret() {
    const secret = process.env.BETTER_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
    if (!secret) throw new Error('Application auth secret is not configured.');
    return secret;
}

export function signGitHubConnectorState(input: Omit<GitHubConnectorState, 'expiresAt'>) {
    const encoded = base64url(JSON.stringify({ ...input, expiresAt: Date.now() + 15 * 60_000 } satisfies GitHubConnectorState));
    const signature = createHmac('sha256', stateSecret()).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
}

export function verifyGitHubConnectorState(state: string): GitHubConnectorState {
    const [encoded, signature, extra] = state.split('.');
    if (!encoded || !signature || extra) throw new Error('Invalid GitHub connection session.');
    const expected = Buffer.from(createHmac('sha256', stateSecret()).update(encoded).digest('base64url'));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Invalid GitHub connection session.');
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as GitHubConnectorState;
    if (!value.organizationId || !value.knowledgeModelId || !value.userId || value.expiresAt < Date.now()) throw new Error('GitHub connection session expired.');
    return value;
}

export function createGitHubInstallationUrl(state: string) {
    const slug = process.env.GITHUB_APP_SLUG?.trim();
    if (!slug) throw new Error('GitHub App is not configured: GITHUB_APP_SLUG');
    return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;
}
