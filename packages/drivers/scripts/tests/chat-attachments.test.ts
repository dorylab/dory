import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DuckDBInstance } from '@duckdb/node-api';
import { materializeAttachment, queryAttachmentTables } from '../../src/database/duckdb/attachments';

test('DuckDB attachments read full files, preserve types, and restrict SQL to authorized data', async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'dory-attachment-driver-'));
    const make = async (filename: string, content?: string) => {
        const source = path.join(directory, filename);
        if (content !== undefined) await writeFile(source, content);
        const output = path.join(directory, `${filename}-tables`);
        await mkdir(output);
        return (await materializeAttachment(source, output, `a_${filename.replace(/\W/g, '_')}`)).map(table => ({ ...table, directory: output }));
    };
    try {
        const csv = await make('customers.csv', 'id,active,note\n' + Array.from({ length: 20000 }, (_, n) => `${n},${n % 4 === 0},"row ${n}"`).join('\n'));
        assert.equal(csv[0].rowCount, 20000);
        assert.equal(csv[0].preview.length, 20);
        await t.test('aggregate includes rows beyond both preview and output limits', async () => {
            const result = await queryAttachmentTables(
                csv,
                `SELECT count(*) AS total, count(*) FILTER (WHERE active) AS active_count, avg(active::INT) AS ratio FROM "${csv[0].name}"`,
            );
            assert.deepEqual(result.rows, [{ total: '20000', active_count: '5000', ratio: 0.25 }]);
            assert.equal(result.limited, false);
            const page = await queryAttachmentTables(csv, `SELECT * FROM "${csv[0].name}"`);
            assert.equal(page.rows.length, 1000);
            assert.equal(page.limited, true);
        });
        await t.test('TSV and JSON arrays/lines retain nested values and Unicode', async () => {
            const tsv = await make('values.tsv', 'name\tamount\n中文\t12\n');
            assert.equal(tsv[0].preview[0].name, '中文');
            for (const filename of ['nested.json', 'nested.jsonl', 'nested.ndjson']) {
                const object = { id: 1, meta: { active: true }, values: [1, 2] };
                const tables = await make(filename, JSON.stringify(filename.endsWith('.json') ? [object] : object));
                const result = await queryAttachmentTables(tables, `SELECT meta.active AS active, values[2] AS value FROM "${tables[0].name}"`);
                assert.deepEqual(result.rows, [{ active: true, value: '2' }]);
            }
        });
        await t.test('Parquet decimal/date/null values are JSON serializable', async () => {
            const instance = await DuckDBInstance.create(':memory:');
            const connection = await instance.connect();
            try {
                await connection.run(
                    `COPY (SELECT 12.34::DECIMAL(8,2) AS amount, DATE '2026-10-27' AS day, NULL::INT AS missing) TO '${path.join(directory, 'typed.parquet')}' (FORMAT PARQUET)`,
                );
            } finally {
                connection.closeSync();
                instance.closeSync();
            }
            const tables = await make('typed.parquet');
            const result = await queryAttachmentTables(tables, `SELECT * FROM "${tables[0].name}"`);
            assert.equal(result.rows[0].day, '2026-10-27');
            assert.equal(result.rows[0].missing, null);
            assert.doesNotThrow(() => JSON.stringify(result));
        });
        await t.test('joins operate only on explicitly supplied attachment tables', async () => {
            const other = await make('other.csv', 'id,segment\n0,a\n1,b\n');
            const result = await queryAttachmentTables([...csv, ...other], `SELECT c.id, o.segment FROM "${csv[0].name}" c JOIN "${other[0].name}" o USING (id) ORDER BY c.id`);
            assert.equal(result.rows.length, 2);
            await assert.rejects(queryAttachmentTables(csv, `SELECT * FROM "${other[0].name}"`));
        });
        await t.test('rejects writes, multiple statements, settings, local file and network reads', async () => {
            await writeFile(path.join(directory, 'secret.csv'), 'secret\nprivate\n');
            for (const sql of [
                'SELECT 1; SELECT 2',
                'CREATE TABLE bad AS SELECT 1',
                'SET enable_external_access=true',
                `SELECT * FROM read_csv('${path.join(directory, 'secret.csv')}')`,
                "SELECT * FROM read_csv('https://example.invalid/private.csv')",
                `COPY (SELECT 1) TO '${path.join(directory, 'bad.csv')}'`,
                `ATTACH '${path.join(directory, 'bad.duckdb')}'`,
            ])
                await assert.rejects(queryAttachmentTables(csv, sql), undefined, sql);
            await assert.rejects(queryAttachmentTables(csv, 'SELECT 1', AbortSignal.abort()), /abort/i);
        });
        await t.test('cancellation interrupts an active native query and releases its connection', async () => {
            const controller = new AbortController();
            const query = queryAttachmentTables(csv, 'SELECT sum(a.i * b.i) FROM range(10000000) a(i), range(10000000) b(i)', controller.signal);
            const timer = setTimeout(() => controller.abort(), 25);
            try {
                await assert.rejects(query, /interrupt|abort/i);
            } finally {
                clearTimeout(timer);
            }
            assert.deepEqual((await queryAttachmentTables(csv, 'SELECT 1 AS ok')).rows, [{ ok: 1 }]);
        });
        await t.test('the 60-second deadline interrupts native execution and releases the connection', async t => {
            const timeout = AbortSignal.timeout.bind(AbortSignal);
            const deadline = t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
                assert.equal(milliseconds, 60_000);
                return timeout(25);
            });
            try {
                await assert.rejects(queryAttachmentTables(csv, 'SELECT sum(a.i * b.i) FROM range(10000000) a(i), range(10000000) b(i)'), /interrupt|timeout/i);
            } finally {
                deadline.mock.restore();
            }
            assert.deepEqual((await queryAttachmentTables(csv, 'SELECT 1 AS ok')).rows, [{ ok: 1 }]);
        });
        await t.test('XLSX multi-sheet reading uses the bundled extension with auto-install disabled', async () => {
            await copyFile(new URL('../../../../test-fixtures/open-files/dory-open-files-test.xlsx', import.meta.url), path.join(directory, 'sheets.xlsx'));
            const tables = await make('sheets.xlsx');
            assert.ok(tables.length >= 2);
            for (const table of tables) {
                assert.ok(table.sheet);
                assert.ok(table.rowCount > 0);
                const result = await queryAttachmentTables(tables, `SELECT count(*) AS n FROM "${table.name}"`);
                assert.equal(Number(result.rows[0].n), table.rowCount);
            }
        });
        await t.test('empty and malformed files fail with a real parser error', async () => {
            await assert.rejects(make('bad.parquet', 'not parquet'));
            await assert.rejects(make('bad.xlsx', 'not zip'));
            const empty = await make('empty.csv', 'id,active\n');
            assert.equal(empty[0].rowCount, 0);
        });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
