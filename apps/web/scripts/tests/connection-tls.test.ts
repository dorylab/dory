import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStoredConnectionConfig } from '@dory/drivers/config';
import { buildClickhouseClientConfigOptions, isClickhouseTlsEnabled } from '../../../../packages/drivers/src/database/clickhouse/runtime';
import { buildMySqlPoolConfig } from '../../../../packages/drivers/src/database/mysql/runtime';
import { buildPostgresPoolConfig } from '../../../../packages/drivers/src/database/postgres/runtime';
import { buildSqlServerPoolConfig } from '../../../../packages/drivers/src/database/sqlserver/runtime';
import { sanitizeConnectionSyncPayload } from '@/lib/actions/server/domains/connection/sanitize';
import { normalizeTlsForSubmit, TLS_SUPPORTED_CONNECTION_TYPES } from '@/app/(app)/[organization]/connections/components/forms/tls/utils';

test('connection TLS submit normalization preserves saved content and clears path source content', () => {
    const tls = normalizeTlsForSubmit('postgres', {
        mode: 'verify-identity',
        caCertificateSource: 'content',
        caCertificateContent: '',
        hasCaCertificateContent: true,
        clientCertificateSource: 'path',
        clientCertificatePath: '/srv/client.crt',
        hasClientCertificateContent: true,
        clientPrivateKeySource: 'content',
        clientPrivateKeyContent: 'PRIVATE KEY',
        serverName: 'db.example.com',
    });

    assert.ok(tls);
    assert.equal(tls.mode, 'verify-identity');
    assert.equal(tls.caCertificateContent, undefined);
    assert.equal(tls.clientCertificateContent, null);
    assert.equal(tls.clientCertificatePath, '/srv/client.crt');
    assert.equal(tls.clientPrivateKeyContent, 'PRIVATE KEY');
    assert.equal(tls.serverName, 'db.example.com');
});

test('Hosted Postgres connection strings are not exposed as configurable TLS connection types', () => {
    assert.equal(TLS_SUPPORTED_CONNECTION_TYPES.has('neon'), false);
    assert.equal(normalizeTlsForSubmit('neon', { mode: 'verify-identity' }), null);
    assert.equal(TLS_SUPPORTED_CONNECTION_TYPES.has('supabase'), false);
    assert.equal(normalizeTlsForSubmit('supabase', { mode: 'verify-identity' }), null);
});

test('ClickHouse TLS submit normalization uses ClickHouse-specific modes and fields', () => {
    assert.equal(TLS_SUPPORTED_CONNECTION_TYPES.has('clickhouse'), true);

    const httpsOnly = normalizeTlsForSubmit('clickhouse', {
        mode: 'require',
        caCertificatePath: '/srv/ca.crt',
        clientCertificatePath: '/srv/client.crt',
        clientPrivateKeyPath: '/srv/client.key',
        serverName: 'ignored.example.com',
    });

    assert.ok(httpsOnly);
    assert.equal(httpsOnly.mode, 'require');
    assert.equal(httpsOnly.caCertificatePath, null);
    assert.equal(httpsOnly.clientCertificatePath, null);
    assert.equal(httpsOnly.clientPrivateKeyPath, null);
    assert.equal(httpsOnly.serverName, null);

    const legacyPrefer = normalizeTlsForSubmit('clickhouse', { mode: 'prefer' });
    assert.ok(legacyPrefer);
    assert.equal(legacyPrefer.mode, 'require');

    const customCa = normalizeTlsForSubmit('clickhouse', {
        mode: 'verify-ca',
        caCertificateSource: 'content',
        caCertificateContent: 'CA',
        clientCertificatePath: '/srv/client.crt',
        clientPrivateKeyPath: '/srv/client.key',
    });

    assert.ok(customCa);
    assert.equal(customCa.mode, 'verify-ca');
    assert.equal(customCa.caCertificateContent, 'CA');
    assert.equal(customCa.clientCertificatePath, null);
    assert.equal(customCa.clientPrivateKeyPath, null);

    const mutualTls = normalizeTlsForSubmit('clickhouse', {
        mode: 'verify-identity',
        caCertificateSource: 'content',
        caCertificateContent: 'CA',
        clientCertificateSource: 'content',
        clientCertificateContent: 'CERT',
        clientPrivateKeySource: 'content',
        clientPrivateKeyContent: 'KEY',
        clientPrivateKeyPassphrase: 'ignored',
        ciphers: 'ignored',
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        serverName: 'ignored.example.com',
    });

    assert.ok(mutualTls);
    assert.equal(mutualTls.mode, 'verify-identity');
    assert.equal(mutualTls.caCertificateContent, 'CA');
    assert.equal(mutualTls.clientCertificateContent, 'CERT');
    assert.equal(mutualTls.clientPrivateKeyContent, 'KEY');
    assert.equal(mutualTls.clientPrivateKeyPassphrase, null);
    assert.equal(mutualTls.ciphers, null);
    assert.equal(mutualTls.serverName, null);
});

