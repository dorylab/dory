import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'dory-desktop-auth-proxy-'));
process.env.DORY_RUNTIME = 'desktop';
process.env.DORY_DESKTOP_USER_DATA_PATH = userDataPath;
process.env.DORY_CLOUD_API_URL = 'https://app.getdory.dev/api';

const [{ proxyAuthRequest }, { DORY_DESKTOP_PROTOCOL_HEADER }, { readDesktopAuthSnapshot, writeDesktopAuthSnapshot }] = await Promise.all([
    import('../../lib/auth/auth-proxy.desktop'),
    import('../../lib/auth/desktop-protocol'),
    import('../../lib/auth/desktop-auth-snapshot'),
]);

test('desktop sign-out clears local snapshot and auth cookies after upstream success', async () => {
    writeDesktopAuthSnapshot(
        {
            user: {
                id: 'user_1',
                email: 'user@example.com',
                name: 'User',
                image: null,
                emailVerified: true,
            },
            activeOrganizationId: 'org_1',
            organization: {
                id: 'org_1',
                slug: 'team',
                name: 'Team',
            },
            access: null,
        },
        { now: 1_000 },
    );

    assert.ok(readDesktopAuthSnapshot({ now: 2_000 }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
        new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                'set-cookie': '__Secure-better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None',
            },
        })) as typeof fetch;

    try {
        const response = await proxyAuthRequest(
            new Request('http://127.0.0.1:49415/api/auth/sign-out', {
                method: 'POST',
                headers: {
                    cookie: 'better-auth.session_token=stale; better-auth.session_data.0=chunk; dory.desktop_session_token=stale; active_theme=blue',
                },
            }),
        );
        const setCookies = response.headers.getSetCookie();

        assert.equal(response.status, 200);
        assert.equal(readDesktopAuthSnapshot({ now: 2_000 }), null);
        assert.equal(
            setCookies.some(cookie => cookie === 'better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'),
            true,
        );
        assert.equal(
            setCookies.some(cookie => cookie === 'better-auth.session_data.0=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'),
            true,
        );
        assert.equal(
            setCookies.some(cookie => cookie === 'dory.desktop_session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'),
            true,
        );
        assert.equal(
            setCookies.some(cookie => cookie.startsWith('active_theme=;')),
            false,
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('desktop auth proxy forwards the resolved desktop protocol to cloud auth routes', async () => {
    const previousProtocol = process.env.DORY_PROTOCOL_SCHEME;
    process.env.DORY_PROTOCOL_SCHEME = 'dory-beta';

    const originalFetch = globalThis.fetch;
    let forwardedProtocol: string | null = null;
    globalThis.fetch = (async (_input, init) => {
        forwardedProtocol = new Headers(init?.headers).get(DORY_DESKTOP_PROTOCOL_HEADER);
        return new Response(JSON.stringify({ url: 'https://github.com/login/oauth/authorize' }), { status: 200 });
    }) as typeof fetch;

    try {
        const response = await proxyAuthRequest(new Request('http://127.0.0.1:49415/api/electron/auth/start/github'));

        assert.equal(response.status, 200);
        assert.equal(forwardedProtocol, 'dory-beta');
    } finally {
        globalThis.fetch = originalFetch;
        if (previousProtocol === undefined) {
            delete process.env.DORY_PROTOCOL_SCHEME;
        } else {
            process.env.DORY_PROTOCOL_SCHEME = previousProtocol;
        }
    }
});
