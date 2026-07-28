import assert from 'node:assert/strict';
import test from 'node:test';

import { isReadOnlyPostgresStatement } from '../../lib/server/postgres-sql-safety';
import { splitSqlStatements } from '../../lib/server/sql-splitter';

test('PostgreSQL splitter keeps anonymous and tagged dollar-quoted bodies together', async () => {
    const sql = `
        DO $$ BEGIN PERFORM 1; END $$;
        CREATE FUNCTION run_steps() RETURNS void AS $body$
        BEGIN
            PERFORM 1;
            PERFORM 'two;still body';
        END;
        $body$ LANGUAGE plpgsql;
        SELECT 2;
    `;

    assert.deepEqual(await splitSqlStatements(sql, 'postgres'), [
        'DO $$ BEGIN PERFORM 1; END $$',
        `CREATE FUNCTION run_steps() RETURNS void AS $body$
        BEGIN
            PERFORM 1;
            PERFORM 'two;still body';
        END;
        $body$ LANGUAGE plpgsql`,
        'SELECT 2',
    ]);
});

test('PostgreSQL splitter uses UTF-8 byte positions and preserves inter-statement comments', async () => {
    const sql = `
        -- 中文说明
        SELECT '😀;中文';
        /* nested /* inner; */ outer; */
        SELECT 2
    `;

    assert.deepEqual(await splitSqlStatements(sql, 'neon'), ["-- 中文说明\n        SELECT '😀;中文'", '/* nested /* inner; */ outer; */\n        SELECT 2']);
});

test('PostgreSQL splitter ignores positional parameters and does not require valid grammar', async () => {
    assert.deepEqual(await splitSqlStatements('SELECT $1; BAD SYNTAX; SELECT 2;', 'supabase'), ['SELECT $1', 'BAD SYNTAX', 'SELECT 2']);
});

test('PostgreSQL AST safety accepts read-only statements', async () => {
    assert.equal(await isReadOnlyPostgresStatement('SELECT * FROM users'), true);
    assert.equal(await isReadOnlyPostgresStatement('WITH source AS (SELECT 1) SELECT * FROM source'), true);
    assert.equal(await isReadOnlyPostgresStatement('SHOW search_path'), true);
    assert.equal(await isReadOnlyPostgresStatement('EXPLAIN ANALYZE SELECT * FROM users'), true);
});

test('PostgreSQL AST safety rejects mutations, locking, and data-modifying CTEs', async () => {
    assert.equal(await isReadOnlyPostgresStatement('INSERT INTO users(id) VALUES (1)'), false);
    assert.equal(await isReadOnlyPostgresStatement('UPDATE users SET id = 2'), false);
    assert.equal(await isReadOnlyPostgresStatement('DELETE FROM users'), false);
    assert.equal(await isReadOnlyPostgresStatement('COPY users TO STDOUT'), false);
    assert.equal(await isReadOnlyPostgresStatement('CALL refresh_users()'), false);
    assert.equal(await isReadOnlyPostgresStatement('SELECT * FROM users FOR UPDATE'), false);
    assert.equal(await isReadOnlyPostgresStatement('WITH changed AS (DELETE FROM users RETURNING *) SELECT * FROM changed'), false);
    assert.equal(await isReadOnlyPostgresStatement('EXPLAIN ANALYZE DELETE FROM users'), false);
});
