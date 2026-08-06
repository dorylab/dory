import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    buildLocalDatabasePath,
    normalizeLocalDatabaseFileName,
    validateLocalDatabaseFileName,
} from '@/app/(app)/[organization]/connections/components/forms/connection/drivers/local-database';
import { normalizeDuckDbConnectionForSubmit } from '@/app/(app)/[organization]/connections/components/forms/connection/drivers/duckdb';
import { normalizeSqliteConnectionForSubmit } from '@/app/(app)/[organization]/connections/components/forms/connection/drivers/sqlite';
import { ConnectionDialogFormSchema } from '@/app/(app)/[organization]/connections/form-schema';
import { connectionCreateAction } from '@/lib/actions/server/domains/connection/create';
import { normalizeConnectionUpdatePatch } from '@/lib/actions/server/domains/connection/payload';
import { prepareLocalDatabaseCreation, resolveLocalDatabaseCreationPath } from '@/lib/connection/local-database-creation';

test('normalizes and validates local database file names', () => {
    assert.equal(normalizeLocalDatabaseFileName('sqlite', 'demo'), 'demo.sqlite');
    assert.equal(normalizeLocalDatabaseFileName('duckdb', 'demo'), 'demo.duckdb');
    assert.equal(normalizeLocalDatabaseFileName('sqlite', 'demo.db'), 'demo.db');
    assert.equal(buildLocalDatabasePath('duckdb', '~/Dory/databases/', 'analytics'), '~/Dory/databases/analytics.duckdb');
    assert.equal(validateLocalDatabaseFileName('sqlite', '../demo.sqlite'), 'invalid');
    assert.equal(validateLocalDatabaseFileName('duckdb', 'demo.sqlite'), 'extension');
});

test('form validation accepts new local databases without an existing path and normalizes their target paths', () => {
    const baseForm = {
        identity: {},
        ssh: {},
        tls: null,
    };
    const sqliteConnection = {
        type: 'sqlite',
        name: 'New SQLite',
        ssl: false,
        localDatabaseSource: 'new',
        localDatabaseFileName: 'customers',
        localDatabaseDirectory: '~/Dory/databases',
    };
    const duckDbConnection = {
        type: 'duckdb',
        name: 'New DuckDB',
        ssl: false,
        duckdbMode: 'local',
        localDatabaseSource: 'new',
        localDatabaseFileName: 'analytics',
        localDatabaseDirectory: '/var/lib/dory',
    };

    assert.equal(ConnectionDialogFormSchema.safeParse({ ...baseForm, connection: sqliteConnection }).success, true);
    assert.equal(ConnectionDialogFormSchema.safeParse({ ...baseForm, connection: duckDbConnection }).success, true);
    assert.equal(normalizeSqliteConnectionForSubmit(sqliteConnection).path, '~/Dory/databases/customers.sqlite');
    assert.equal(normalizeDuckDbConnectionForSubmit(duckDbConnection).path, '/var/lib/dory/analytics.duckdb');
});

test('form validation rejects invalid new database names and relative locations', () => {
    const result = ConnectionDialogFormSchema.safeParse({
        connection: {
            type: 'duckdb',
            name: 'Invalid DuckDB',
            ssl: false,
            duckdbMode: 'local',
            localDatabaseSource: 'new',
            localDatabaseFileName: '../analytics.sqlite',
            localDatabaseDirectory: 'relative/path',
        },
        identity: {},
        ssh: {},
        tls: null,
    });

    assert.equal(result.success, false);
    if (!result.success) {
        const paths = result.error.issues.map(issue => issue.path.join('.'));
        assert.ok(paths.includes('connection.localDatabaseFileName'));
        assert.ok(paths.includes('connection.localDatabaseDirectory'));
    }
});

test('expands a leading home directory marker', () => {
    assert.equal(resolveLocalDatabaseCreationPath('~/Dory/databases/demo.sqlite'), path.join(os.homedir(), 'Dory', 'databases', 'demo.sqlite'));
});

