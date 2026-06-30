import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { McpAccessTokenRecord, McpAuthorizationRequestRecord } from '@dory/database/postgres/impl/mcp';
import { resolveMcpAuthorizationPollState } from '@dory/database/postgres/impl/mcp';
import type { OrganizationAccess } from '../../lib/server/authz';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const {
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
} = await import('../../lib/server/mcp/auth');
const { getReadonlyMcpStatements } = await import('../../lib/server/mcp/sql-safety');
const { resolveMcpDesktopGrantOrganizationId } = await import('../../lib/server/mcp/desktop-grant');
const { clampMcpLimit, matchSchemaSearch, normalizeMonitoringFilters } = await import('../../lib/server/mcp/tools');
const { getMcpLinkExpiresAt, getMcpLinkScopes, hashMcpLinkVerifier, mcpLinkPollSchema, mcpLinkStartSchema, MCP_LINK_TTL_MS } = await import('../../lib/server/mcp/link');
const { createExternalRequestUrl, createWorkspaceRequestUrl, getWorkspaceRequestOrigin } = await import('../../lib/server/request-origin');

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

function withBetterAuthUrl<T>(value: string | undefined, fn: () => T) {
    const previous = process.env.BETTER_AUTH_URL;
    if (value === undefined) {
        delete process.env.BETTER_AUTH_URL;
    } else {
        process.env.BETTER_AUTH_URL = value;
    }

    try {
        return fn();
    } finally {
        if (previous === undefined) {
            delete process.env.BETTER_AUTH_URL;
        } else {
            process.env.BETTER_AUTH_URL = previous;
        }
    }
}

