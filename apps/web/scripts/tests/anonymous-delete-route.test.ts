import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const { buildAnonymousDeleteResponse, isLocalAnonymousDeleteRequest } = await import('../../lib/auth/anonymous-delete');

test('anonymous delete route matcher only matches the delete endpoint', () => {
    assert.equal(isLocalAnonymousDeleteRequest('/api/auth/delete-anonymous-user'), true);
    assert.equal(isLocalAnonymousDeleteRequest('/api/auth/sign-in/email'), false);
});

test('anonymous delete response clears both Better Auth session cookies', () => {
    const response = buildAnonymousDeleteResponse(
        new Request('http://localhost:3000/api/auth/delete-anonymous-user', {
            method: 'POST',
            headers: {
                cookie: 'better-auth.session_data.0=chunk; dory.desktop_session_token=token; active_theme=blue',
            },
        }),
    );
    const setCookies = response.headers.getSetCookie();

    assert.equal(response.status, 200);
    assert.equal(
        setCookies.some(cookie => cookie === 'better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'),
        true,
    );
    assert.equal(
        setCookies.some(cookie => cookie === '__Secure-better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure'),
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
        setCookies.some(cookie => cookie.startsWith('dory.anonymous_recovery=;')),
        true,
    );
    assert.equal(
        setCookies.some(cookie => cookie.startsWith('active_theme=;')),
        false,
    );
});
