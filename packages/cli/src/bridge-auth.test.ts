import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { login } from './bridge-auth.js';

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json',
        },
    });
}

test('login can request local AI scopes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-cli-login-scopes-'));
    const configPath = path.join(dir, 'mcp.json');
    const requestedScopes = ['connections:read', 'local_ai:run'];

    try {
        await login({
            url: 'https://dory.example.com',
            configPath,
            scopes: requestedScopes,
            pollIntervalMs: 0,
            openUrl: () => undefined,
            fetchFn: async (url, init) => {
                const parsed = new URL(String(url));
                const body = JSON.parse(String(init?.body ?? '{}'));

                if (parsed.pathname === '/api/mcp/link/start') {
                    assert.deepEqual(body.scopes, requestedScopes);
                    return jsonResponse({
                        code: 0,
                        data: {
                            requestId: 'request-scoped',
                            authorizeUrl: 'https://dory.example.com/mcp/authorize?requestId=request-scoped',
                            expiresAt: new Date(Date.now() + 60_000).toISOString(),
                        },
                    });
                }

                if (parsed.pathname === '/api/mcp/link/poll') {
                    return jsonResponse({
                        code: 0,
                        data: {
                            status: 'approved',
                            token: 'dory_mcp_scoped_token',
                            record: { tokenPrefix: 'dory_mcp_scoped' },
                        },
                    });
                }

                return jsonResponse({ code: 'NOT_FOUND', message: 'not found' }, 404);
            },
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
