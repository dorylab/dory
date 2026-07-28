import assert from 'node:assert/strict';
import test from 'node:test';

import { splitMultiSQL } from '../../src/utils/split-multi-sql';

test('default splitter keeps semicolons inside strings, identifiers, and comments', () => {
    const sql = `
        SELECT 'single;quote', "double;quote", \`backtick;identifier\`;
        -- comment; content
        SELECT 2;
        /* block; content */
        SELECT 3;
    `;

    assert.deepEqual(splitMultiSQL(sql), [
        'SELECT \'single;quote\', "double;quote", `backtick;identifier`',
        '-- comment; content\n        SELECT 2',
        '/* block; content */\n        SELECT 3',
    ]);
});

test('MySQL splitter honors DELIMITER directives', () => {
    const sql = `
        DELIMITER //
        CREATE PROCEDURE run_steps()
        BEGIN
            SELECT 1;
            SELECT 'two;still body';
        END//
        DELIMITER ;
        SELECT 3;
    `;

    assert.deepEqual(splitMultiSQL(sql, 'mysql'), [
        `CREATE PROCEDURE run_steps()
        BEGIN
            SELECT 1;
            SELECT 'two;still body';
        END`,
        'SELECT 3',
    ]);
});

test('SQL Server splitter supports semicolons, GO, and BEGIN/END blocks', () => {
    const sql = `
        SELECT 1;
        SELECT 2;
        GO
        BEGIN TRY
            SELECT 3;
        END TRY
        BEGIN CATCH
            SELECT 4;
        END CATCH;
        GO
        SELECT 5;
    `;

    assert.deepEqual(splitMultiSQL(sql, 'sqlserver'), [
        'SELECT 1',
        'SELECT 2',
        `BEGIN TRY
            SELECT 3;
        END TRY
        BEGIN CATCH
            SELECT 4;
        END CATCH`,
        'SELECT 5',
    ]);
});

test('Oracle splitter supports anonymous blocks and slash separators', () => {
    const sql = `
        BEGIN
            IF 1 = 1 THEN
                NULL;
            END IF;
        END;
        /
        SELECT 1 FROM dual;
        SELECT 2 FROM dual;
    `;

    assert.deepEqual(splitMultiSQL(sql, 'oracle'), [
        `BEGIN
            IF 1 = 1 THEN
                NULL;
            END IF;
        END`,
        'SELECT 1 FROM dual',
        'SELECT 2 FROM dual',
    ]);
});

test('SQLite splitter keeps trigger bodies together', () => {
    const sql = `
        CREATE TRIGGER update_log AFTER UPDATE ON users
        BEGIN
            INSERT INTO logs(message) VALUES ('updated; user');
            UPDATE counters SET value = value + 1;
        END;
        SELECT 1;
    `;

    assert.deepEqual(splitMultiSQL(sql, 'sqlite'), [
        `CREATE TRIGGER update_log AFTER UPDATE ON users
        BEGIN
            INSERT INTO logs(message) VALUES ('updated; user');
            UPDATE counters SET value = value + 1;
        END`,
        'SELECT 1',
    ]);
});

test('dollar-quoted splitter supports DuckDB and Snowflake bodies', () => {
    assert.deepEqual(splitMultiSQL('SELECT $tag$a;b$tag$; SELECT $$c;d$$;', 'dollar-quoted'), ['SELECT $tag$a;b$tag$', 'SELECT $$c;d$$']);
});

test('ClickHouse splitter keeps escaped quotes and backtick identifiers together', () => {
    assert.deepEqual(splitMultiSQL("SELECT 'a\\';b', `c;d`; SELECT 2;", 'clickhouse'), ["SELECT 'a\\';b', `c;d`", 'SELECT 2']);
});
