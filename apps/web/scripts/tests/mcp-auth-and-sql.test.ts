import assert from 'node:assert/strict';
import test from 'node:test';
import type { McpAccessTokenRecord } from '@dory/database/postgres/impl/mcp';
import type { OrganizationAccess } from '../../lib/server/authz';
import {
    authenticateMcpRequest,
    buildMcpAuthContextForDesktopGrant,
    buildMcpAuthContextForToken,
    generateMcpToken,
    hashMcpToken,
    hasMcpScope,
    isAllowedMcpOrigin,
    issueMcpDesktopGrant,
    MCP_DEFAULT_SCOPES,
    MCP_TOKEN_PREFIX,
    verifyMcpDesktopGrant,
} from '../../lib/server/mcp/auth';
import { getReadonlyMcpStatements } from '../../lib/server/mcp/sql-safety';
import { clampMcpLimit, matchSchemaSearch, normalizeMonitoringFilters } from '../../lib/server/mcp/tools';

function createAccess(overrides: Partial<OrganizationAccess> = {}): OrganizationAccess {
    return {
        source: 'local' as const,
        organizationId: 'org',
        userId: 'owner-user',
        isMember: true,
        role: 'member' as const,
        permissions: {
            organization: { read: true, update: false, delete: false },
            member: { read: true, create: false, update: false, delete: false },
            invitation: { read: true, create: false, cancel: false },
            workspace: { read: true, write: true },
            connection: { read: true, create: false, update: false, delete: false },
        },
        organization: {
            id: 'org',
            slug: 'org',
            name: 'Org',
        },
        ...overrides,
    };
}

function createTokenRecord(overrides: Partial<McpAccessTokenRecord> = {}): McpAccessTokenRecord {
    return {
        id: 'token-id',
        organizationId: 'org',
        name: 'MCP Client',
        tokenPrefix: 'dory_mcp_abc12345',
        tokenHash: 'hash',
        scopes: ['connections:read'],
        enabled: true,
        createdByUserId: 'owner-user',
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    };
}

test('generateMcpToken returns one-time token metadata without storing the raw token', () => {
    const generated = generateMcpToken();

    assert.ok(generated.token.startsWith(MCP_TOKEN_PREFIX));
    assert.ok(generated.tokenPrefix.startsWith(MCP_TOKEN_PREFIX));
    assert.equal(generated.tokenHash, hashMcpToken(generated.token));
    assert.notEqual(generated.tokenHash, generated.token);
    assert.equal(generated.tokenHash.length, 64);
});

test('default MCP scopes cover v1 read and analysis capabilities', () => {
    assert.deepEqual([...MCP_DEFAULT_SCOPES], ['connections:read', 'query:read', 'analysis:run', 'schema:read', 'saved_queries:read', 'monitoring:read']);
});

test('connections:read remains compatible with schema read tools', () => {
    const context = {
        tokenId: 'token',
        organizationId: 'org',
        userId: 'user',
        scopes: ['connections:read'],
        access: createAccess({ userId: 'user' }),
    };

    assert.equal(hasMcpScope(context, 'schema:read'), true);
    assert.equal(hasMcpScope(context, 'saved_queries:read'), false);
});

