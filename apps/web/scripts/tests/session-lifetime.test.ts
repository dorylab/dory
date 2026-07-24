import assert from 'node:assert/strict';
import test from 'node:test';

import { DORY_DESKTOP_PROTOCOL_HEADER } from '../../lib/auth/desktop-protocol';
import {
    DESKTOP_SESSION_COOKIE_TTL_SECONDS,
    isDesktopAuthRequest,
    PERMANENT_SESSION_EXPIRES_AT,
    resolveSessionLifetime,
    WEB_SESSION_TTL_SECONDS,
} from '../../lib/auth/session-lifetime';

test('web sessions keep the 30 day lifetime', () => {
    const lifetime = resolveSessionLifetime({ desktop: false, now: 1_000 });

    assert.equal(lifetime.cookieMaxAgeSeconds, WEB_SESSION_TTL_SECONDS);
    assert.equal(lifetime.expiresAt.getTime(), 1_000 + WEB_SESSION_TTL_SECONDS * 1000);
});

test('desktop sessions use a permanent server expiry and the Chromium cookie limit', () => {
    const lifetime = resolveSessionLifetime({ desktop: true, now: 1_000 });

    assert.equal(lifetime.cookieMaxAgeSeconds, DESKTOP_SESSION_COOKIE_TTL_SECONDS);
    assert.equal(lifetime.expiresAt.toISOString(), PERMANENT_SESSION_EXPIRES_AT);
});

test('desktop auth requests are recognized from the forwarded protocol header', () => {
    const headers = new Headers({
        [DORY_DESKTOP_PROTOCOL_HEADER]: 'dory',
    });

    assert.equal(isDesktopAuthRequest(headers), true);
    assert.equal(isDesktopAuthRequest(new Headers()), false);
});
