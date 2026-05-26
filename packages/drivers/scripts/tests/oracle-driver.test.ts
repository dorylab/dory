import assert from 'node:assert/strict';
import { compileParams } from '../../src/core/base/params/compile';
import { OracleDialect } from '../../src/database/oracle/dialect';
import {
    buildOracleConnectString,
    enforceOracleSelectLimit,
    normalizeOracleCatalogName,
    parseOracleTableReference,
    resolveOraclePort,
    resolveOracleServiceName,
} from '../../src/database/oracle/runtime';
import { normalizeOracleObjectRow } from '../../src/database/oracle/capabilities/metadata';

const baseConfig = {
    id: 'oracle-test',
    type: 'oracle' as const,
    host: 'oracle.example.com',
    port: 1521,
    username: 'app',
    password: 'secret',
    database: 'ORCLPDB1',
};

assert.equal(resolveOraclePort(baseConfig), 1521);
assert.equal(resolveOracleServiceName(baseConfig), 'ORCLPDB1');
assert.equal(buildOracleConnectString(baseConfig), 'oracle.example.com:1521/ORCLPDB1');

assert.equal(resolveOraclePort({ ...baseConfig, host: 'oracle://db.example.com:1522/SALES', port: undefined, database: undefined }), 1522);
assert.equal(resolveOracleServiceName({ ...baseConfig, host: 'oracle://db.example.com:1522/SALES', database: undefined }), 'SALES');
assert.equal(buildOracleConnectString({ ...baseConfig, options: { connectString: 'db.example.com:1521/CUSTOM' } }), 'db.example.com:1521/CUSTOM');

assert.deepEqual(compileParams(OracleDialect, 'SELECT * FROM users WHERE id = :id', { id: 42 }), {
    sql: 'SELECT * FROM users WHERE id = :id',
    params: { id: 42 },
});

assert.equal(enforceOracleSelectLimit('SELECT id FROM users'), 'SELECT id FROM users FETCH FIRST 10000 ROWS ONLY');
assert.equal(enforceOracleSelectLimit('SELECT id FROM users FETCH FIRST 25 ROWS ONLY'), 'SELECT id FROM users FETCH FIRST 25 ROWS ONLY');
assert.equal(enforceOracleSelectLimit('SELECT id FROM users WHERE ROWNUM <= 25'), 'SELECT id FROM users WHERE ROWNUM <= 25');
assert.equal(enforceOracleSelectLimit('SELECT 1 FROM dual; SELECT 2 FROM dual'), 'SELECT 1 FROM dual; SELECT 2 FROM dual');

assert.equal(normalizeOracleCatalogName('users'), 'USERS');
assert.equal(normalizeOracleCatalogName('"CaseSensitive"'), 'CaseSensitive');
assert.deepEqual(parseOracleTableReference('sales.orders'), { schema: 'SALES', table: 'ORDERS' });
assert.deepEqual(parseOracleTableReference('"Sales"."Orders"'), { schema: 'Sales', table: 'Orders' });

assert.deepEqual(
    normalizeOracleObjectRow({
        schemaName: 'SALES',
        name: 'ORDERS',
        type: 'TABLE',
        totalRows: '12',
        totalBytes: '4096',
        comment: 'Order records',
        lastModified: '2026-01-01T00:00:00.000Z',
    }),
    {
        name: 'SALES.ORDERS',
        schema: 'SALES',
        engine: 'TABLE',
        totalBytes: 4096,
        totalRows: 12,
        comment: 'Order records',
        lastModified: '2026-01-01T00:00:00.000Z',
    },
);

console.log('oracle-driver tests passed');
