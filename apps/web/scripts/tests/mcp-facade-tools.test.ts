import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ActionContext } from '@dory/actions';
import { getOrganizationPermissionMap } from '@/lib/auth/organization-ac';
import type { WebActionServices } from '@/lib/actions/server/types';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const [{ getPublicDoryMcpTools, structuredMcpFacadeError }, { registerDoryMcpTools }] = await Promise.all([
    import('@/lib/server/mcp/facade-tools'),
    import('@/lib/server/mcp/tools'),
]);

function createWorksMock() {
    const events: any[] = [];
    const works = new Map<string, any>();
    let nextId = 1;
    const now = new Date('2026-06-01T00:00:00.000Z');
    const defaultTitle = 'Agent Run';

    const cleanSummaryItems = (value: unknown) => (Array.isArray(value) ? value.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean) : []);
    const getAgentRunSummaryMetadata = (metadata: Record<string, unknown> | null | undefined) => {
        const raw = metadata?.agentRunSummary;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                summaryTitle: null,
                findings: [],
                steps: [],
                sections: [],
            };
        }

        const record = raw as Record<string, unknown>;
        const sections = Array.isArray(record.sections)
            ? record.sections
                  .map(section => {
                      if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
                      const sectionRecord = section as Record<string, unknown>;
                      const findings = cleanSummaryItems(sectionRecord.findings);
                      const steps = cleanSummaryItems(sectionRecord.steps);
                      const finishedAt = typeof sectionRecord.finishedAt === 'string' && sectionRecord.finishedAt.trim() ? sectionRecord.finishedAt : null;
                      if ((!findings.length && !steps.length) || !finishedAt) return null;

                      return {
                          summaryTitle: typeof sectionRecord.summaryTitle === 'string' && sectionRecord.summaryTitle.trim() ? sectionRecord.summaryTitle.trim() : null,
                          findings,
                          steps,
                          finishedAt,
                      };
                  })
                  .filter((section): section is { summaryTitle: string | null; findings: string[]; steps: string[]; finishedAt: string } => Boolean(section))
            : [];

        return {
            summaryTitle: typeof record.summaryTitle === 'string' && record.summaryTitle.trim() ? record.summaryTitle.trim() : null,
            findings: cleanSummaryItems(record.findings),
            steps: cleanSummaryItems(record.steps),
            sections,
        };
    };

    const materialize = (input: any, workId = input.workId ?? `work-${nextId++}`) => {
        const existing = works.get(workId);
        if (existing) return existing;
        const row = {
            workId,
            organizationId: input.organizationId,
            userId: input.userId,
            tokenId: input.tokenId ?? null,
            connectionId: input.connectionId ?? null,
            externalSessionId: input.externalSessionId ?? null,
            title: input.title ?? defaultTitle,
            status: 'active',
            metadata: input.metadata ?? null,
            createdAt: now,
            updatedAt: now,
            lastActiveAt: now,
            archivedAt: null,
        };
        works.set(workId, row);
        return row;
    };

    const prepareExisting = (work: any, input: any) => {
        const requestedConnectionId = input.connectionId ?? null;
        if (requestedConnectionId && work.connectionId && work.connectionId !== requestedConnectionId) {
            throw Object.assign(new Error(`Work ${work.workId} is already bound to connection ${work.connectionId}; received ${requestedConnectionId}.`), {
                code: 'WORK_CONNECTION_MISMATCH',
                status: 409,
                details: {
                    workId: work.workId,
                    expectedConnectionId: work.connectionId,
                    receivedConnectionId: requestedConnectionId,
                },
            });
        }
        if (requestedConnectionId && !work.connectionId) {
            work.connectionId = requestedConnectionId;
        }
        if (input.title && work.title === defaultTitle) {
            work.title = input.title;
        }
        work.updatedAt = now;
        work.lastActiveAt = now;
        return work;
    };

    const findByExternalSessionId = (input: any) =>
        [...works.values()].find(
            work =>
                work.organizationId === input.organizationId &&
                work.userId === input.userId &&
                work.tokenId === (input.tokenId ?? null) &&
                work.externalSessionId === input.externalSessionId &&
                !work.archivedAt,
        );
    const findByWorkId = (input: any) => {
        const work = works.get(input.workId);
        if (!work) return null;
        return work.organizationId === input.organizationId && work.userId === input.userId ? work : null;
    };

    return {
        events,
        works,
        create: async (input: any) => {
            if (input.externalSessionId) {
                const existing = findByExternalSessionId(input);
                if (existing) return prepareExisting(existing, input);
            }
            return materialize(input);
        },
        resolve: async (input: any) => {
            const existing = input.workId ? (findByWorkId(input) ?? null) : input.externalSessionId ? (findByExternalSessionId(input) ?? null) : null;
            if (existing) return prepareExisting(existing, input);
            return materialize(input);
        },
        resolveExisting: async (input: any) => {
            const existing = input.workId ? (findByWorkId(input) ?? null) : input.externalSessionId ? (findByExternalSessionId(input) ?? null) : null;
            return existing ? prepareExisting(existing, input) : null;
        },
        recordEvent: async (event: any) => {
            events.push(event);
            return { ...event, id: events.length, createdAt: now };
        },
        finishWithSummary: async (input: any) => {
            const work = works.get(input.workId);
            if (!work || work.organizationId !== input.organizationId || work.userId !== input.userId) {
                throw Object.assign(new Error(`Work not found: ${input.workId}.`), {
                    code: 'WORK_NOT_FOUND',
                    status: 404,
                });
            }
            work.status = input.status;
            const existingSummary = getAgentRunSummaryMetadata(work.metadata);
            const nextFindings = cleanSummaryItems(input.findings);
            const nextSteps = cleanSummaryItems(input.steps);
            work.metadata = {
                ...(work.metadata ?? {}),
                agentRunSummary: {
                    summaryTitle: input.summaryTitle?.trim() || existingSummary.summaryTitle,
                    findings: [...existingSummary.findings, ...nextFindings],
                    steps: [...existingSummary.steps, ...nextSteps],
                    sections: [
                        ...existingSummary.sections,
                        {
                            summaryTitle: input.summaryTitle?.trim() || null,
                            findings: nextFindings,
                            steps: nextSteps,
                            finishedAt: now.toISOString(),
                        },
                    ],
                    updatedAt: now.toISOString(),
                },
            };
            work.updatedAt = now;
            work.lastActiveAt = now;
            return work;
        },
        summarizeInput: (input: unknown) => input,
        saveSqlSnapshot: async () => {},
    };
}

