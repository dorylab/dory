import assert from 'node:assert/strict';
import test from 'node:test';

import { pickConnectionIdentity } from '@dory/drivers/config';
import { buildStoredConnectionConfig, buildTestConnectionConfig } from '@/lib/connection/config';
import { createCredentiallessDefaultIdentity, withCredentiallessDefaultIdentity } from '@/lib/connection/credentialless-identity';
import { normalizeConnectionTestPayload } from '@/lib/actions/server/domains/connection/payload';

test('sqlite records with no stored identities receive a transient default identity for runtime config', () => {
    const record = withCredentiallessDefaultIdentity({
        connection: {
            id: 'sqlite-1',
            name: 'Photos.sqlite',
            type: 'sqlite',
            engine: 'sqlite',
            path: '/Users/example/Desktop/Photos.sqlite',
            database: null,
        },
        identities: [],
        ssh: null,
        tls: null,
    });
    const identity = pickConnectionIdentity(record.identities, null);

    assert.ok(identity);
    assert.equal(identity.id, '');
    assert.equal(identity.username, 'sqlite');
    assert.equal(identity.database, 'main');

    const config = buildStoredConnectionConfig(record.connection, identity);
    assert.equal(config.type, 'sqlite');
    assert.equal(config.path, '/Users/example/Desktop/Photos.sqlite');
    assert.equal(config.database, 'main');
});

test('postgres records with no stored identities still require an identity', () => {
    const record = withCredentiallessDefaultIdentity({
        connection: {
            id: 'pg-1',
            name: 'Postgres',
            type: 'postgres',
            engine: 'postgres',
            host: '127.0.0.1',
            database: 'postgres',
        },
        identities: [],
        ssh: null,
        tls: null,
    });

    assert.equal(pickConnectionIdentity(record.identities, null), null);
});

test('motherduck is not treated as credentialless because it requires a token', () => {
    const identity = createCredentiallessDefaultIdentity({
        type: 'sqlite',
        engine: 'sqlite',
        database: 'main',
    });
    const record = withCredentiallessDefaultIdentity({
        connection: {
            id: 'duck-1',
            name: 'MotherDuck',
            type: 'duckdb',
            engine: 'duckdb',
            options: JSON.stringify({ mode: 'motherduck' }),
        },
        identities: [],
        ssh: null,
        tls: null,
    });

    assert.equal(identity.username, 'sqlite');
    assert.equal(record.identities.length, 0);
});

test('sqlite test payload can omit identity while postgres keeps existing missing username behavior', () => {
    const sqlitePayload = normalizeConnectionTestPayload({
        connection: {
            id: 'sqlite-1',
            type: 'sqlite',
            engine: 'sqlite',
            path: '/Users/example/Desktop/Photos.sqlite',
        },
    });
    const sqliteConfig = buildTestConnectionConfig(sqlitePayload as Parameters<typeof buildTestConnectionConfig>[0]);

    assert.equal(sqlitePayload.identity.username, 'sqlite');
    assert.equal(sqliteConfig.type, 'sqlite');
    assert.equal(sqliteConfig.database, 'main');

    const postgresPayload = normalizeConnectionTestPayload({
        connection: {
            id: 'pg-1',
            type: 'postgres',
            engine: 'postgres',
            host: '127.0.0.1',
            database: 'postgres',
        },
    });

    assert.throws(() => buildTestConnectionConfig(postgresPayload as Parameters<typeof buildTestConnectionConfig>[0]), /missing_username/);
});
