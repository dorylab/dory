import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { __resultSetRepositoryTestInternals } from '../../src/postgres/impl/result-sets/index.ts';
import type { ResultSetColumn } from '@dory/resultset';

function quoteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
    const { DuckDBInstance } = await import('@duckdb/node-api');
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dory-resultset-ops-test-'));
    const parquetPath = path.join(tempDir, 'data.parquet');
    const csvPath = path.join(tempDir, 'filtered.csv');
    let instance: any = null;

    try {
        instance = await DuckDBInstance.create(':memory:');
        const connection = await instance.connect();
        try {
            await connection.run(`
                CREATE TABLE source (
                    id BIGINT,
                    name VARCHAR,
                    category VARCHAR,
                    amount DOUBLE,
                    created_at VARCHAR
                )
            `);
            await connection.run(`
                INSERT INTO source VALUES
                    (1, 'Alpha', 'a', 10.5, '2026-01-01'),
                    (2, 'Beta', 'b', 22.0, '2026-01-02'),
                    (3, 'Gamma', 'a', 30.0, '2026-01-03'),
                    (4, 'alphabet', 'b', -5.0, '2026-01-04')
            `);
            await connection.run(`COPY source TO ${quoteLiteral(parquetPath)} (FORMAT PARQUET)`);

            const columns: ResultSetColumn[] = [
                { name: 'id', logicalType: 'number' },
                { name: 'name', logicalType: 'string' },
                { name: 'category', logicalType: 'string' },
                { name: 'amount', logicalType: 'number' },
                { name: 'created_at', logicalType: 'date' },
            ];
            const fromSql = ` FROM read_parquet(${quoteLiteral(parquetPath)})`;
            const query = __resultSetRepositoryTestInternals.buildResultSetQueryClause(columns, {
                filters: [
                    { col: 'name', kind: 'string', op: 'contains', value: 'alpha' },
                    { col: 'amount', kind: 'number', op: 'ge', value: '0' },
                    { col: 'created_at', kind: 'range', op: 'range', rangeValueType: 'date', value: '2026-01-01', valueTo: '2026-01-03' },
                ],
                search: { text: 'a' },
                sorts: [
                    { column: 'amount', direction: 'desc' },
                    { column: 'name\"); DROP TABLE source; --', direction: 'asc' },
                ],
            });

            assert.equal(query.orderSql.includes('DROP TABLE'), false);
            assert.equal(query.whereSql.includes('DROP TABLE'), false);

            const countRows = (await connection.runAndReadAll(`SELECT COUNT(*)${fromSql}${query.whereSql}`, query.params as any)).getRowsJson() as unknown[][];
            assert.equal(Number(countRows[0]?.[0]), 1);

            const rows = __resultSetRepositoryTestInternals.rowsBySchema(
                (await connection.runAndReadAll(`SELECT *${fromSql}${query.whereSql}${query.orderSql}`, query.params as any)).getRowsJson() as unknown[][],
                columns,
            );
            assert.deepEqual(
                rows.map(row => row.id),
                [1],
            );

            await connection.runAndReadAll(`COPY (SELECT *${fromSql}${query.whereSql}${query.orderSql}) TO ${quoteLiteral(csvPath)} (FORMAT CSV, HEADER TRUE)`, query.params as any);
            const csv = await readFile(csvPath, 'utf8');
            assert.match(csv, /Alpha/);
            assert.doesNotMatch(csv, /Beta/);

            const injectionQuery = __resultSetRepositoryTestInternals.buildResultSetQueryClause(columns, {
                filters: [{ col: 'name', kind: 'string', op: 'equals', value: "' OR 1=1 --" }],
                sorts: [{ column: 'name; DROP TABLE source; --', direction: 'desc' }],
            });
            assert.equal(injectionQuery.orderSql, '');
            const injectionRows = (await connection.runAndReadAll(`SELECT COUNT(*)${fromSql}${injectionQuery.whereSql}`, injectionQuery.params as any)).getRowsJson() as unknown[][];
            assert.equal(Number(injectionRows[0]?.[0]), 0);

            void createReadStream(parquetPath).close();
        } finally {
            connection.closeSync();
        }
    } finally {
        instance?.closeSync();
        await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }

    console.log('result-set operations tests passed');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
