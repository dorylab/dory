import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const postgresMigrationUrl = new URL('../../src/postgres/migrations/0030_knowledge_and_agent_context.sql', import.meta.url);
const pgliteMigrationUrl = new URL('../../src/pglite/migrations/0030_knowledge_and_agent_context.sql', import.meta.url);

async function applyMigration(db: PGlite, url: URL) {
    const migration = await readFile(url, 'utf8');
    for (const statement of migration
        .split('--> statement-breakpoint')
        .map(value => value.trim())
        .filter(Boolean))
        await db.exec(statement);
}

test('Postgres and PGlite consolidated 0030 migrations stay aligned', async () => {
    const [postgresSql, pgliteSql] = await Promise.all([readFile(postgresMigrationUrl, 'utf8'), readFile(pgliteMigrationUrl, 'utf8')]);
    assert.equal(pgliteSql, postgresSql);
    assert.doesNotMatch(postgresSql, /semantic_contexts|semantic_models|work_knowledge_assets|cubes:/);
});

test('consolidated 0030 applies to the main schema and creates only final structures', async () => {
    const db = new PGlite();
    await db.exec(`
        CREATE TABLE connections (id text PRIMARY KEY);
        CREATE TABLE mcp_access_tokens (id text PRIMARY KEY, created_by_user_id text NOT NULL);
        CREATE TABLE works (work_id text PRIMARY KEY, user_id text NOT NULL);
        CREATE TABLE work_events (event_id text PRIMARY KEY, user_id text NOT NULL);
        CREATE TABLE findings (id text PRIMARY KEY, organization_id text NOT NULL, work_id text NOT NULL);
        INSERT INTO mcp_access_tokens (id, created_by_user_id) VALUES ('token-1', 'user-1');
        INSERT INTO works (work_id, user_id) VALUES ('work-1', 'user-1');
        INSERT INTO work_events (event_id, user_id) VALUES ('event-1', 'user-1');
    `);
    await applyMigration(db, pgliteMigrationUrl);

    const tables = await db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
    const tableNames = new Set(tables.rows.map(row => row.table_name));
    for (const name of ['knowledge_models', 'knowledge_sources', 'knowledge_connectors', 'work_agent_assets', 'agent_principals', 'agent_activities'])
        assert.ok(tableNames.has(name), name);
    for (const name of ['semantic_contexts', 'semantic_models', 'work_knowledge_assets']) assert.ok(!tableNames.has(name), name);

    const token = await db.query<{ principal_type: string; principal_id: string }>('SELECT principal_type, principal_id FROM mcp_access_tokens');
    assert.deepEqual(token.rows[0], { principal_type: 'user', principal_id: 'user-1' });
    const defaults = await db.query<{ model_yaml: string; model_json: { version: string } }>(
        `INSERT INTO knowledge_models (id, organization_id, name) VALUES ('model-1', 'org-1', 'Revenue') RETURNING model_yaml, model_json`,
    );
    assert.match(defaults.rows[0]?.model_yaml ?? '', /version: 0\.1\.1/);
    assert.equal(defaults.rows[0]?.model_json.version, '0.1.1');

    await db.exec(`
        INSERT INTO connections (id) VALUES ('connection-1');
        INSERT INTO knowledge_model_sources (knowledge_model_id, connection_id) VALUES ('model-1', 'connection-1');
        INSERT INTO knowledge_sources (id, organization_id, knowledge_model_id, connection_id, file_name, format, content_text, byte_size)
        VALUES ('source-1', 'org-1', 'model-1', 'connection-1', 'rules.md', 'markdown', '# Rules', 7);
        INSERT INTO work_agent_assets (work_id, organization_id, user_id, asset_kind, asset_ref, revision, asset_snapshot)
        VALUES ('work-1', 'org-1', 'user-1', 'semantic_model', 'dory://knowledge/model-1@abc', 'abc', '{"ossieVersion":"0.1.1"}'::jsonb);
        DELETE FROM connections WHERE id = 'connection-1';
    `);
    const source = await db.query<{ connection_id: string | null }>(`SELECT connection_id FROM knowledge_sources WHERE id = 'source-1'`);
    assert.equal(source.rows[0]?.connection_id, null);
    const usage = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM work_agent_assets');
    assert.equal(usage.rows[0]?.count, 1);
    await db.close();
});

test('fresh PGlite applies the complete history including Ossie 0.2 defaults', async () => {
    const client = new PGlite();
    const db = drizzle({ client });
    await migrate(db, { migrationsFolder: new URL('../../src/pglite/migrations', import.meta.url).pathname });
    const applied = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations');
    assert.equal(applied.rows[0]?.count, 31);
    const finalTables = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('knowledge_models', 'work_agent_assets', 'semantic_models', 'work_knowledge_assets') ORDER BY table_name`,
    );
    assert.deepEqual(
        finalTables.rows.map(row => row.table_name),
        ['knowledge_models', 'work_agent_assets'],
    );
    await client.close();
});