function getTool(name: string) {
    const tool = getPublicDoryMcpTools().find((item: any) => item.name === name);
    assert.ok(tool, `Expected MCP facade tool ${name}`);
    return tool;
}

async function assertRejectsCode(run: () => Promise<unknown>, code: string) {
    try {
        await run();
        assert.fail(`Expected rejection with code ${code}`);
    } catch (error) {
        assert.equal((error as any).code, code);
    }
}

function createContext(
    services: WebActionServices,
    scopes: string[] = ['connections:read', 'schema:read', 'query:read', 'tabs:read', 'tabs:write', 'saved_queries:read', 'saved_queries:write'],
    overrides: Partial<ActionContext<WebActionServices>> = {},
): ActionContext<WebActionServices> {
    return {
        organizationId: 'org-1',
        userId: 'user-1',
        access: {
            isMember: true,
            role: 'member',
            permissions: getOrganizationPermissionMap('member'),
        },
        actor: {
            type: 'mcp',
            scopes,
            id: 'token-1',
        },
        runtime: 'web',
        requestId: 'request-1',
        services: {
            requestOrigin: 'https://dory.test',
            ...services,
        },
        ...overrides,
    };
}

async function withDesktopProtocolEnv<T>(env: { DORY_PROTOCOL_SCHEME?: string; DORY_DISTRIBUTION?: string }, fn: () => Promise<T>) {
    const previousProtocol = process.env.DORY_PROTOCOL_SCHEME;
    const previousDistribution = process.env.DORY_DISTRIBUTION;
    if (env.DORY_PROTOCOL_SCHEME === undefined) {
        delete process.env.DORY_PROTOCOL_SCHEME;
    } else {
        process.env.DORY_PROTOCOL_SCHEME = env.DORY_PROTOCOL_SCHEME;
    }
    if (env.DORY_DISTRIBUTION === undefined) {
        delete process.env.DORY_DISTRIBUTION;
    } else {
        process.env.DORY_DISTRIBUTION = env.DORY_DISTRIBUTION;
    }

    try {
        return await fn();
    } finally {
        if (previousProtocol === undefined) {
            delete process.env.DORY_PROTOCOL_SCHEME;
        } else {
            process.env.DORY_PROTOCOL_SCHEME = previousProtocol;
        }
        if (previousDistribution === undefined) {
            delete process.env.DORY_DISTRIBUTION;
        } else {
            process.env.DORY_DISTRIBUTION = previousDistribution;
        }
    }
}

function assertDesktopWorkspaceUrl(value: string, protocol: string, expectedPath: string) {
    const url = new URL(value);
    assert.equal(url.protocol, `${protocol}:`);
    assert.equal(url.hostname, 'open');
    assert.equal(url.searchParams.get('path'), expectedPath);
}

test('public Dory MCP catalog is limited to high-level facade tools', () => {
    assert.deepEqual(
        getPublicDoryMcpTools()
            .map((tool: any) => tool.name)
            .sort(),
        [
            'dory_create_work',
            'dory_explore_schema',
            'dory_finish_work',
            'dory_list_connections',
            'dory_read',
            'dory_run_readonly_sql',
            'dory_saved_queries',
            'dory_workspace_tabs',
            'dory_write',
        ],
    );
});

test('public Dory MCP descriptions scope work context to query and workspace tools', () => {
    const createWork = getTool('dory_create_work');
    const write = getTool('dory_write');
    const listConnections = getTool('dory_list_connections');

    assert.match(createWork.description, /query, analysis, SQL, schema exploration, workspace tab, or saved query tools/);
    assert.doesNotMatch(createWork.description, /every later Dory tool call/);
    assert.match(write.description, /connection\.create, connection\.update, and connection\.delete/);
    assert.match(write.description, /do not require workId/);
    assert.doesNotMatch(write.description, /Call dory_create_work/);
    assert.match(listConnections.description, /Requires an existing workId/);
    assert.match(listConnections.description, /Call dory_create_work before query/);
});