test('creates parent directories, returns an absolute stored path, and cleans up its own file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-local-database-service-'));
    const filePath = path.join(directory, 'nested', 'demo.sqlite');
    try {
        const prepared = await prepareLocalDatabaseCreation({ type: 'sqlite', path: filePath });
        assert.equal(prepared.connection.path, filePath);
        await access(filePath);
        await prepared.cleanup();
        await assert.rejects(access(filePath));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('refuses to overwrite an existing database file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-local-database-collision-'));
    const filePath = path.join(directory, 'demo.db');
    try {
        await writeFile(filePath, 'keep me');
        await assert.rejects(prepareLocalDatabaseCreation({ type: 'duckdb', path: filePath }), /already exists/);
        assert.equal(await readFile(filePath, 'utf8'), 'keep me');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('rejects unsupported connection modes and extensions', async () => {
    await assert.rejects(prepareLocalDatabaseCreation({ type: 'postgres', path: '/tmp/demo.db' }), /only supported/);
    await assert.rejects(prepareLocalDatabaseCreation({ type: 'duckdb', path: '/tmp/demo.duckdb', options: JSON.stringify({ mode: 'motherduck' }) }), /MotherDuck/);
    await assert.rejects(prepareLocalDatabaseCreation({ type: 'sqlite', path: '/tmp/demo.duckdb' }), /SQLite file name/);
});

function actionContext(
    actorType: 'automation' | 'mcp' | 'user',
    create: (payload: Record<string, unknown>) => Promise<unknown>,
    enqueue: (input: Record<string, unknown>) => Promise<unknown> = async () => undefined,
) {
    return {
        organizationId: 'org-1',
        userId: 'user-1',
        actor: { type: actorType, scopes: ['connections:write'] },
        access: { isMember: true, permissions: {} },
        services: {
            db: {
                connections: { create: (_userId: string, _organizationId: string, payload: Record<string, unknown>) => create(payload) },
                syncOperations: { enqueue },
            },
        },
    } as any;
}

test('connection create stores the resolved path without persisting the one-time creation intent', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-local-database-action-'));
    const filePath = path.join(directory, 'demo.sqlite');
    let persistedPayload: Record<string, any> | null = null;
    let syncedPayload: Record<string, any> | null = null;
    try {
        const result = await connectionCreateAction.handler(
            actionContext(
                'user',
                async payload => {
                    persistedPayload = payload;
                    return { connection: { id: 'connection-1', ...(payload.connection as object) }, identities: [], ssh: null };
                },
                async input => {
                    syncedPayload = input as Record<string, any>;
                },
            ),
            {
                payload: {
                    connection: { type: 'sqlite', name: 'New SQLite', path: filePath },
                    identities: [],
                    ssh: null,
                    tls: null,
                    createLocalDatabase: true,
                },
            },
        );

        assert.equal((result as any).connection.path, filePath);
        assert.equal((persistedPayload as any).createLocalDatabase, undefined);
        assert.equal((persistedPayload as any).connection.path, filePath);
        assert.equal((syncedPayload as any).payload.createLocalDatabase, undefined);
        await access(filePath);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('connection create removes its database file when persistence fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-local-database-action-cleanup-'));
    const filePath = path.join(directory, 'demo.duckdb');
    try {
        await assert.rejects(
            async () =>
                connectionCreateAction.handler(
                    actionContext('user', async () => {
                        throw new Error('persistence failed');
                    }),
                    {
                        payload: {
                            connection: { type: 'duckdb', name: 'New DuckDB', path: filePath, options: JSON.stringify({ mode: 'local' }) },
                            identities: [],
                            ssh: null,
                            tls: null,
                            createLocalDatabase: true,
                        },
                    },
                ),
            /persistence failed/,
        );
        await assert.rejects(access(filePath));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('connection create rejects filesystem creation for non-user actors', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-local-database-action-actor-'));
    const filePath = path.join(directory, 'demo.sqlite');
    try {
        await assert.rejects(
            async () =>
                connectionCreateAction.handler(
                    actionContext('mcp', async () => assert.fail('persistence must not run')),
                    {
                        payload: {
                            connection: { type: 'sqlite', name: 'Blocked', path: filePath },
                            identities: [],
                            ssh: null,
                            tls: null,
                            createLocalDatabase: true,
                        },
                    },
                ),
            /interactive user/,
        );
        await assert.rejects(access(filePath));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('connection updates discard the create-only intent', () => {
    const patch = normalizeConnectionUpdatePatch({
        connection: { type: 'sqlite', path: '/tmp/demo.sqlite' },
        createLocalDatabase: true,
    });

    assert.equal(patch.createLocalDatabase, undefined);
});