test('connection sync payload redacts TLS secret material', () => {
    const payload = sanitizeConnectionSyncPayload({
        connection: { type: 'postgres' },
        tls: {
            mode: 'require',
            caCertificateContent: 'CA',
            clientCertificateContent: 'CERT',
            clientPrivateKeyContent: 'KEY',
            clientPrivateKeyPassphrase: 'PASSPHRASE',
            caCertificatePath: '/srv/ca.crt',
        },
    });

    assert.deepEqual(payload.tls, {
        mode: 'require',
        caCertificatePath: '/srv/ca.crt',
    });
});

test('stored driver config carries TLS metadata and secrets into options.tls', () => {
    const config = buildStoredConnectionConfig(
        {
            id: 'c1',
            type: 'postgres',
            host: 'db.example.com',
            port: 5432,
            options: '{}',
        },
        { username: 'app', password: 'pw' },
        null,
        {
            mode: 'verify-ca',
            caCertificateContent: 'CA',
        },
    );

    assert.equal(config.options?.tls.mode, 'verify-ca');
    assert.equal(config.options?.tls.caCertificateContent, 'CA');
});

test('driver TLS runtime mapping matches pg, mysql2, and tedious expectations', () => {
    const base = {
        id: 'c1',
        host: 'db.example.com',
        port: 5432,
        username: 'app',
        password: 'pw',
        type: 'postgres' as const,
        options: {
            tls: {
                mode: 'verify-ca',
                caCertificateContent: 'CA',
                clientCertificateContent: 'CERT',
                clientPrivateKeyContent: 'KEY',
                clientPrivateKeyPassphrase: 'secret',
                ciphers: 'TLS_AES_256_GCM_SHA384',
                minVersion: 'TLSv1.2',
                maxVersion: 'TLSv1.3',
            },
        },
    };

    const pgConfig = buildPostgresPoolConfig(base);
    assert.equal((pgConfig.ssl as any).rejectUnauthorized, true);
    assert.equal(typeof (pgConfig.ssl as any).checkServerIdentity, 'function');
    assert.equal((pgConfig.ssl as any).ca, 'CA');

    const pgIdentityConfig = buildPostgresPoolConfig({
        ...base,
        options: { tls: { ...base.options.tls, mode: 'verify-identity', serverName: 'wrong.local' } },
    });
    const identityError = (pgIdentityConfig.ssl as any).checkServerIdentity('localhost', {
        subjectaltname: 'DNS:localhost, IP Address:127.0.0.1',
        subject: { CN: 'localhost' },
    });
    assert.match(identityError?.message, /wrong\.local/);

    const mysqlConfig = buildMySqlPoolConfig({ ...base, type: 'mysql' });
    assert.equal((mysqlConfig.ssl as any).rejectUnauthorized, true);
    assert.equal((mysqlConfig.ssl as any).verifyIdentity, false);
    assert.equal((mysqlConfig.ssl as any).cert, 'CERT');

    const sqlServerConfig = buildSqlServerPoolConfig({
        ...base,
        type: 'sqlserver',
        options: { tls: { ...base.options.tls, mode: 'verify-identity', serverName: 'db.example.com' } },
    });
    assert.equal(sqlServerConfig.options?.encrypt, true);
    assert.equal(sqlServerConfig.options?.trustServerCertificate, false);
    assert.equal(sqlServerConfig.options?.serverName, 'db.example.com');
    assert.equal((sqlServerConfig.options?.cryptoCredentialsDetails as any)?.key, 'KEY');
});

test('ClickHouse TLS runtime mapping matches @clickhouse/client expectations', () => {
    const base = {
        id: 'c1',
        host: 'ch.example.com',
        port: 9000,
        username: 'default',
        password: 'pw',
        database: 'default',
        type: 'clickhouse' as const,
        options: {
            httpPort: 8443,
            tls: {
                mode: 'require',
            },
        },
    };

    assert.equal(isClickhouseTlsEnabled(base), true);
    const httpsOnlyConfig = buildClickhouseClientConfigOptions(base);
    assert.equal(httpsOnlyConfig.url, 'https://ch.example.com:8443');
    assert.equal(httpsOnlyConfig.tls, undefined);

    const customCaConfig = buildClickhouseClientConfigOptions({
        ...base,
        options: {
            ...base.options,
            tls: {
                mode: 'verify-ca',
                caCertificateContent: 'CA',
            },
        },
    });
    assert.equal(customCaConfig.tls?.ca_cert.toString(), 'CA');
    assert.equal('cert' in customCaConfig.tls!, false);

    const mutualTlsConfig = buildClickhouseClientConfigOptions({
        ...base,
        options: {
            ...base.options,
            tls: {
                mode: 'verify-identity',
                caCertificateContent: 'CA',
                clientCertificateContent: 'CERT',
                clientPrivateKeyContent: 'KEY',
            },
        },
    });
    assert.equal(mutualTlsConfig.tls?.ca_cert.toString(), 'CA');
    assert.equal((mutualTlsConfig.tls as any)?.cert.toString(), 'CERT');
    assert.equal((mutualTlsConfig.tls as any)?.key.toString(), 'KEY');

    assert.equal(
        isClickhouseTlsEnabled({
            ...base,
            options: {
                ssl: true,
                tls: {
                    mode: 'disable',
                },
            },
        }),
        false,
    );
});