test('dory_read and dory_write split MCP-runnable actions without adding domain-specific tools', async () => {
    const ctx = createContext(
        {
            db: {},
        } as unknown as WebActionServices,
        ['read', 'write'],
        {
            access: {
                isMember: true,
                role: 'owner',
                permissions: getOrganizationPermissionMap('owner'),
            },
        },
    );

    const readListOutput = (await getTool('dory_read').execute(ctx, { operation: 'list' })) as any;
    const readActionIds = readListOutput.actions.map((action: any) => action.id);
    const writeListOutput = (await getTool('dory_write').execute(ctx, { operation: 'list' })) as any;
    const writeActionIds = writeListOutput.actions.map((action: any) => action.id);

    assert.ok(readActionIds.includes('connection.test'));
    assert.equal(readActionIds.includes('connection.create'), false);
    assert.equal(readActionIds.includes('connection.delete'), false);
    assert.ok(writeActionIds.includes('connection.create'));
    assert.ok(writeActionIds.includes('connection.update'));
    assert.ok(writeActionIds.includes('connection.delete'));
    assert.equal(writeActionIds.includes('connection.test'), false);
    assert.equal(
        getPublicDoryMcpTools().some((tool: any) => tool.name === 'dory_create_connection'),
        false,
    );
    assert.equal(
        getPublicDoryMcpTools().some((tool: any) => tool.name === 'dory_delete_connection'),
        false,
    );

    const describeOutput = (await getTool('dory_write').execute(ctx, { operation: 'describe', actionId: 'connection.create' })) as any;
    assert.equal(describeOutput.action.id, 'connection.create');
    assert.equal(describeOutput.action.risk, 'write');
    assert.deepEqual(describeOutput.action.scopes, ['connections:write']);
    assert.equal(describeOutput.action.inputSchema.properties.payload.type, 'object');
    assert.match(describeOutput.action.inputSchema.properties.payload.description, /Dory connection creation payload/);
    assert.equal(describeOutput.availability.runnable, true);
    assert.deepEqual(describeOutput.availability.missingScopes, []);
});

test('dory_write describe returns schemas even when the token cannot run the action', async () => {
    const ctx = createContext(
        {
            db: {},
        } as unknown as WebActionServices,
        ['connections:read'],
        {
            access: {
                isMember: true,
                role: 'owner',
                permissions: getOrganizationPermissionMap('owner'),
            },
        },
    );

    const describeOutput = (await getTool('dory_write').execute(ctx, { operation: 'describe', actionId: 'connection.create' })) as any;

    assert.equal(describeOutput.action.id, 'connection.create');
    assert.equal(describeOutput.action.inputSchema.properties.payload.type, 'object');
    assert.equal(describeOutput.availability.runnable, false);
    assert.deepEqual(describeOutput.availability.missingScopes, ['connections:write']);
});

test('dory_read cannot describe write actions', async () => {
    const ctx = createContext(
        {
            db: {},
        } as unknown as WebActionServices,
        ['read', 'write'],
        {
            access: {
                isMember: true,
                role: 'owner',
                permissions: getOrganizationPermissionMap('owner'),
            },
        },
    );

    await assertRejectsCode(() => getTool('dory_read').execute(ctx, { operation: 'describe', actionId: 'connection.create' }), 'ACTION_NOT_AVAILABLE');
});

test('dory_write runs connection.create through the action executor without work context', async () => {
    const createdPayloads: any[] = [];
    const syncPayloads: any[] = [];
    const ctx = createContext(
        {
            db: {
                connections: {
                    create: async (_userId: string, _organizationId: string, payload: any) => {
                        createdPayloads.push(payload);
                        return { connection: { id: 'conn-1', name: payload.connection.name } };
                    },
                },
                syncOperations: {
                    enqueue: async (payload: any) => {
                        syncPayloads.push(payload);
                    },
                },
            },
        } as unknown as WebActionServices,
        ['connections:read', 'connections:write'],
        {
            access: {
                isMember: true,
                role: 'owner',
                permissions: getOrganizationPermissionMap('owner'),
            },
        },
    );

    const output = (await getTool('dory_write').execute(ctx, {
        operation: 'run',
        actionId: 'connection.create',
        input: {
            payload: {
                connection: {
                    name: 'Local Postgres',
                    type: 'postgres',
                    host: '127.0.0.1',
                    database: 'postgres',
                },
                identities: [
                    {
                        name: 'Default',
                        username: 'postgres',
                        password: 'postgres',
                        isDefault: true,
                        database: 'postgres',
                    },
                ],
            },
        },
        projection: 'mcp',
    })) as any;

    assert.equal(output.ok, true);
    assert.equal(output.actionId, 'connection.create');
    assert.equal(output.data.connection.id, 'conn-1');
    assert.equal(createdPayloads[0].connection.name, 'Local Postgres');
    assert.equal(createdPayloads[0].identities[0].username, 'postgres');
    assert.equal(syncPayloads[0].entityId, 'conn-1');
});

