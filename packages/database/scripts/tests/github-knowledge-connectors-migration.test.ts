import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const postgresMigrationUrl = new URL('../../src/postgres/migrations/0034_github_knowledge_connectors.sql', import.meta.url);
const pgliteMigrationUrl = new URL('../../src/pglite/migrations/0034_github_knowledge_connectors.sql', import.meta.url);

test('Postgres and PGlite GitHub connector migrations stay aligned', async () => {
    const [postgresSql, pgliteSql] = await Promise.all([readFile(postgresMigrationUrl, 'utf8'), readFile(pgliteMigrationUrl, 'utf8')]);
    assert.equal(pgliteSql, postgresSql);
});

test('connector mappings and jobs cascade without affecting uploaded sources', async () => {
    const db = new PGlite();
    await db.exec(`
        CREATE TABLE knowledge_models (id text PRIMARY KEY);
        CREATE TABLE knowledge_sources (id text PRIMARY KEY);
    `);
    await db.exec(await readFile(pgliteMigrationUrl, 'utf8'));
    await db.exec(`
        INSERT INTO knowledge_models (id) VALUES ('model-1');
        INSERT INTO knowledge_sources (id) VALUES ('managed-source'), ('upload-source');
        INSERT INTO knowledge_connectors (id, organization_id, knowledge_model_id, provider, installation_id, repository_id, repository_full_name, default_branch, root_path)
        VALUES ('connector-1', 'org-1', 'model-1', 'github', '10', '20', 'dorylab/docs', 'main', 'docs');
        INSERT INTO knowledge_connector_items (connector_id, knowledge_source_id, remote_path, remote_sha)
        VALUES ('connector-1', 'managed-source', 'docs/readme.md', 'abc');
        INSERT INTO knowledge_connector_sync_jobs (id, connector_id) VALUES ('job-1', 'connector-1');
    `);
    await assert.rejects(
        db.exec(`INSERT INTO knowledge_connectors (id, organization_id, knowledge_model_id, provider, installation_id, repository_id, repository_full_name, default_branch, root_path)
            VALUES ('connector-2', 'org-1', 'model-1', 'github', '10', '20', 'dorylab/docs', 'main', 'docs');`),
    );
    await db.exec("DELETE FROM knowledge_connectors WHERE id = 'connector-1';");
    const mappings = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM knowledge_connector_items');
    const jobs = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM knowledge_connector_sync_jobs');
    const sources = await db.query<{ id: string }>('SELECT id FROM knowledge_sources ORDER BY id');
    assert.equal(mappings.rows[0]?.count, 0);
    assert.equal(jobs.rows[0]?.count, 0);
    assert.deepEqual(
        sources.rows.map(row => row.id),
        ['managed-source', 'upload-source'],
    );
    await db.close();
});
