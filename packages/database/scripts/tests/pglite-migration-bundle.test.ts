import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readMigrationFiles } from 'drizzle-orm/migrator';

import { migratePgliteDB } from '../../src/pglite/migrate-pglite';
import migrations from '../../src/pglite/migrations.json';
import { getPgliteClient, resetPgliteClient } from '../../src/postgres/client/pglite';
import { PostgresArtifactsRepository } from '../../src/postgres/impl/artifacts';
import { artifacts, reportWorkingDrafts, workDocuments } from '../../src/postgres/schemas';

const migrationsFolder = new URL('../../src/pglite/migrations', import.meta.url).pathname;

test('the startup migration bundle includes every journaled SQL migration', () => {
    assert.deepEqual(migrations, readMigrationFiles({ migrationsFolder }), 'Run yarn workspace web pglite:migrate:bundle after changing migrations.');
});

test('the real PGlite startup upgrades an existing workspace without losing reports, drafts or artifacts', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-bundle-upgrade-'));
    const previousPath = process.env.PGLITE_DB_PATH;
    const dataDir = path.join(directory, 'database');
    process.env.PGLITE_DB_PATH = dataDir;
    const legacy = new PGlite(dataDir);
    let legacyClosed = false;
    try {
        const upgradeIndex = migrations.findIndex(migration => migration.sql.some(statement => statement.includes('ADD COLUMN "visibility"')));
        assert.ok(upgradeIndex > 0);
        await legacy.exec('CREATE SCHEMA drizzle; CREATE TABLE drizzle.drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint);');
        for (const migration of migrations.slice(0, upgradeIndex)) {
            await legacy.exec(migration.sql.join('\n'));
            await legacy.query('INSERT INTO drizzle.drizzle_migrations (hash, created_at) VALUES ($1, $2)', [migration.hash, migration.folderMillis]);
        }
        await legacy.exec(`
            INSERT INTO work_documents (id, organization_id, user_id, creation_key, title, scope, content)
            VALUES ('report', 'org', 'owner', 'legacy', 'Original report', '{}', '{"markdown":"Original content"}');
            INSERT INTO report_working_drafts (document_id, organization_id, user_id, base_revision, expected_report_revision, state)
            VALUES ('report', 'org', 'owner', 1, 1, '{"tabs":[{"sql":"select 42"}]}');
            INSERT INTO artifacts (id, organization_id, type, title, resource_id, created_by_actor_type)
            VALUES ('artifact', 'org', 'result_set', 'Original result', 'result', 'user');
        `);
        await legacy.close();
        legacyClosed = true;

        await migratePgliteDB();
        const db = await getPgliteClient();
        const catalog = new PostgresArtifactsRepository();
        await catalog.init(db);
        assert.equal((await catalog.get({ organizationId: 'org', userId: 'owner', artifactId: 'artifact' })).title, 'Original result');
        const [before] = await db.select().from(reportWorkingDrafts).limit(1);
        assert.ok(before?.id.startsWith('draft_'));
        assert.deepEqual(before.state, { tabs: [{ sql: 'select 42' }] });
        assert.equal((await db.select().from(workDocuments).limit(1))[0]?.title, 'Original report');
        assert.equal((await db.select().from(artifacts).limit(1))[0]?.visibility, 'catalog');
        await migratePgliteDB();
        assert.equal((await db.select().from(reportWorkingDrafts).limit(1))[0]?.id, before.id, 'restarting does not recreate the draft');
    } finally {
        if (!legacyClosed) await legacy.close();
        await resetPgliteClient();
        if (previousPath === undefined) delete process.env.PGLITE_DB_PATH;
        else process.env.PGLITE_DB_PATH = previousPath;
        await rm(directory, { recursive: true, force: true });
    }
});
