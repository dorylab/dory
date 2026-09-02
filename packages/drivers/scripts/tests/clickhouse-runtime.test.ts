import assert from 'node:assert/strict';
import test from 'node:test';

import type { ClickHouseClient } from '@clickhouse/client';
import { executeClickhouseQuery } from '../../src/database/clickhouse/runtime.ts';

type ClientCall = Record<string, unknown>;

function createClientHarness() {
    const calls: { query: ClientCall[]; command: ClientCall[] } = { query: [], command: [] };
    const client = {
        query: async (input: ClientCall) => {
            calls.query.push(input);
            return {
                json: async () => ({ data: [{ value: 1 }], meta: [{ name: 'value', type: 'UInt8' }], rows: 1 }),
            };
        },
        command: async (input: ClientCall) => {
            calls.command.push(input);
            return {};
        },
    } as unknown as ClickHouseClient;
    return { client, calls };
}

test('ClickHouse sends command statements verbatim without an output format', async () => {
    const statements = [
        'SYSTEM SYNC REPLICA test_staging_db.w1__test_table_local',
        'CREATE TABLE example (id UInt64) ENGINE = Memory',
        'ALTER TABLE example ADD COLUMN name String',
        'DROP TABLE example',
        'SET max_threads = 1',
        'OPTIMIZE TABLE example FINAL',
        'INSERT INTO example SELECT number FROM numbers(1)',
        'GRANT SELECT ON example TO analyst',
        'FUTURE COMMAND',
    ];

    for (const statement of statements) {
        const { client, calls } = createClientHarness();
        const result = await executeClickhouseQuery(client, statement, undefined, { queryId: 'command-id' });

        assert.deepEqual(result.rows, []);
        assert.equal(result.rowCount, 0);
        assert.equal(calls.query.length, 0);
        assert.equal(calls.command.length, 1);
        assert.equal(calls.command[0]?.query, statement);
        assert.equal(calls.command[0]?.query_id, 'command-id');
        assert.equal('format' in calls.command[0]!, false);
    }
});

test('ClickHouse command classification skips leading comments, whitespace, and BOM', async () => {
    const statements = [
        '-- synchronize the replica\nSYSTEM SYNC REPLICA db.replica',
        '# synchronize the replica\nSYSTEM SYNC REPLICA db.replica',
        '/* synchronize the replica */ SYSTEM SYNC REPLICA db.replica',
        '\uFEFF  -- first comment\r\n/* second comment */\n# third comment\nsYsTeM SYNC REPLICA db.replica',
    ];

    for (const statement of statements) {
        const { client, calls } = createClientHarness();
        await executeClickhouseQuery(client, statement);

        assert.equal(calls.query.length, 0);
        assert.equal(calls.command[0]?.query, statement);
    }
});

test('ClickHouse result statements continue to use JSON queries', async () => {
    const statements = [
        'SELECT 1 AS value',
        '  -- result query\nselect 1 AS value',
        'WITH 1 AS value SELECT value',
        'FROM numbers(1) SELECT number',
        'SHOW TABLES',
        'DESCRIBE TABLE example',
        'DESC example',
        'EXPLAIN SELECT 1',
        'EXISTS TABLE example',
        'CHECK TABLE example',
        'WATCH example LIMIT 1',
        "KILL QUERY WHERE query_id = 'query-to-kill' TEST",
    ];

    for (const statement of statements) {
        const { client, calls } = createClientHarness();
        const result = await executeClickhouseQuery<{ value: number }>(client, statement);

        assert.deepEqual(result.rows, [{ value: 1 }]);
        assert.equal(calls.command.length, 0);
        assert.equal(calls.query.length, 1);
        assert.equal(calls.query[0]?.format, 'JSON');
    }
});

test('ClickHouse forwards named parameters and query IDs through both execution paths', async () => {
    const queryHarness = createClientHarness();
    await executeClickhouseQuery(queryHarness.client, 'SELECT {value:UInt8} AS value', { value: 1 }, { queryId: 'query-id' });
    assert.deepEqual(queryHarness.calls.query[0]?.query_params, { value: 1 });
    assert.equal(queryHarness.calls.query[0]?.query_id, 'query-id');

    const commandHarness = createClientHarness();
    const command = 'SYSTEM RESTART REPLICA {replica:Identifier}';
    await executeClickhouseQuery(commandHarness.client, command, { replica: 'db.replica' }, { queryId: 'command-id' });
    assert.equal(commandHarness.calls.command[0]?.query, command);
    assert.deepEqual(commandHarness.calls.command[0]?.query_params, { replica: 'db.replica' });
    assert.equal(commandHarness.calls.command[0]?.query_id, 'command-id');
});
