import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDesktopSignInRedirect } from '../../lib/auth/desktop-sign-in';
import type { DesktopAuthSnapshot } from '../../lib/auth/desktop-auth-snapshot';

function snapshot(): DesktopAuthSnapshot {
    return {
        version: 1,
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
        accessUpdatedAt: null,
        accessExpiresAt: null,
        updatedAt: '2026-06-05T00:00:00.000Z',
        expiresAt: '2026-06-12T00:00:00.000Z',
    };
}

test('desktop sign-in does not redirect without a local snapshot', () => {
    assert.equal(resolveDesktopSignInRedirect(null, '/connections'), null);
});

test('desktop sign-in redirects from a valid local snapshot', () => {
    assert.equal(resolveDesktopSignInRedirect(snapshot(), null), '/');
    assert.equal(resolveDesktopSignInRedirect(snapshot(), '/sign-in'), '/');
    assert.equal(resolveDesktopSignInRedirect(snapshot(), '/team/connections'), '/team/connections');
});
