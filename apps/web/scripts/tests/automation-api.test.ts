import assert from 'node:assert/strict';
import test from 'node:test';
import {
    resolveOrganizationIdFromHeaders,
    parseSqlOp,
    isReadOnlyQuery,
    MAX_STATEMENTS,
    AI_ROW_LIMIT,
} from '../../lib/automation/utils';

// ---------------------------------------------------------------------------
// resolveOrganizationIdFromHeaders
// ---------------------------------------------------------------------------

test('resolveOrganizationIdFromHeaders returns x-organization-id when present', () => {
    const headers = new Headers({ 'x-organization-id': 'org_123' });
    assert.equal(resolveOrganizationIdFromHeaders(headers), 'org_123');
});

test('resolveOrganizationIdFromHeaders falls back to x-org-id', () => {
    const headers = new Headers({ 'x-org-id': 'org_456' });
    assert.equal(resolveOrganizationIdFromHeaders(headers), 'org_456');
});

test('resolveOrganizationIdFromHeaders prefers x-organization-id over x-org-id', () => {
    const headers = new Headers({
        'x-organization-id': 'org_primary',
        'x-org-id': 'org_fallback',
    });
    assert.equal(resolveOrganizationIdFromHeaders(headers), 'org_primary');
});

test('resolveOrganizationIdFromHeaders returns null when no org header present', () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    assert.equal(resolveOrganizationIdFromHeaders(headers), null);
});

test('resolveOrganizationIdFromHeaders returns null for empty headers', () => {
    const headers = new Headers();
    assert.equal(resolveOrganizationIdFromHeaders(headers), null);
});

// ---------------------------------------------------------------------------
// parseSqlOp
// ---------------------------------------------------------------------------

test('parseSqlOp identifies SELECT statements', () => {
    assert.equal(parseSqlOp('SELECT * FROM users'), 'SELECT');
    assert.equal(parseSqlOp('  select count(*) from orders  '), 'SELECT');
});

test('parseSqlOp identifies DML statements', () => {
    assert.equal(parseSqlOp('INSERT INTO users VALUES (1)'), 'INSERT');
    assert.equal(parseSqlOp('UPDATE users SET name = "a"'), 'UPDATE');
    assert.equal(parseSqlOp('DELETE FROM users WHERE id = 1'), 'DELETE');
    assert.equal(parseSqlOp('REPLACE INTO users VALUES (1)'), 'REPLACE');
});

test('parseSqlOp identifies DDL statements', () => {
    assert.equal(parseSqlOp('CREATE TABLE foo (id INT)'), 'DDL');
    assert.equal(parseSqlOp('ALTER TABLE foo ADD col INT'), 'DDL');
    assert.equal(parseSqlOp('DROP TABLE foo'), 'DDL');
    assert.equal(parseSqlOp('TRUNCATE TABLE foo'), 'DDL');
    assert.equal(parseSqlOp('RENAME TABLE foo TO bar'), 'DDL');
});

test('parseSqlOp identifies transaction statements', () => {
    assert.equal(parseSqlOp('BEGIN'), 'TXN');
    assert.equal(parseSqlOp('COMMIT'), 'TXN');
    assert.equal(parseSqlOp('ROLLBACK'), 'TXN');
    assert.equal(parseSqlOp('SAVEPOINT sp1'), 'TXN');
    assert.equal(parseSqlOp('RELEASE sp1'), 'TXN');
});

test('parseSqlOp returns first keyword for unknown statements', () => {
    assert.equal(parseSqlOp('SHOW TABLES'), 'SHOW');
    assert.equal(parseSqlOp('DESCRIBE users'), 'DESCRIBE');
    assert.equal(parseSqlOp('EXPLAIN SELECT 1'), 'EXPLAIN');
});

test('parseSqlOp returns SQL for empty input', () => {
    assert.equal(parseSqlOp(''), 'SQL');
    assert.equal(parseSqlOp('   '), 'SQL');
});

// ---------------------------------------------------------------------------
// isReadOnlyQuery
// ---------------------------------------------------------------------------

test('isReadOnlyQuery allows SELECT queries', () => {
    assert.equal(isReadOnlyQuery('SELECT * FROM users'), true);
    assert.equal(isReadOnlyQuery('  select 1  '), true);
});

test('isReadOnlyQuery allows SHOW, DESCRIBE, EXPLAIN', () => {
    assert.equal(isReadOnlyQuery('SHOW TABLES'), true);
    assert.equal(isReadOnlyQuery('DESCRIBE users'), true);
    assert.equal(isReadOnlyQuery('DESC users'), true);
    assert.equal(isReadOnlyQuery('EXPLAIN SELECT 1'), true);
});

test('isReadOnlyQuery allows WITH (CTE) queries', () => {
    assert.equal(isReadOnlyQuery('WITH cte AS (SELECT 1) SELECT * FROM cte'), true);
});

test('isReadOnlyQuery rejects write operations', () => {
    assert.equal(isReadOnlyQuery('INSERT INTO users VALUES (1)'), false);
    assert.equal(isReadOnlyQuery('UPDATE users SET name = "a"'), false);
    assert.equal(isReadOnlyQuery('DELETE FROM users WHERE id = 1'), false);
    assert.equal(isReadOnlyQuery('DROP TABLE users'), false);
    assert.equal(isReadOnlyQuery('CREATE TABLE foo (id INT)'), false);
    assert.equal(isReadOnlyQuery('TRUNCATE TABLE foo'), false);
});

test('isReadOnlyQuery is case-insensitive', () => {
    assert.equal(isReadOnlyQuery('Select * from users'), true);
    assert.equal(isReadOnlyQuery('SHOW databases'), true);
    assert.equal(isReadOnlyQuery('insert into users values (1)'), false);
});

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

test('MAX_STATEMENTS is 100', () => {
    assert.equal(MAX_STATEMENTS, 100);
});

test('AI_ROW_LIMIT is 200', () => {
    assert.equal(AI_ROW_LIMIT, 200);
});
