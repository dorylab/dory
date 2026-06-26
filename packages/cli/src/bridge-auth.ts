import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { postJson, type FetchLike } from './bridge-api.js';
import { saveCredential } from './bridge-config.js';
import { normalizeDoryTarget } from './bridge-url.js';

type StartResponse = {
    requestId: string;
    authorizeUrl: string;
    expiresAt: string;
};

type PollResponse = {
    status: 'pending' | 'approved' | 'denied' | 'expired';
    token?: string;
    record?: {
        tokenPrefix?: string;
    };
};

export type LoginOptions = {
    url?: string | null;
    clientName?: string;
    configPath?: string;
    fetchFn?: FetchLike;
    openUrl?: (url: string) => Promise<void> | void;
    pollIntervalMs?: number;
    timeoutMs?: number;
};

export function createVerifier() {
    return randomBytes(32).toString('base64url');
}

export function hashVerifier(verifier: string) {
    return createHash('sha256').update(verifier).digest('hex');
}

export async function openBrowser(url: string) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
}

export async function login(options: LoginOptions = {}) {
    const target = normalizeDoryTarget(options.url);
    const verifier = createVerifier();
    const verifierHash = hashVerifier(verifier);
    const clientName = options.clientName?.trim() || 'Dory MCP';
    const fetchFn = options.fetchFn ?? fetch;
    const start = await postJson<StartResponse>(
        new URL('/api/mcp/link/start', target.origin).toString(),
        {
            clientName,
            verifierHash,
        },
        fetchFn,
    );

    await (options.openUrl ?? openBrowser)(start.authorizeUrl);

    const expiresAt = new Date(start.expiresAt).getTime();
    const timeoutAt = Date.now() + (options.timeoutMs ?? 10 * 60 * 1000);
    const pollUntil = Math.min(Number.isFinite(expiresAt) ? expiresAt : timeoutAt, timeoutAt);
    const pollIntervalMs = options.pollIntervalMs ?? 2000;

    while (Date.now() <= pollUntil) {
        if (pollIntervalMs > 0) {
            await sleep(pollIntervalMs);
        }

        const poll = await postJson<PollResponse>(
            new URL('/api/mcp/link/poll', target.origin).toString(),
            {
                requestId: start.requestId,
                verifier,
            },
            fetchFn,
        );

        if (poll.status === 'pending') continue;
        if (poll.status === 'denied') throw new Error('Dory MCP authorization was denied.');
        if (poll.status === 'expired') throw new Error('Dory MCP authorization expired.');
        if (poll.status === 'approved' && poll.token) {
            await saveCredential(
                target.origin,
                {
                    endpoint: target.endpoint,
                    token: poll.token,
                    tokenPrefix: poll.record?.tokenPrefix ?? poll.token.slice(0, 17),
                    createdAt: new Date().toISOString(),
                },
                options.configPath,
            );
            return {
                origin: target.origin,
                endpoint: target.endpoint,
                tokenPrefix: poll.record?.tokenPrefix ?? poll.token.slice(0, 17),
            };
        }

        throw new Error(`Unexpected Dory MCP authorization status: ${poll.status}`);
    }

    throw new Error('Timed out waiting for Dory MCP authorization.');
}