test('dory_write adds a default identity when creating a sqlite connection without identities', async () => {
    type CapturedCreatePayload = {
        connection: { name?: string };
        identities: Array<{
            id?: string;
            name?: string;
            username?: string;
            role?: string | null;
            password?: string | null;
            isDefault?: boolean;
            database?: string | null;
            enabled?: boolean;
            status?: string | null;
        }>;
    };

    const createdPayloads: CapturedCreatePayload[] = [];
    const ctx = createContext(
        {
            db: {
                connections: {
                    create: async (_userId: string, _organizationId: string, payload: CapturedCreatePayload) => {
                        createdPayloads.push(payload);
                        return { connection: { id: 'sqlite-1', name: payload.connection.name } };
                    },
                },
                syncOperations: {
                    enqueue: async () => {},
                },
            },
        } as unknown as WebActionServices,
        ['connections:write'],
        {
            access: {
                isMember: true,
                role: 'owner',
                permissions: getOrganizationPermissionMap('owner'),
            },
        },
    );

    const output = (await getTool('dory_write').execute(ctx, {
        operation: 'run',
        actionId: 'connection.create',
        input: {
            payload: {
                connection: {
                    name: 'Photos.sqlite',
                    type: 'sqlite',
                    engine: 'sqlite',
                    path: '/Users/example/Desktop/Photos.sqlite',
                    database: 'main',
                },
            },
        },
        projection: 'mcp',
    })) as { ok: boolean; data: { connection: { id: string } } };

    assert.equal(output.ok, true);
    assert.equal(output.data.connection.id, 'sqlite-1');
    assert.equal(createdPayloads[0].connection.name, 'Photos.sqlite');
    assert.deepEqual(createdPayloads[0].identities, [
        {
            id: '',
            name: 'Default',
            username: 'sqlite',
            role: null,
            password: null,
            isDefault: true,
            database: 'main',
            enabled: true,
            status: 'active',
        },
    ]);
});

test('dory_write adds a default identity when updating a sqlite connection without identities', async () => {
    type CapturedUpdatePayload = {
        connection: { name?: string; type?: string; engine?: string; path?: string; database?: string };
        identities: Array<{
            id?: string;
            name?: string;
            username?: string;
            role?: string | null;
            password?: string | null;
            isDefault?: boolean;
            database?: string | null;
            enabled?: boolean;
            status?: string | null;
        }>;
    };

    const updatedPayloads: CapturedUpdatePayload[] = [];
    const ctx = createContext(
        {
            db: {
                connections: {
                    update: async (_organizationId: string, connectionId: string, payload: CapturedUpdatePayload) => {
                        updatedPayloads.push(payload);
                        return { connection: { id: connectionId, name: payload.connection.name } };
                    },
                },
                syncOperations: {
                    enqueue: async () => {},
                },
            },
        } as unknown as WebActionServices,
        ['connections:write'],
        {
            access: {
                isMember: true,
                role: 'owner',
                permissions: getOrganizationPermissionMap('owner'),
            },
        },
    );

    const output = (await getTool('dory_write').execute(ctx, {
        operation: 'run',
        actionId: 'connection.update',
        input: {
            id: 'sqlite-1',
            patch: {
                connection: {
                    name: 'Photos.sqlite',
                    type: 'sqlite',
                    engine: 'sqlite',
                    path: '/Users/example/Desktop/Photos.sqlite',
                    database: 'main',
                },
            },
        },
        projection: 'mcp',
    })) as { ok: boolean; data: { connection: { id: string } } };

    assert.equal(output.ok, true);
    assert.equal(output.data.connection.id, 'sqlite-1');
    assert.equal(updatedPayloads[0].connection.type, 'sqlite');
    assert.deepEqual(updatedPayloads[0].identities, [
        {
            id: '',
            name: 'Default',
            username: 'sqlite',
            role: null,
            password: null,
            isDefault: true,
            database: 'main',
            enabled: true,
            status: 'active',
        },
    ]);
});

test('dory_write passes identity-only connection.update patches through for repository upsert handling', async () => {
    type CapturedUpdatePayload = {
        connection: Record<string, never>;
        identities: Array<{
            id?: string;
            name?: string;
            username?: string;
            password?: string | null;
            isDefault?: boolean;
            database?: string | null;
            enabled?: boolean;
        }>;
    };

    const updatedPayloads: CapturedUpdatePayload[] = [];
    const ctx = createContext(
        {
            db: {
                connections: {
                    update: async (_organizationId: string, connectionId: string, payload: CapturedUpdatePayload) => {
                        updatedPayloads.push(payload);
                        return { connection: { id: connectionId, name: 'Photos.sqlite' } };
                    },
                },
                syncOperations: {
                    enqueue: async () => {},
                },
            },
        } as unknown as WebActionServices,
        ['connections:write'],
        {
            access: {
                isMember: true,
                role: 'owner',
                permissions: getOrganizationPermissionMap('owner'),
            },
        },
    );

    const output = (await getTool('dory_write').execute(ctx, {
        operation: 'run',
        actionId: 'connection.update',
        input: {
            id: 'sqlite-1',
            patch: {
                identities: [
                    {
                        name: 'Default',
                        username: 'sqlite',
                        password: null,
                        isDefault: true,
                        database: 'main',
                        enabled: true,
                    },
                ],
            },
        },
        projection: 'mcp',
    })) as { ok: boolean; data: { connection: { id: string } } };

    assert.equal(output.ok, true);
    assert.equal(output.data.connection.id, 'sqlite-1');
    assert.deepEqual(updatedPayloads[0].connection, {});
    assert.equal('ssh' in updatedPayloads[0], false);
    assert.equal('tls' in updatedPayloads[0], false);
    assert.equal(updatedPayloads[0].identities[0].id, undefined);
    assert.equal(updatedPayloads[0].identities[0].username, 'sqlite');
});

