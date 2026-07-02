import assert from 'node:assert/strict';
import { buildStoredConnectionConfig, buildTestConnectionConfig } from '../../src/config/index.ts';

const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASC
-----END PRIVATE KEY-----`;

const stored = buildStoredConnectionConfig(
    {
        id: 'conn_1',
        type: 'snowflake',
        host: 'xy12345.us-east-1',
        database: 'ANALYTICS',
        options: JSON.stringify({
            warehouse: 'COMPUTE_WH',
            schema: 'PUBLIC',
            authMethod: 'key_pair',
        }),
    },
    {
        id: 'identity_1',
        username: 'DORY_USER',
        role: 'ANALYST',
        privateKey,
        privateKeyPassphrase: 'secret-passphrase',
    },
);

assert.equal(stored.type, 'snowflake');
assert.equal(stored.host, 'xy12345.us-east-1');
assert.equal(stored.database, 'ANALYTICS');
assert.equal(stored.username, 'DORY_USER');
assert.equal(stored.password, undefined);
assert.equal(stored.options?.account, 'xy12345.us-east-1');
assert.equal(stored.options?.warehouse, 'COMPUTE_WH');
assert.equal(stored.options?.schema, 'PUBLIC');
assert.equal(stored.options?.role, 'ANALYST');
assert.equal(stored.options?.authMethod, 'key_pair');
assert.equal(stored.options?.privateKey, privateKey);
assert.equal(stored.options?.privateKeyPassphrase, 'secret-passphrase');

const tested = buildTestConnectionConfig({
    connection: {
        id: 'conn_2',
        type: 'snowflake',
        host: 'org-account',
        options: JSON.stringify({ authMethod: 'password' }),
    },
    identity: {
        username: 'DORY_USER',
        password: 'snowflake-password',
    },
});

assert.equal(tested.type, 'snowflake');
assert.equal(tested.password, 'snowflake-password');
assert.equal(tested.options?.authMethod, 'password');

assert.throws(
    () =>
        buildTestConnectionConfig({
            connection: {
                id: 'conn_3',
                type: 'snowflake',
                host: 'org-account',
                options: JSON.stringify({ authMethod: 'key_pair' }),
            },
            identity: {
                username: 'DORY_USER',
            },
        }),
    /missing_private_key/,
);

console.log('snowflake config tests passed');
