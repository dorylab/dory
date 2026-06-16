import assert from 'node:assert/strict';
import { buildStoredConnectionConfig, buildTestConnectionConfig } from '../../src/config/index.ts';
import {
    executeCloudflareD1Query,
    getCloudflareD1TableColumns,
    getCloudflareD1TableDdl,
    getCloudflareD1Tables,
    previewCloudflareD1Table,
} from '../../src/database/cloudflare-d1/runtime.ts';
import type { BaseConfig } from '../../src/types/index.ts';

type FetchCall = {
    url: string;
    init: RequestInit;
};

const calls: FetchCall[] = [];
const queuedResponses: unknown[] = [];

(globalThis as any).fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const payload = queuedResponses.shift() ?? { success: true, result: [{ success: true, results: [] }] };
    return {
        ok: true,
        status: 200,
        json: async () => payload,
    };
};

function queueResponse(payload: unknown) {
    queuedResponses.push(payload);
}

function resetFetchState() {
    calls.length = 0;
    queuedResponses.length = 0;
}

function requestBody(index = 0) {
    return JSON.parse(String(calls[index]?.init.body ?? '{}')) as Record<string, unknown>;
}

const config: BaseConfig = {
    id: 'd1',
    type: 'cloudflare-d1',
    host: 'api.cloudflare.com',
    database: 'database-id',
    username: 'cloudflare',
    password: 'token-secret',
    options: {
        accountId: 'account-id',
    },
};

queueResponse({
    success: true,
    result: [
        {
            success: true,
            results: [{ id: 1, name: 'Ada' }],
            meta: { duration: 2, changes: 0 },
        },
    ],
});

const queryResult = await executeCloudflareD1Query(config, 'SELECT id, name FROM users WHERE id = ?', [1]);
assert.equal(calls[0]?.url, 'https://api.cloudflare.com/client/v4/accounts/account-id/d1/database/database-id/query');
assert.equal(calls[0]?.init.headers?.['Authorization' as keyof HeadersInit], 'Bearer token-secret');
assert.deepEqual(requestBody(), {
    sql: 'SELECT id, name FROM users WHERE id = ? LIMIT 10000',
    params: [1],
});
assert.deepEqual(queryResult.rows, [{ id: 1, name: 'Ada' }]);
assert.deepEqual(queryResult.columns, [{ name: 'id' }, { name: 'name' }]);
assert.equal(queryResult.rowCount, 1);
assert.equal(queryResult.statistics?.cloudflare?.resultCount, 1);

resetFetchState();
queueResponse({
    success: true,
    result: [
        {
            success: true,
            results: {
                columns: ['id', 'name'],
                rows: [[2, 'Grace']],
            },
        },
        {
            success: true,
            results: [{ ignored: true }],
        },
    ],
});

const rawResult = await executeCloudflareD1Query(config, 'SELECT id, name FROM users');
assert.deepEqual(rawResult.rows, [{ id: 2, name: 'Grace' }]);
assert.equal(rawResult.statistics?.cloudflare?.resultCount, 2);

resetFetchState();
queueResponse({
    success: false,
    errors: [{ message: 'D1 read permission denied' }],
});
await assert.rejects(() => executeCloudflareD1Query(config, 'SELECT 1'), /D1 read permission denied/);

resetFetchState();
queueResponse({
    success: true,
    result: [{ success: true, results: [{ name: 'users', comment: null }] }],
});
const tables = await getCloudflareD1Tables(config, 'main');
assert.deepEqual(tables, [{ name: 'users', comment: null }]);
assert.match(String(requestBody().sql), /FROM "main"\.sqlite_schema/);
assert.match(String(requestBody().sql), /type = 'table'/);

resetFetchState();
queueResponse({
    success: true,
    result: [
        {
            success: true,
            results: [
                {
                    name: 'id',
                    type: 'INTEGER',
                    notnull: 1,
                    dflt_value: null,
                    pk: 1,
                    hidden: 0,
                },
            ],
        },
    ],
});
const columns = await getCloudflareD1TableColumns(config, 'main', 'users');
assert.deepEqual(columns, [{ columnName: 'id', columnType: 'INTEGER', defaultExpression: null, isPrimaryKey: true }]);
assert.equal(requestBody().sql, `PRAGMA "main".table_xinfo('users')`);