test('MCP auth context uses the personal token owner as the execution user', async () => {
    const result = await buildMcpAuthContextForToken(createTokenRecord(), {
        resolveAccess: async (organizationId, userId) => createAccess({ organizationId, userId }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.context.organizationId, 'org');
    assert.equal(result.context.userId, 'owner-user');
    assert.equal(result.context.tokenId, 'token-id');
    assert.deepEqual(result.context.scopes, ['connections:read']);
});

test('MCP auth context rejects tokens whose owner no longer has organization access', async () => {
    const result = await buildMcpAuthContextForToken(createTokenRecord(), {
        resolveAccess: async () => null,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 403);
});

test('MCP auth context rejects token owners without workspace or connection read access', async () => {
    const noWorkspace = await buildMcpAuthContextForToken(createTokenRecord(), {
        resolveAccess: async () =>
            createAccess({
                permissions: {
                    ...createAccess().permissions,
                    workspace: { read: false, write: false },
                },
            }),
    });
    assert.equal(noWorkspace.ok, false);

    const noConnection = await buildMcpAuthContextForToken(createTokenRecord(), {
        resolveAccess: async () =>
            createAccess({
                permissions: {
                    ...createAccess().permissions,
                    connection: { read: false, create: false, update: false, delete: false },
                },
            }),
    });
    assert.equal(noConnection.ok, false);
});

test('desktop MCP grants are signed, expire, and reject tampering', () => {
    const secret = 'test-secret';
    const { grant, expiresAt } = issueMcpDesktopGrant({
        userId: 'owner-user',
        organizationId: 'org',
        scopes: ['connections:read'],
        now: 1_000,
        expiresInMs: 5_000,
        secret,
    });

    assert.equal(expiresAt.toISOString(), new Date(6_000).toISOString());
    assert.deepEqual(verifyMcpDesktopGrant(grant, { now: 2_000, secret }), {
        v: 1,
        typ: 'dory_mcp_desktop_grant',
        userId: 'owner-user',
        organizationId: 'org',
        scopes: ['connections:read'],
        iat: 1_000,
        exp: 6_000,
    });
    assert.equal(verifyMcpDesktopGrant(`${grant.slice(0, -1)}x`, { now: 2_000, secret }), null);
    assert.equal(verifyMcpDesktopGrant(grant, { now: 6_000, secret }), null);
});

test('desktop MCP grant auth context uses the signed user and organization', async () => {
    const access = createAccess({ organizationId: 'org', userId: 'owner-user' });
    const { grant } = issueMcpDesktopGrant({
        userId: 'owner-user',
        organizationId: 'org',
        scopes: ['connections:read'],
        access,
        secret: 'test-secret',
    });

    const result = await buildMcpAuthContextForDesktopGrant(grant, {
        secret: 'test-secret',
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.context.tokenId, 'desktop-grant');
    assert.equal(result.context.organizationId, 'org');
    assert.equal(result.context.userId, 'owner-user');
    assert.deepEqual(result.context.scopes, ['connections:read']);
});

test('desktop MCP grant auth context rejects invalid grants', async () => {
    const result = await buildMcpAuthContextForDesktopGrant('invalid', {
        secret: 'test-secret',
        resolveAccess: async (organizationId, userId) => createAccess({ organizationId, userId }),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
});

test('MCP request auth keeps missing bearer behavior outside desktop runtime', async () => {
    const result = await authenticateMcpRequest(new Request('https://dory.example.com/api/mcp'));

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
    assert.equal(result.message, 'Missing or invalid MCP bearer token.');
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

test('normalizeMonitoringFilters applies monitoring defaults and clamps min duration', () => {
    assert.deepEqual(normalizeMonitoringFilters(null), {
        search: '',
        user: 'all',
        database: 'all',
        queryType: 'all',
        minDurationMs: 0,
        timeRange: '1h',
    });

    assert.deepEqual(
        normalizeMonitoringFilters({
            search: 'timeout',
            user: 'app',
            database: 'warehouse',
            queryType: 'select',
            minDurationMs: 123.7,
            timeRange: '24h',
        }),
        {
            search: 'timeout',
            user: 'app',
            database: 'warehouse',
            queryType: 'select',
            minDurationMs: 123,
            timeRange: '24h',
        },
    );
});

test('clampMcpLimit returns defaults and enforces max', () => {
    assert.equal(clampMcpLimit(undefined, 25, 100), 25);
    assert.equal(clampMcpLimit(0, 25, 100), 1);
    assert.equal(clampMcpLimit(12.8, 25, 100), 12);
    assert.equal(clampMcpLimit(120, 25, 100), 100);
});

test('matchSchemaSearch matches table and column metadata', () => {
    assert.equal(
        matchSchemaSearch(
            {
                kind: 'table',
                database: 'analytics',
                name: 'orders',
                comment: 'Customer purchases',
                totalBytes: null,
                totalRows: null,
                lastModified: null,
            },
            'purchase',
        ),
        true,
    );

    assert.equal(
        matchSchemaSearch(
            {
                kind: 'column',
                database: 'analytics',
                table: 'orders',
                name: 'created_at',
                type: 'timestamp',
                comment: null,
                isPrimaryKey: null,
            },
            'timestamp',
        ),
        true,
    );

    assert.equal(
        matchSchemaSearch(
            {
                kind: 'column',
                database: 'analytics',
                table: 'orders',
                name: 'created_at',
                type: 'timestamp',
                comment: null,
                isPrimaryKey: null,
            },
            'invoice',
        ),
        false,
    );
});
