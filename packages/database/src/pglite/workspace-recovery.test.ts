import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { PostgresDBClient } from '@dory/shared';
import * as schema from '../postgres/schemas';
import { exportWorkspaceRecoverySnapshot, importWorkspaceRecoverySnapshot, repairMissingFileConnectionPathsFromArchives } from './workspace-recovery';

type TestDb = {
    client: PGlite;
    db: PostgresDBClient;
};

const CREATE_CONNECTIONS_TABLE_SQL = `
CREATE TABLE connections (
    id text PRIMARY KEY,
    created_by_user_id text,
    organization_id text NOT NULL,
    source text,
    cloud_id text,
    sync_status text,
    last_synced_at timestamptz,
    remote_updated_at timestamptz,
    sync_error text,
    type text NOT NULL,
    engine text NOT NULL,
    name text NOT NULL,
    description text,
    host text,
    port integer,
    http_port integer,
    database text,
    path text,
    options text NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'ready',
    config_version integer,
    validation_errors text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    last_used_at timestamptz,
    last_check_status text,
    last_check_at timestamptz,
    last_check_latency_ms integer,
    last_check_error text,
    environment text,
    tags text
);
`;

async function withTempDir<T>(fn: (dir: string) => Promise<T>) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dory-pglite-recovery-'));
    try {
        return await fn(dir);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
}

async function createRawConnectionDb(dataDir: string) {
    const client = new PGlite({ dataDir });
    await client.query(CREATE_CONNECTIONS_TABLE_SQL);
    return client;
}

async function createTargetDb(dataDir: string): Promise<TestDb> {
    const client = await createRawConnectionDb(dataDir);
    const db = drizzle({ client, schema }) as unknown as PostgresDBClient;
    return { client, db };
}

async function insertConnection(
    client: PGlite,
    input: {
        id: string;
        type: string;
        path?: string | null;
        options?: string;
        name?: string;
        deleted?: boolean;
    },
) {
    await client.query(
        `INSERT INTO connections (
            id,
            organization_id,
            type,
            engine,
            name,
            database,
            path,
            options,
            status,
            created_at,
            updated_at,
            deleted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ready', now(), now(), $9)`,
        [
            input.id,
            'org-1',
            input.type,
            input.type,
            input.name ?? input.id,
            input.type === 'sqlite' ? 'main' : null,
            input.path ?? null,
            input.options ?? '{}',
            input.deleted ? new Date().toISOString() : null,
        ],
    );
}

async function readConnectionPath(client: PGlite, id: string) {
    const result = await client.query<{ path: string | null }>('SELECT path FROM connections WHERE id = $1', [id]);
    return result.rows[0]?.path ?? null;
}

test('workspace recovery snapshot and import preserve sqlite connection path', async () => {
    await withTempDir(async dir => {
        const sourceDataDir = path.join(dir, 'source');
        const source = await createRawConnectionDb(sourceDataDir);
        try {
            await insertConnection(source, {
                id: 'sqlite-1',
                type: 'sqlite',
                path: '/Users/example/Desktop/photos.sqlite',
                name: 'Photos',
            });
        } finally {
            await source.close();
        }

        const snapshot = await exportWorkspaceRecoverySnapshot(sourceDataDir, path.join(dir, 'snapshot.json'));
        const connectionsTable = snapshot.tables.find(table => table.key === 'connections');
        assert.equal(connectionsTable?.rows[0]?.path, '/Users/example/Desktop/photos.sqlite');

        const insertedRows: Record<string, unknown>[] = [];
        await importWorkspaceRecoverySnapshot(
            {
                insert: () => ({
                    values: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
                        insertedRows.push(...(Array.isArray(rows) ? rows : [rows]));
                    },
                }),
            } as unknown as PostgresDBClient,
            snapshot,
        );

        assert.equal(insertedRows.find(row => row.id === 'sqlite-1')?.path, '/Users/example/Desktop/photos.sqlite');
    });
});

test('repairs missing sqlite path from the newest archive with a matching connection id', async () => {
    await withTempDir(async dir => {
        const dataDir = path.join(dir, 'database');
        const target = await createTargetDb(dataDir);
        try {
            await insertConnection(target.client, { id: 'sqlite-1', type: 'sqlite', path: null });

            const oldArchive = await createRawConnectionDb(path.join(dir, 'database.broken-20260701-010101'));
            await insertConnection(oldArchive, { id: 'sqlite-1', type: 'sqlite', path: '/old/photos.sqlite' });
            await oldArchive.close();

            const newestArchive = await createRawConnectionDb(path.join(dir, 'database.broken-20260702-010101'));
            await insertConnection(newestArchive, { id: 'sqlite-1', type: 'sqlite', path: '/new/photos.sqlite' });
            await newestArchive.close();

            const result = await repairMissingFileConnectionPathsFromArchives(dataDir, target.db);

            assert.equal(result.repaired, 1);
            assert.equal(await readConnectionPath(target.client, 'sqlite-1'), '/new/photos.sqlite');
        } finally {
            await target.client.close();
        }
    });
});

test('does not overwrite existing file connection path', async () => {
    await withTempDir(async dir => {
        const dataDir = path.join(dir, 'database');
        const target = await createTargetDb(dataDir);
        try {
            await insertConnection(target.client, { id: 'sqlite-1', type: 'sqlite', path: '/current/photos.sqlite' });

            const archive = await createRawConnectionDb(path.join(dir, 'database.broken-20260702-010101'));
            await insertConnection(archive, { id: 'sqlite-1', type: 'sqlite', path: '/archive/photos.sqlite' });
            await archive.close();

            const result = await repairMissingFileConnectionPathsFromArchives(dataDir, target.db);

            assert.equal(result.repaired, 0);
            assert.equal(await readConnectionPath(target.client, 'sqlite-1'), '/current/photos.sqlite');
        } finally {
            await target.client.close();
        }
    });
});

test('repairs only credentialless file-backed connections and skips broken archives', async () => {
    await withTempDir(async dir => {
        const dataDir = path.join(dir, 'database');
        const target = await createTargetDb(dataDir);
        try {
            await insertConnection(target.client, { id: 'sqlite-1', type: 'sqlite', path: null });
            await insertConnection(target.client, { id: 'postgres-1', type: 'postgres', path: null });
            await insertConnection(target.client, { id: 'motherduck-1', type: 'duckdb', path: null, options: '{"mode":"motherduck"}' });

            const brokenArchive = new PGlite({ dataDir: path.join(dir, 'database.broken-20260703-010101') });
            await brokenArchive.close();

            const archive = await createRawConnectionDb(path.join(dir, 'database.broken-20260702-010101'));
            await insertConnection(archive, { id: 'sqlite-1', type: 'sqlite', path: '/archive/photos.sqlite' });
            await insertConnection(archive, { id: 'postgres-1', type: 'postgres', path: '/archive/postgres' });
            await insertConnection(archive, { id: 'motherduck-1', type: 'duckdb', path: '/archive/motherduck.duckdb', options: '{"mode":"motherduck"}' });
            await archive.close();

            const result = await repairMissingFileConnectionPathsFromArchives(dataDir, target.db);

            assert.equal(result.repaired, 1);
            assert.equal(await readConnectionPath(target.client, 'sqlite-1'), '/archive/photos.sqlite');
            assert.equal(await readConnectionPath(target.client, 'postgres-1'), null);
            assert.equal(await readConnectionPath(target.client, 'motherduck-1'), null);
        } finally {
            await target.client.close();
        }
    });
});
