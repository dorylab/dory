import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const postgresMigrationUrl = new URL('../../src/postgres/migrations/0035_knowledge_traceability.sql', import.meta.url);
const pgliteMigrationUrl = new URL('../../src/pglite/migrations/0035_knowledge_traceability.sql', import.meta.url);

test('Postgres and PGlite knowledge traceability migrations stay aligned', async () => {
    const [postgresSql, pgliteSql] = await Promise.all([readFile(postgresMigrationUrl, 'utf8'), readFile(pgliteMigrationUrl, 'utf8')]);
    assert.equal(pgliteSql, postgresSql);
});

test('source links cascade while Agent Run usage snapshots remain independent', async () => {
    const db = new PGlite();
    await db.exec(`
        CREATE TABLE knowledge_models (id text PRIMARY KEY);
        CREATE TABLE knowledge_sources (id text PRIMARY KEY);
        CREATE TABLE works (work_id text PRIMARY KEY);
    `);
    await db.exec(await readFile(pgliteMigrationUrl, 'utf8'));
    await db.exec(`
        INSERT INTO knowledge_models (id) VALUES ('model-1');
        INSERT INTO knowledge_sources (id) VALUES ('source-1');
        INSERT INTO works (work_id) VALUES ('work-1');
        INSERT INTO knowledge_asset_sources (knowledge_model_id, knowledge_source_id, asset_type, asset_id, relation_type)
        VALUES ('model-1', 'source-1', 'definition', 'definition-1', 'provided');
        INSERT INTO work_knowledge_assets (work_id, organization_id, user_id, knowledge_model_id, asset_type, asset_id, asset_snapshot)
        VALUES ('work-1', 'org-1', 'user-1', 'model-1', 'definition', 'definition-1', '{"name":"Revenue"}'::jsonb);
        DELETE FROM knowledge_sources WHERE id = 'source-1';
    `);
    const links = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM knowledge_asset_sources');
    const usage = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM work_knowledge_assets');
    assert.equal(links.rows[0]?.count, 0);
    assert.equal(usage.rows[0]?.count, 1);
    await db.close();
});