test('dory_write runs connection.delete without work context and with MCP-client approval', async () => {
    const deletedIds: string[] = [];
    const syncPayloads: any[] = [];
    const ctx = createContext(
        {
            db: {
                connections: {
                    delete: async (_organizationId: string, id: string) => {
                        deletedIds.push(id);
                    },
                },
                syncOperations: {
                    enqueue: async (payload: any) => {
                        syncPayloads.push(payload);
                    },
                },
            },
        } as unknown as WebActionServices,
        ['write'],
        {
            access: {
                isMember: true,
                role: 'owner',
                permissions: getOrganizationPermissionMap('owner'),
            },
        },
    );

    const output = (await getTool('dory_write').execute(ctx, {
        operation: 'run',
        actionId: 'connection.delete',
        input: { id: 'conn-1' },
        projection: 'mcp',
    })) as any;

    assert.equal(output.ok, true);
    assert.equal(output.actionId, 'connection.delete');
    assert.deepEqual(output.data.deleted, ['conn-1']);
    assert.deepEqual(deletedIds, ['conn-1']);
    assert.equal(syncPayloads[0].operation, 'delete');
});

test('dory_write run preserves action scope errors', async () => {
    const ctx = createContext(
        {
            db: {
                connections: {
                    create: async () => ({ connection: { id: 'conn-1' } }),
                },
                syncOperations: {
                    enqueue: async () => {},
                },
            },
        } as unknown as WebActionServices,
        ['connections:read'],
        {
            access: {
                isMember: true,
                role: 'owner',
                permissions: getOrganizationPermissionMap('owner'),
            },
        },
    );

    await assertRejectsCode(
        () =>
            getTool('dory_write').execute(ctx, {
                operation: 'run',
                actionId: 'connection.create',
                input: { payload: { name: 'No scope' } },
            }),
        'ACTION_SCOPE_MISSING',
    );
});

test('dory_create_work returns a workspace URL', async () => {
    const ctx = createContext({
        db: {
            works: createWorksMock(),
        },
    } as unknown as WebActionServices);

    const output = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', externalSessionId: 'session-1', title: 'Revenue check' })) as any;

    assert.equal(output.workId, 'work-1');
    assert.equal(output.title, 'Revenue check');
    assert.equal(output.workspaceUrl, 'https://dory.test/org-1/agent-runs/work-1/workspace/conn-1');
    assert.equal(output.work.workId, 'work-1');
});

test('dory_create_work uses workspace origin before auth request origin', async () => {
    const ctx = createContext({
        db: {
            works: createWorksMock(),
        },
        requestOrigin: 'https://app.getdory.dev',
        workspaceOrigin: 'http://localhost:3000',
    } as unknown as WebActionServices);

    const output = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', title: 'Local workspace' })) as any;

    assert.equal(output.workspaceUrl, 'http://localhost:3000/org-1/agent-runs/work-1/workspace/conn-1');
});

test('dory_create_work returns a desktop deep link in desktop runtime', async () => {
    await withDesktopProtocolEnv({ DORY_PROTOCOL_SCHEME: undefined, DORY_DISTRIBUTION: undefined }, async () => {
        const ctx = createContext(
            {
                db: {
                    works: createWorksMock(),
                },
                requestOrigin: 'https://app.getdory.dev',
                workspaceOrigin: 'http://127.0.0.1:49415',
            } as unknown as WebActionServices,
            undefined,
            { runtime: 'desktop' },
        );

        const output = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', title: 'Desktop workspace' })) as any;

        assertDesktopWorkspaceUrl(output.workspaceUrl, 'dory', '/org-1/agent-runs/work-1/workspace/conn-1');
    });
});

test('dory_create_work returns a beta desktop deep link when configured', async () => {
    await withDesktopProtocolEnv({ DORY_PROTOCOL_SCHEME: undefined, DORY_DISTRIBUTION: 'beta' }, async () => {
        const ctx = createContext(
            {
                db: {
                    works: createWorksMock(),
                },
            } as unknown as WebActionServices,
            undefined,
            { runtime: 'desktop' },
        );

        const output = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', title: 'Beta workspace' })) as any;

        assertDesktopWorkspaceUrl(output.workspaceUrl, 'dory-beta', '/org-1/agent-runs/work-1/workspace/conn-1');
    });
});

test('dory_create_work respects explicit desktop protocol override', async () => {
    await withDesktopProtocolEnv({ DORY_PROTOCOL_SCHEME: 'dory-dev', DORY_DISTRIBUTION: 'beta' }, async () => {
        const ctx = createContext(
            {
                db: {
                    works: createWorksMock(),
                },
            } as unknown as WebActionServices,
            undefined,
            { runtime: 'desktop' },
        );

        const output = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', title: 'Dev workspace' })) as any;

        assertDesktopWorkspaceUrl(output.workspaceUrl, 'dory-dev', '/org-1/agent-runs/work-1/workspace/conn-1');
    });
});

test('dory_create_work derives a short Agent Run title from the user question', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);

    const output = (await getTool('dory_create_work').execute(ctx, { question: '使用 dory 查询 play 数据库，分析 Hacker News 最热帖子的特性' })) as any;

    assert.equal(output.title, 'Hacker News 最热帖子的特性');
    assert.equal(works.works.get(output.workId)?.title, 'Hacker News 最热帖子的特性');
});

test('dory_create_work is idempotent for an external session', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);

    const first = (await getTool('dory_create_work').execute(ctx, { externalSessionId: 'session-1', title: 'Revenue check' })) as any;
    const second = (await getTool('dory_create_work').execute(ctx, { externalSessionId: 'session-1', connectionId: 'conn-1', title: 'Revenue check again' })) as any;

    assert.equal(first.workId, 'work-1');
    assert.equal(second.workId, 'work-1');
    assert.equal(second.connectionId, 'conn-1');
    assert.equal(works.works.size, 1);
});

