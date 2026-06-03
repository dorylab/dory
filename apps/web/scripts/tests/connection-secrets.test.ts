import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTestIdentityPassword } from '@/lib/connection/secrets';

test('connection test reuses stored identity password when edit form submits an empty password', () => {
    assert.equal(resolveTestIdentityPassword('', 'saved-password'), 'saved-password');
    assert.equal(resolveTestIdentityPassword('   ', 'saved-password'), 'saved-password');
});

test('connection test uses an explicit identity password and supports explicit null', () => {
    assert.equal(resolveTestIdentityPassword('new-password', 'saved-password'), 'new-password');
    assert.equal(resolveTestIdentityPassword(null, 'saved-password'), null);
    assert.equal(resolveTestIdentityPassword(undefined, 'saved-password'), 'saved-password');
});
