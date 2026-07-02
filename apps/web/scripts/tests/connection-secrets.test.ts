import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTestIdentityPassword } from '@/lib/connection/secrets';
import { normalizeConnectionCreatePayload } from '@/lib/actions/server/domains/connection/payload';
import { sanitizeConnectionSyncPayload } from '@/lib/actions/server/domains/connection/sanitize';

test('connection test reuses stored identity password when edit form submits an empty password', () => {
    assert.equal(resolveTestIdentityPassword('', 'saved-password'), 'saved-password');
    assert.equal(resolveTestIdentityPassword('   ', 'saved-password'), 'saved-password');
});

test('connection test uses an explicit identity password and supports explicit null', () => {
    assert.equal(resolveTestIdentityPassword('new-password', 'saved-password'), 'new-password');
    assert.equal(resolveTestIdentityPassword(null, 'saved-password'), null);
    assert.equal(resolveTestIdentityPassword(undefined, 'saved-password'), 'saved-password');
});

test('connection sync payload strips identity secrets', () => {
    const sanitized = sanitizeConnectionSyncPayload({
        connection: { type: 'snowflake' },
        identity: { username: 'user', password: 'secret', privateKey: 'pem', privateKeyPassphrase: 'pass' },
        identities: [{ username: 'user', password: 'secret', privateKey: 'pem', privateKeyPassphrase: 'pass' }],
    });

    assert.deepEqual(sanitized.identity, { username: 'user' });
    assert.deepEqual(sanitized.identities, [{ username: 'user' }]);
});

test('connection create payload strips Snowflake form-only connection fields', () => {
    const normalized = normalizeConnectionCreatePayload({
        connection: {
            type: 'snowflake',
            name: 'Snowflake',
            host: 'xy12345.us-east-1',
            database: 'ANALYTICS',
            warehouse: 'COMPUTE_WH',
            schema: 'PUBLIC',
            authMethod: 'password',
            duckdbMode: 'local',
            ssl: false,
            options: JSON.stringify({
                account: 'xy12345.us-east-1',
                warehouse: 'COMPUTE_WH',
                schema: 'PUBLIC',
                authMethod: 'password',
            }),
        },
        identity: { name: 'default user', username: 'DORY_USER', password: 'secret', isDefault: true },
    });

    assert.deepEqual(normalized.connection, {
        type: 'snowflake',
        name: 'Snowflake',
        host: 'xy12345.us-east-1',
        database: 'ANALYTICS',
        options: JSON.stringify({
            account: 'xy12345.us-east-1',
            warehouse: 'COMPUTE_WH',
            schema: 'PUBLIC',
            authMethod: 'password',
        }),
    });
    assert.equal(normalized.identities[0]?.username, 'DORY_USER');
});