test('dory_create_work can fill a default title when reusing an external session', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);

    const first = (await getTool('dory_create_work').execute(ctx, { externalSessionId: 'session-1' })) as any;
    const second = (await getTool('dory_create_work').execute(ctx, { externalSessionId: 'session-1', userQuestion: 'Show order volume by day' })) as any;

    assert.equal(first.workId, 'work-1');
    assert.equal(second.workId, 'work-1');
    assert.equal(second.title, 'Show order volume by day');
    assert.equal(works.works.get(second.workId)?.title, 'Show order volume by day');
});

test('dory_finish_work persists agent summary metadata and status', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);

    const work = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', title: 'Analyze HN hot posts' })) as any;
    const output = (await getTool('dory_finish_work').execute(ctx, {
        workId: work.workId,
        status: 'completed',
        summaryTitle: 'HN hot posts analysis',
        findings: ['Story scores are concentrated in the middle of the sampled range.'],
        steps: ['Queried story score distribution', 'Created editable SQL tabs'],
    })) as any;

    assert.equal(output.status, 'completed');
    assert.equal(output.workspaceUrl, 'https://dory.test/org-1/agent-runs/work-1/workspace/conn-1');
    assert.deepEqual(output.findings, ['Story scores are concentrated in the middle of the sampled range.']);
    assert.deepEqual(output.steps, ['Queried story score distribution', 'Created editable SQL tabs']);
    assert.deepEqual(works.works.get(work.workId)?.metadata?.agentRunSummary, {
        summaryTitle: 'HN hot posts analysis',
        findings: ['Story scores are concentrated in the middle of the sampled range.'],
        steps: ['Queried story score distribution', 'Created editable SQL tabs'],
        sections: [
            {
                summaryTitle: 'HN hot posts analysis',
                findings: ['Story scores are concentrated in the middle of the sampled range.'],
                steps: ['Queried story score distribution', 'Created editable SQL tabs'],
                finishedAt: '2026-06-01T00:00:00.000Z',
            },
        ],
        updatedAt: '2026-06-01T00:00:00.000Z',
    });
    assert.equal(works.works.get(work.workId)?.status, 'completed');
    assert.equal(works.events.at(-1)?.toolName, 'dory_finish_work');
    assert.equal(works.events.at(-1)?.status, 'success');
});

test('dory_finish_work appends continuation findings and steps without replacing existing summary', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);

    const work = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', title: 'Analyze orders' })) as any;
    await getTool('dory_finish_work').execute(ctx, {
        workId: work.workId,
        status: 'completed',
        summaryTitle: 'Initial order analysis',
        findings: ['Pending orders are the largest status group.'],
        steps: ['Created order status tab', 'Ran baseline distribution query'],
    });
    const output = (await getTool('dory_finish_work').execute(ctx, {
        workId: work.workId,
        status: 'completed',
        findings: ['One-year order status distribution matches the baseline pattern.'],
        steps: ['Continued from human-edited workspace', 'Added one-year comparison tab'],
    })) as any;

    assert.deepEqual(output.findings, ['Pending orders are the largest status group.', 'One-year order status distribution matches the baseline pattern.']);
    assert.deepEqual(output.steps, ['Created order status tab', 'Ran baseline distribution query', 'Continued from human-edited workspace', 'Added one-year comparison tab']);
    assert.deepEqual(works.works.get(work.workId)?.metadata?.agentRunSummary, {
        summaryTitle: 'Initial order analysis',
        findings: ['Pending orders are the largest status group.', 'One-year order status distribution matches the baseline pattern.'],
        steps: ['Created order status tab', 'Ran baseline distribution query', 'Continued from human-edited workspace', 'Added one-year comparison tab'],
        sections: [
            {
                summaryTitle: 'Initial order analysis',
                findings: ['Pending orders are the largest status group.'],
                steps: ['Created order status tab', 'Ran baseline distribution query'],
                finishedAt: '2026-06-01T00:00:00.000Z',
            },
            {
                summaryTitle: null,
                findings: ['One-year order status distribution matches the baseline pattern.'],
                steps: ['Continued from human-edited workspace', 'Added one-year comparison tab'],
                finishedAt: '2026-06-01T00:00:00.000Z',
            },
        ],
        updatedAt: '2026-06-01T00:00:00.000Z',
    });
});

test('dory_finish_work rejects work owned by another user', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
        },
    } as unknown as WebActionServices);
    const work = (await getTool('dory_create_work').execute(ctx, { title: 'Owned run' })) as any;
    const otherCtx = {
        ...ctx,
        userId: 'user-2',
    } as ActionContext<WebActionServices>;

    await assertRejectsCode(
        () =>
            getTool('dory_finish_work').execute(otherCtx, {
                workId: work.workId,
                status: 'completed',
                findings: ['Should not write'],
                steps: ['Attempted unauthorized finish'],
            }),
        'WORK_NOT_FOUND',
    );
});

test('ordinary MCP facade tools require an existing work context', async () => {
    const ctx = createContext({
        db: {
            works: createWorksMock(),
            connections: {
                list: async () => [],
            },
        },
    } as unknown as WebActionServices);

    await assertRejectsCode(() => getTool('dory_list_connections').execute(ctx, { includeRecent: true }), 'MISSING_WORK_CONTEXT');
});