resetFetchState();
queueResponse({
    success: true,
    result: [
        {
            success: true,
            results: [{ sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)' }],
        },
    ],
});
const ddl = await getCloudflareD1TableDdl(config, 'main', 'users');
assert.equal(ddl, 'CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)');
assert.equal(
    requestBody().sql,
    `SELECT sql
         FROM sqlite_master
         WHERE type IN ('table', 'view') AND name = ? LIMIT 10000`,
);
assert.deepEqual(requestBody().params, ['users']);

resetFetchState();
queueResponse({
    success: true,
    result: [
        {
            success: true,
            results: [],
        },
    ],
});
queueResponse({
    success: true,
    result: [
        {
            success: true,
            results: [{ sql: 'CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1' }],
        },
    ],
});
const fallbackDdl = await getCloudflareD1TableDdl(config, 'main', 'active_users');
assert.equal(fallbackDdl, 'CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1');
assert.equal(
    requestBody(1).sql,
    `SELECT sql
         FROM "main".sqlite_schema
         WHERE type IN ('table', 'view') AND name = ? LIMIT 10000`,
);

resetFetchState();
queueResponse({
    success: true,
    result: [
        {
            success: true,
            results: [],
        },
    ],
});
queueResponse({
    success: true,
    result: [
        {
            success: true,
            results: [],
        },
    ],
});
queueResponse({
    success: true,
    result: [
        {
            success: true,
            results: [
                {
                    name: 'id',
                    type: 'INTEGER',
                    notnull: 1,
                    dflt_value: null,
                    pk: 1,
                    hidden: 0,
                },
                {
                    name: 'email',
                    type: 'TEXT',
                    notnull: 0,
                    dflt_value: "'unknown'",
                    pk: 0,
                    hidden: 0,
                },
            ],
        },
    ],
});
const synthesizedDdl = await getCloudflareD1TableDdl(config, 'main', 'users');
assert.equal(synthesizedDdl, `CREATE TABLE "users" (\n    "id" INTEGER PRIMARY KEY,\n    "email" TEXT DEFAULT 'unknown'\n);`);

resetFetchState();
queueResponse({ success: true, result: [{ success: true, results: [{ totalRows: 2 }] }] });
queueResponse({ success: true, result: [{ success: true, results: [{ totalRows: 5 }] }] });
queueResponse({ success: true, result: [{ success: true, results: [{ id: 1, email: 'ada@example.com' }] }] });
const preview = await previewCloudflareD1Table(config, 'main', 'users', 25, 50, {
    filters: [{ col: 'email', kind: 'string', op: 'contains', value: 'ada' }],
    sort: { column: 'id', direction: 'desc' },
});
assert.equal(preview.totalRows, 2);
assert.equal(preview.unfilteredTotalRows, 5);
assert.equal(requestBody(2).sql, `SELECT * FROM "main"."users" WHERE LOWER(CAST("email" AS TEXT)) LIKE ? ORDER BY "id" DESC LIMIT ? OFFSET ?`);
assert.deepEqual(requestBody(2).params, ['%ada%', 25, 50]);

const storedConfig = buildStoredConnectionConfig(
    {
        id: 'conn',
        type: 'cloudflare-d1',
        host: null,
        database: 'database-id',
        options: JSON.stringify({ accountId: 'account-id' }),
    },
    {
        id: 'identity',
        username: 'cloudflare',
        password: 'token-secret',
    },
);
assert.equal(storedConfig.host, 'api.cloudflare.com');
assert.equal(storedConfig.password, 'token-secret');
assert.deepEqual(storedConfig.options, { accountId: 'account-id' });

assert.throws(
    () =>
        buildTestConnectionConfig(
            {
                connection: { id: 'conn', type: 'cloudflare-d1', options: '{}' },
                identity: { username: 'cloudflare', password: 'token-secret' },
            },
            code => new Error(code),
        ),
    /missing_account_id/,
);
assert.throws(
    () =>
        buildTestConnectionConfig(
            {
                connection: { id: 'conn', type: 'cloudflare-d1', options: JSON.stringify({ accountId: 'account-id' }) },
                identity: { username: 'cloudflare', password: 'token-secret' },
            },
            code => new Error(code),
        ),
    /missing_database/,
);
assert.throws(
    () =>
        buildTestConnectionConfig(
            {
                connection: { id: 'conn', type: 'cloudflare-d1', database: 'database-id', options: JSON.stringify({ accountId: 'account-id' }) },
                identity: { username: 'cloudflare', password: '' },
            },
            code => new Error(code),
        ),
    /missing_password/,
);

console.log('cloudflare-d1 driver tests passed');
