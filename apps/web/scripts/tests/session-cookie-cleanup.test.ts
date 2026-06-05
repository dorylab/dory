import assert from 'node:assert/strict';
import test from 'node:test';

import { appendClearSessionCookieHeaders, getSessionCookieNamesToClear } from '../../lib/auth/session-cookie-cleanup';

test('session cookie cleanup includes Better Auth, desktop, and existing chunk cookies', () => {
    const names = getSessionCookieNamesToClear(
        [
            'active_theme=blue',
            'better-auth.session_token=stale',
            'better-auth.session_data.0=chunk',
            '__Secure-better-auth.account_data.1=chunk',
            'dory.desktop_session_token=stale',
            'locale=en',
        ].join('; '),
    );

    assert.equal(names.includes('better-auth.session_token'), true);
    assert.equal(names.includes('__Secure-better-auth.session_token'), true);
    assert.equal(names.includes('better-auth.session_data'), true);
    assert.equal(names.includes('__Secure-better-auth.session_data'), true);
    assert.equal(names.includes('better-auth.session_data.0'), true);
    assert.equal(names.includes('__Secure-better-auth.account_data.1'), true);
    assert.equal(names.includes('dory.desktop_session_token'), true);
    assert.equal(names.includes('active_theme'), false);
    assert.equal(names.includes('locale'), false);
});

test('session cookie cleanup appends expired cookie headers', () => {
    const headers = new Headers();
    appendClearSessionCookieHeaders(headers, 'better-auth.session_data.0=chunk');

    const setCookies = headers.getSetCookie();
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
});
