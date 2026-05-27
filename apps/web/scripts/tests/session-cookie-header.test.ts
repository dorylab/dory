import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCloudSessionLookupCookieHeader, normalizeSessionCookieName } from '../../lib/auth/session-cookie-header';

test('session cookie normalization includes localhost and secure variants', () => {
    assert.deepEqual(normalizeSessionCookieName('__Secure-better-auth.session_token'), [
        'better-auth.session_token',
        '__Secure-better-auth.session_token',
        '__Host-better-auth.session_token',
    ]);
});

test('cloud session lookup cookie header replaces stale session cookies with all supported names', () => {
    const header = buildCloudSessionLookupCookieHeader({
        existingCookieHeader: 'locale=zh; better-auth.session_token=old-local; __Secure-better-auth.session_token=old-cloud; theme=dark',
        sessionCookie: {
            name: 'better-auth.session_token',
            value: 'new-token',
        },
        sessionCookieName: 'better-auth.session_token',
    });

    assert.equal(header.includes('old-local'), false);
    assert.equal(header.includes('old-cloud'), false);
    assert.match(header, /locale=zh/);
    assert.match(header, /theme=dark/);
    assert.match(header, /better-auth\.session_token=new-token/);
    assert.match(header, /__Secure-better-auth\.session_token=new-token/);
    assert.match(header, /__Host-better-auth\.session_token=new-token/);
});
