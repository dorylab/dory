import assert from 'node:assert/strict';
import { buildTablePreviewClauses, normalizeTablePreviewLimit, normalizeTablePreviewOffset } from '../../src/database/shared/table-preview-query.ts';

const quoteDouble = (value: string) => `"${value.replace(/"/g, '""')}"`;

const sorted = buildTablePreviewClauses({
    dialect: 'postgres',
    quoteIdentifier: quoteDouble,
    sort: { column: 'created_at', direction: 'desc' },
    filters: [
        { col: 'status', kind: 'string', op: 'equals', value: 'paid' },
        { col: 'amount', kind: 'number', op: 'gt', value: '10' },
    ],
    search: 'alice',
    searchColumns: ['customer_name', 'note'],
});

assert.equal(sorted.whereSql, ` WHERE LOWER("status"::text) = $1 AND "amount" > $2 AND (LOWER("customer_name"::text) ILIKE $3 OR LOWER("note"::text) ILIKE $4)`);
assert.equal(sorted.orderBySql, ' ORDER BY "created_at" DESC');
assert.deepEqual(sorted.params, ['paid', 10, '%alice%', '%alice%']);
assert.equal(sorted.nextParameterIndex, 5);

const mysql = buildTablePreviewClauses({
    dialect: 'mysql',
    quoteIdentifier: value => `\`${value.replace(/`/g, '``')}\``,
    sort: { column: 'name` DESC; DROP TABLE users; --', direction: 'asc' },
    filters: [{ col: 'email', kind: 'string', op: 'contains', value: 'openai' }],
});

assert.equal(mysql.whereSql, ' WHERE LOWER(CAST(`email` AS CHAR)) LIKE ?');
assert.equal(mysql.orderBySql, ' ORDER BY `name`` DESC; DROP TABLE users; --` ASC');
assert.deepEqual(mysql.params, ['%openai%']);

const sqlserver = buildTablePreviewClauses({
    dialect: 'sqlserver',
    quoteIdentifier: value => `[${value.replace(/]/g, ']]')}]`,
    filters: [{ col: 'deleted_at', kind: 'string', op: 'empty' }],
});

assert.equal(sqlserver.whereSql, " WHERE ([deleted_at] IS NULL OR CAST([deleted_at] AS nvarchar(max)) = '')");
assert.deepEqual(sqlserver.params, {});

const clickhouse = buildTablePreviewClauses({
    dialect: 'clickhouse',
    quoteIdentifier: value => `\`${value.replace(/`/g, '``')}\``,
    filters: [{ col: 'duration_ms', kind: 'number', op: 'le', value: '250' }],
});

assert.equal(clickhouse.whereSql, ' WHERE `duration_ms` <= {previewParam1:Float64}');
assert.deepEqual(clickhouse.params, { previewParam1: 250 });

assert.equal(normalizeTablePreviewLimit(undefined), 200);
assert.equal(normalizeTablePreviewLimit(25.9), 25);
assert.equal(normalizeTablePreviewLimit(-1), 200);
assert.equal(normalizeTablePreviewOffset(undefined), 0);
assert.equal(normalizeTablePreviewOffset(40.9), 40);
assert.equal(normalizeTablePreviewOffset(-5), 0);

console.log('table-preview query tests passed');
