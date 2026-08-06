import assert from 'node:assert/strict';
import test from 'node:test';

import { parseConnectionUrl } from '@/app/(app)/[organization]/connections/components/forms/connection/drivers/connection-url';

test('parses PostgreSQL connection and authentication fields', () => {
    assert.deepEqual(parseConnectionUrl('postgres', 'postgresql://reader:p%40ss@db.example.com:5444/analytics?sslmode=verify-full'), {
        connection: {
            host: 'db.example.com',
            port: 5444,
            database: 'analytics',
            ssl: true,
        },
        identity: {
            username: 'reader',
            password: 'p@ss',
        },
        tlsMode: 'verify-identity',
    });
});

test('parses MySQL, MariaDB, Oracle, and SQL Server URLs', () => {
    assert.deepEqual(parseConnectionUrl('mysql', 'mysql://app:secret@mysql.example.com/app?ssl-mode=VERIFY_IDENTITY'), {
        connection: { host: 'mysql.example.com', port: 3306, database: 'app', ssl: true },
        identity: { username: 'app', password: 'secret' },
        tlsMode: 'verify-identity',
    });
    assert.deepEqual(parseConnectionUrl('mariadb', 'mariadb://app:secret@maria.example.com:3307/app'), {
        connection: { host: 'maria.example.com', port: 3307, database: 'app' },
        identity: { username: 'app', password: 'secret' },
        tlsMode: undefined,
    });
    assert.deepEqual(parseConnectionUrl('oracle', 'oracle://system:secret@oracle.example.com:1522/ORCLPDB1'), {
        connection: { host: 'oracle.example.com', port: 1522, database: 'ORCLPDB1' },
        identity: { username: 'system', password: 'secret' },
        tlsMode: undefined,
    });
    assert.deepEqual(parseConnectionUrl('sqlserver', 'sqlserver://sa:secret@mssql.example.com/app?encrypt=true&trustServerCertificate=false'), {
        connection: {
            host: 'mssql.example.com',
            port: 1433,
            database: 'app',
            encrypt: true,
            trustServerCertificate: false,
        },
        identity: { username: 'sa', password: 'secret' },
        tlsMode: 'verify-identity',
    });
});

test('parses ClickHouse and Snowflake provider URLs', () => {
    assert.deepEqual(parseConnectionUrl('clickhouse', 'https://default:secret@clickhouse.example.com:8443/default'), {
        connection: {
            host: 'clickhouse.example.com',
            httpPort: 8443,
            database: 'default',
            ssl: true,
        },
        identity: { username: 'default', password: 'secret' },
        tlsMode: 'require',
    });
    assert.deepEqual(parseConnectionUrl('snowflake', 'snowflake://analyst:secret@xy12345.us-east-1/ANALYTICS/PUBLIC?warehouse=COMPUTE_WH&role=READER'), {
        connection: {
            host: 'xy12345.us-east-1',
            database: 'ANALYTICS',
            schema: 'PUBLIC',
            warehouse: 'COMPUTE_WH',
        },
        identity: { username: 'analyst', password: 'secret', role: 'READER' },
    });
    assert.equal(parseConnectionUrl('snowflake', 'https://example.com/ANALYTICS/PUBLIC'), null);
});

test('parses Cloudflare D1 and local database URLs', () => {
    assert.deepEqual(parseConnectionUrl('cloudflare-d1', 'https://api.cloudflare.com/client/v4/accounts/account-123/d1/database/database-456'), {
        connection: {
            accountId: 'account-123',
            database: 'database-456',
            host: 'api.cloudflare.com',
            ssl: true,
        },
        identity: {},
    });
    assert.deepEqual(parseConnectionUrl('sqlite', 'sqlite:///var/lib/dory/app.sqlite'), {
        connection: { localDatabaseSource: 'existing', path: '/var/lib/dory/app.sqlite' },
        identity: {},
    });
    assert.deepEqual(parseConnectionUrl('duckdb', 'duckdb:///var/lib/dory/app.duckdb'), {
        connection: { localDatabaseSource: 'existing', duckdbMode: 'local', path: '/var/lib/dory/app.duckdb' },
        identity: {},
    });
    assert.deepEqual(parseConnectionUrl('duckdb', 'md:analytics?motherduck_token=token-123'), {
        connection: { duckdbMode: 'motherduck', database: 'analytics' },
        identity: { password: 'token-123' },
    });
});

test('rejects connection URLs for the wrong driver', () => {
    assert.equal(parseConnectionUrl('postgres', 'mysql://user:password@localhost/database'), null);
    assert.equal(parseConnectionUrl('sqlite', 'https://example.com/database.sqlite'), null);
    assert.equal(parseConnectionUrl('neon', 'postgresql://user:password@localhost/database'), null);
});