function createAuthorizationRequestRecord(overrides: Partial<McpAuthorizationRequestRecord> = {}): McpAuthorizationRequestRecord {
    return {
        id: 'request-id',
        clientName: 'Codex',
        verifierHash: hashMcpLinkVerifier('verifier-secret'),
        scopes: ['connections:read'],
        status: 'pending',
        organizationId: null,
        userId: null,
        mcpTokenId: null,
        approvedAt: null,
        deniedAt: null,
        consumedAt: null,
        expiresAt: new Date('2026-01-01T00:10:00.000Z'),
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

test('default MCP scopes cover v1 read, analysis, and local agent capabilities', () => {
    assert.deepEqual(
        [...MCP_DEFAULT_SCOPES],
        [
            'connections:read',
            'query:read',
            'analysis:run',
            'schema:read',
            'tabs:read',
            'tabs:write',
            'saved_queries:read',
            'saved_queries:write',
            'monitoring:read',
            'local_ai:run',
        ],
    );
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
    assert.equal(verifyMcpDesktopGrant(grant, { now: 6_000, secret, ignoreExpiration: true })?.userId, 'owner-user');
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

test('desktop MCP grant organization resolution can use the requested route organization', async () => {
    const organizationId = await resolveMcpDesktopGrantOrganizationId({
        userId: 'owner-user',
        sessionOrganizationId: null,
        requestedOrganizationSlugOrId: 'workspace',
        findOrganizationBySlugOrId: async (slugOrId, userId) => (slugOrId === 'workspace' && userId === 'owner-user' ? { id: 'org' } : null),
    });

    assert.equal(organizationId, 'org');
});

test('desktop MCP grant organization resolution keeps explicit ids when lookup misses', async () => {
    const organizationId = await resolveMcpDesktopGrantOrganizationId({
        userId: 'owner-user',
        sessionOrganizationId: null,
        requestedOrganizationSlugOrId: 'org-id',
        findOrganizationBySlugOrId: async () => null,
    });

    assert.equal(organizationId, 'org-id');
});

test('web MCP link verifier hashing is deterministic and never exposes the verifier', () => {
    const verifier = 'web-mcp-verifier-secret';
    const hash = hashMcpLinkVerifier(verifier);

    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(hash, hashMcpLinkVerifier(verifier));
    assert.notEqual(hash, verifier);
});

test('web MCP link schemas validate start and poll payloads', () => {
    assert.equal(
        mcpLinkStartSchema.safeParse({
            clientName: 'Codex',
            verifierHash: 'a'.repeat(64),
            scopes: ['connections:read', 'local_ai:run'],
        }).success,
        true,
    );
    assert.equal(
        mcpLinkStartSchema.safeParse({
            clientName: '',
            verifierHash: 'not-a-hash',
        }).success,
        false,
    );
    assert.equal(
        mcpLinkPollSchema.safeParse({
            requestId: 'request',
            verifier: 'long-enough-verifier',
        }).success,
        true,
    );
});

test('web MCP link defaults use existing MCP scopes and ten minute expiry', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');

    assert.deepEqual(getMcpLinkScopes(), [...MCP_DEFAULT_SCOPES]);
    assert.equal(getMcpLinkExpiresAt(now).getTime(), now + MCP_LINK_TTL_MS);
});

test('web MCP link URLs prefer the externally reachable request host', () => {
    withBetterAuthUrl(undefined, () => {
        assert.equal(
            createExternalRequestUrl(
                new Request('http://0.0.0.0:3000/api/mcp/link/start', {
                    headers: {
                        host: 'localhost:3000',
                    },
                }),
                '/mcp/authorize',
            ),
            'http://localhost:3000/mcp/authorize',
        );

        assert.equal(
            createExternalRequestUrl(
                new Request('http://0.0.0.0:3000/api/mcp/link/start', {
                    headers: {
                        'x-forwarded-host': 'dory.example.com',
                        'x-forwarded-proto': 'https',
                    },
                }),
                '/mcp/authorize',
            ),
            'https://dory.example.com/mcp/authorize',
        );
    });
});

test('web MCP link URLs prefer BETTER_AUTH_URL when configured', () => {
    withBetterAuthUrl('https://dory.example.com/base-path', () => {
        assert.equal(createExternalRequestUrl(new Request('http://0.0.0.0:3000/api/mcp/link/start'), '/mcp/authorize'), 'https://dory.example.com/mcp/authorize');
    });

    withBetterAuthUrl('dory.example.com', () => {
        assert.equal(createExternalRequestUrl(new Request('http://0.0.0.0:3000/api/mcp/link/start'), '/mcp/authorize'), 'https://dory.example.com/mcp/authorize');
    });
});

test('workspace request URLs ignore BETTER_AUTH_URL and use the running host', () => {
    withBetterAuthUrl('https://app.getdory.dev', () => {
        const req = new Request('http://0.0.0.0:3000/api/mcp', {
            headers: {
                host: 'localhost:3000',
            },
        });

        assert.equal(createExternalRequestUrl(req, '/mcp/authorize'), 'https://app.getdory.dev/mcp/authorize');
        assert.equal(getWorkspaceRequestOrigin(req), 'http://localhost:3000');
        assert.equal(createWorkspaceRequestUrl(req, '/org/agent-runs/work-1'), 'http://localhost:3000/org/agent-runs/work-1');
    });

    withBetterAuthUrl('https://app.getdory.dev', () => {
        const req = new Request('http://0.0.0.0:3000/api/mcp', {
            headers: {
                'x-forwarded-host': 'selfhost.example.com',
                'x-forwarded-proto': 'https',
            },
        });

        assert.equal(getWorkspaceRequestOrigin(req), 'https://selfhost.example.com');
    });
});

test('web MCP authorization repository state resolver covers terminal and pending states', () => {
    const now = new Date('2026-01-01T00:01:00.000Z');
    const verifierHash = hashMcpLinkVerifier('verifier-secret');

    assert.equal(resolveMcpAuthorizationPollState(null, { verifierHash, now }).status, 'not_found');
    assert.equal(resolveMcpAuthorizationPollState(createAuthorizationRequestRecord(), { verifierHash, now }).status, 'pending');
    assert.equal(resolveMcpAuthorizationPollState(createAuthorizationRequestRecord({ status: 'approved' }), { verifierHash, now }).status, 'approved');
    assert.equal(resolveMcpAuthorizationPollState(createAuthorizationRequestRecord({ status: 'denied' }), { verifierHash, now }).status, 'denied');
    assert.equal(
        resolveMcpAuthorizationPollState(
            createAuthorizationRequestRecord({
                expiresAt: new Date('2025-12-31T23:59:59.000Z'),
            }),
            { verifierHash, now },
        ).status,
        'expired',
    );
    assert.equal(
        resolveMcpAuthorizationPollState(
            createAuthorizationRequestRecord({
                consumedAt: new Date('2026-01-01T00:02:00.000Z'),
            }),
            { verifierHash, now },
        ).status,
        'consumed',
    );
    assert.equal(resolveMcpAuthorizationPollState(createAuthorizationRequestRecord(), { verifierHash: 'b'.repeat(64), now }).status, 'verifier_mismatch');
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

    assert.equal(
        matchSchemaSearch(
            {
                kind: 'column',
                database: 'default',
                table: 'hn_stories',
                name: 'comment_count',
                type: 'integer',
                comment: 'number of comments',
                isPrimaryKey: null,
            },
            'hacknews hacker news hn posts stories score comments',
        ),
        true,
    );
});