test('strict MCP output schemas accept structured error envelopes', () => {
    const readonlyTool = getTool('dory_run_readonly_sql');
    const errorEnvelope = structuredMcpFacadeError(new Error('boom')).structuredContent;

    assert.equal(readonlyTool.outputSchema.safeParse(errorEnvelope).success, true);
});

test('registered MCP schema does not require SQL success fields for error outputs', async () => {
    const server = new McpServer({ name: 'dory-test', version: '1.0.0' });
    registerDoryMcpTools(server, {
        organizationId: 'org-1',
        userId: 'user-1',
        tokenId: 'token-1',
        scopes: ['query:read'],
        access: {
            source: 'local',
            organizationId: 'org-1',
            userId: 'user-1',
            isMember: true,
            role: 'member',
            permissions: getOrganizationPermissionMap('member'),
            organization: {
                id: 'org-1',
                slug: 'org-1',
                name: 'Org 1',
            },
        },
        requestOrigin: 'https://dory.test',
    });

    const client = new Client({ name: 'dory-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        const tools = await client.listTools();
        const readonlyTool = tools.tools.find(tool => tool.name === 'dory_run_readonly_sql');
        assert.ok(readonlyTool?.outputSchema);

        const required = Array.isArray(readonlyTool.outputSchema.required) ? readonlyTool.outputSchema.required : [];
        assert.equal(required.includes('result'), false);
        assert.equal(required.includes('columns'), false);
        assert.equal(required.includes('rowCount'), false);
        assert.ok((readonlyTool.outputSchema.properties as any)?.error, 'Expected error envelope in SQL output schema.');
    } finally {
        await client.close().catch(() => undefined);
        await server.close().catch(() => undefined);
    }
});

test('dory_list_connections returns agent-oriented connection context', async () => {
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
            connections: {
                list: async () => [
                    {
                        connection: {
                            id: 'conn-1',
                            name: 'Warehouse',
                            type: 'postgres',
                            database: 'analytics',
                            environment: 'prod',
                            updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                        },
                        identities: [
                            {
                                id: 'identity-1',
                                isDefault: true,
                                database: 'analytics_ro',
                            },
                        ],
                    },
                ],
            },
        },
    } as unknown as WebActionServices);

    const work = (await getTool('dory_create_work').execute(ctx, { title: 'Connection discovery' })) as any;
    const output = (await getTool('dory_list_connections').execute(ctx, { includeRecent: true, workId: work.workId })) as any;

    assert.equal(output.work.workId, 'work-1');
    assert.equal(output.workspaceUrl, 'https://dory.test/org-1/agent-runs/work-1');
    assert.deepEqual(output.connections, [
        {
            connectionId: 'conn-1',
            name: 'Warehouse',
            type: 'postgres',
            environment: 'prod',
            defaultDatabase: 'analytics',
            lastUsedAt: null,
            permissionsSummary: 'read-only SQL, schema exploration, workspace tabs, and saved queries according to granted scopes',
        },
    ]);
});

test('dory_workspace_tabs manages SQL and table workspace tabs through internal actions', async () => {
    const savedTabs = new Map<string, any>();
    savedTabs.set('tab-1', {
        tabId: 'tab-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        workId: 'work-1',
        tabType: 'sql',
        tabName: 'Existing',
        content: 'select 1',
        orderIndex: 0,
        createdAt: '2026-06-01T00:00:00.000Z',
    });
    const deleted: string[] = [];
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
            tabState: {
                loadAllTab: async (_userId: string, _connectionId: string, workId?: string | null) =>
                    [...savedTabs.values()].filter(tab => (tab.workId ?? null) === (workId ?? null)),
                loadTabStateById: async (tabId: string) => savedTabs.get(tabId) ?? null,
                saveTabState: async (payload: any) => {
                    savedTabs.set(payload.tabId, {
                        tabId: payload.tabId,
                        userId: payload.userId,
                        connectionId: payload.connectionId,
                        workId: payload.workId ?? null,
                        ...payload.state,
                        resultMeta: payload.resultMeta ?? null,
                    });
                },
                updateTabName: async ({ tabId, newName }: any) => {
                    savedTabs.set(tabId, {
                        ...savedTabs.get(tabId),
                        tabName: newName,
                    });
                },
                deleteTabState: async (tabId: string) => {
                    deleted.push(tabId);
                    savedTabs.delete(tabId);
                },
            },
        },
    } as unknown as WebActionServices);
    const tool = getTool('dory_workspace_tabs');
    const work = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', externalSessionId: 'session-1', title: 'Workspace tabs' })) as any;

    const listed = (await tool.execute(ctx, { operation: 'list', connectionId: 'conn-1', workId: work.workId })) as any;
    assert.equal(listed.tabs.length, 1);
    assert.equal(listed.work.workId, 'work-1');

    const created = (await tool.execute(ctx, {
        operation: 'create_sql',
        connectionId: 'conn-1',
        workId: work.workId,
        sql: 'select 2',
        tabName: 'Created',
    })) as any;
    assert.equal(savedTabs.get(created.tabId).content, 'select 2');
    assert.equal(created.work.workId, 'work-1');
    assert.equal(savedTabs.get(created.tabId).workId, 'work-1');

    const appended = (await tool.execute(ctx, {
        operation: 'append_sql',
        connectionId: 'conn-1',
        workId: work.workId,
        tabId: 'tab-1',
        sql: 'select 3',
        appendSeparator: '\n-- next\n',
    })) as any;
    assert.deepEqual(appended.workspaceAction, {
        mode: 'append_to_tab',
        tabId: 'tab-1',
        tabName: 'Existing',
        status: 'updated',
    });
    assert.equal(savedTabs.get('tab-1').content, 'select 1;\n-- next\nselect 3;');

    await tool.execute(ctx, {
        operation: 'replace_sql',
        connectionId: 'conn-1',
        workId: work.workId,
        tabId: 'tab-1',
        sql: 'select 4',
        tabName: 'Replaced',
    });
    assert.equal(savedTabs.get('tab-1').content, 'select 4;');
    assert.equal(savedTabs.get('tab-1').tabName, 'Replaced');

    const tableTab = (await tool.execute(ctx, {
        operation: 'open_table',
        connectionId: 'conn-1',
        workId: work.workId,
        databaseName: 'analytics',
        tableName: 'orders',
    })) as any;
    assert.equal(savedTabs.get(tableTab.tabId).tabType, 'table');
    assert.equal(savedTabs.get(tableTab.tabId).tableName, 'orders');

    await tool.execute(ctx, {
        operation: 'delete',
        connectionId: 'conn-1',
        workId: work.workId,
        tabId: 'tab-1',
    });
    assert.deepEqual(deleted, ['tab-1']);
});

