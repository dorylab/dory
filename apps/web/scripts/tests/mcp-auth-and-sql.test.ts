import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMcpToken, hashMcpToken, isAllowedMcpOrigin, MCP_DEFAULT_SCOPES, MCP_TOKEN_PREFIX } from '../../lib/server/mcp/auth';
import { getReadonlyMcpStatements } from '../../lib/server/mcp/sql-safety';

test('generateMcpToken returns one-time token metadata without storing the raw token', () => {
    const generated = generateMcpToken();

    assert.ok(generated.token.startsWith(MCP_TOKEN_PREFIX));
    assert.ok(generated.tokenPrefix.startsWith(MCP_TOKEN_PREFIX));
    assert.equal(generated.tokenHash, hashMcpToken(generated.token));
    assert.notEqual(generated.tokenHash, generated.token);
    assert.equal(generated.tokenHash.length, 64);
});

test('default MCP scopes cover v1 read and analysis capabilities', () => {
    assert.deepEqual([...MCP_DEFAULT_SCOPES], ['connections:read', 'query:read', 'analysis:run']);
});

test('isAllowedMcpOrigin accepts same-origin and localhost calls', () => {
    assert.equal(
        isAllowedMcpOrigin(
            new Request('http://localhost:3000/api/mcp', {
                headers: { origin: 'http://localhost:3000' },
            }),
        ),
        true,
    );
    assert.equal(
        isAllowedMcpOrigin(
            new Request('https://dory.example.com/api/mcp', {
                headers: { origin: 'https://dory.example.com' },
            }),
        ),
        true,
    );
    assert.equal(
        isAllowedMcpOrigin(
            new Request('http://127.0.0.1:3000/api/mcp', {
                headers: { origin: 'http://127.0.0.1:5173' },
            }),
        ),
        true,
    );
});

test('isAllowedMcpOrigin rejects untrusted remote origins', () => {
    assert.equal(
        isAllowedMcpOrigin(
            new Request('https://dory.example.com/api/mcp', {
                headers: { origin: 'https://evil.example.com' },
            }),
        ),
        false,
    );
});

test('getReadonlyMcpStatements accepts supported read-only SQL prefixes', () => {
    assert.deepEqual(getReadonlyMcpStatements('SELECT * FROM users; SHOW TABLES;'), ['SELECT * FROM users', 'SHOW TABLES']);
    assert.deepEqual(getReadonlyMcpStatements('WITH cte AS (SELECT 1) SELECT * FROM cte'), ['WITH cte AS (SELECT 1) SELECT * FROM cte']);
    assert.deepEqual(getReadonlyMcpStatements('PRAGMA table_info(users)'), ['PRAGMA table_info(users)']);
});

test('getReadonlyMcpStatements rejects write operations and mixed multi-statements', () => {
    assert.throws(() => getReadonlyMcpStatements('INSERT INTO users VALUES (1)'), /Only read-only SQL is allowed/);
    assert.throws(() => getReadonlyMcpStatements('SELECT * FROM users; DROP TABLE users;'), /Only read-only SQL is allowed/);
});