test('dory_workspace_tabs reports tab work mismatches clearly', async () => {
    const savedTabs = new Map<string, any>();
    savedTabs.set('tab-other', {
        tabId: 'tab-other',
        userId: 'user-1',
        connectionId: 'conn-1',
        workId: 'work-other',
        tabType: 'sql',
        tabName: 'Other work',
        content: 'select 1',
    });
    const works = createWorksMock();
    const ctx = createContext({
        db: {
            works,
            tabState: {
                loadAllTab: async (_userId: string, _connectionId: string, workId?: string | null) =>
                    [...savedTabs.values()].filter(tab => (tab.workId ?? null) === (workId ?? null)),
                loadTabStateById: async (tabId: string) => savedTabs.get(tabId) ?? null,
                saveTabState: async () => {},
            },
        },
    } as unknown as WebActionServices);
    const work = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', title: 'Current work' })) as any;

    await assertRejectsCode(
        () =>
            getTool('dory_workspace_tabs').execute(ctx, {
                operation: 'append_sql',
                connectionId: 'conn-1',
                workId: work.workId,
                tabId: 'tab-other',
                sql: 'select 2',
            }),
        'SQL_TAB_WORK_MISMATCH',
    );
});

test('dory_saved_queries dispatches v1 operations and preserves write scope checks', async () => {
    const calls: Array<{ method: string; payload: any }> = [];
    const works = createWorksMock();
    const services = {
        db: {
            savedQueries: {
                list: async (payload: any) => {
                    calls.push({ method: 'list', payload });
                    return [{ id: 'query-1', title: 'Revenue', sqlText: 'select 1' }];
                },
                getById: async (payload: any) => {
                    calls.push({ method: 'getById', payload });
                    return { id: payload.id, title: 'Revenue', sqlText: 'select 1' };
                },
                create: async (payload: any) => {
                    calls.push({ method: 'create', payload });
                    return { id: 'query-2', ...payload };
                },
                update: async (payload: any) => {
                    calls.push({ method: 'update', payload });
                    return { id: payload.id, ...payload.patch };
                },
                delete: async (payload: any) => {
                    calls.push({ method: 'delete', payload });
                },
            },
            works,
        },
    } as unknown as WebActionServices;
    const ctx = createContext(services);
    const tool = getTool('dory_saved_queries');
    const work = (await getTool('dory_create_work').execute(ctx, { connectionId: 'conn-1', externalSessionId: 'session-1', title: 'Saved queries' })) as any;

    assert.equal(((await tool.execute(ctx, { operation: 'list', connectionId: 'conn-1', workId: work.workId })) as any).savedQueries.length, 1);
    assert.equal(((await tool.execute(ctx, { operation: 'get', connectionId: 'conn-1', workId: work.workId, id: 'query-1' })) as any).savedQuery.id, 'query-1');
    await tool.execute(ctx, { operation: 'create', connectionId: 'conn-1', workId: work.workId, title: 'New', sqlText: 'select 2' });
    await tool.execute(ctx, { operation: 'update', connectionId: 'conn-1', workId: work.workId, id: 'query-1', title: 'Updated' });
    const deleted = (await tool.execute(ctx, { operation: 'delete', connectionId: 'conn-1', workId: work.workId, id: 'query-1' })) as any;
    assert.deepEqual(deleted.deleted, ['query-1']);
    assert.equal(deleted.work.workId, 'work-1');
    assert.deepEqual(
        calls.map(call => call.method),
        ['list', 'getById', 'create', 'update', 'delete'],
    );
    assert.equal(calls[2]?.payload.title, 'New');
    assert.deepEqual(calls[3]?.payload.patch, { title: 'Updated' });

    const readOnlyCtx = createContext(services, ['connections:read', 'saved_queries:read']);
    await assert.rejects(
        () =>
            tool.execute(readOnlyCtx, {
                operation: 'create',
                connectionId: 'conn-1',
                workId: work.workId,
                title: 'Denied',
                sqlText: 'select 1',
            }),
        /Missing action scope "saved_queries:write"/,
    );
});
