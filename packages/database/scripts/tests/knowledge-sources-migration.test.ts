import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const postgresMigrationUrl = new URL('../../src/postgres/migrations/0033_knowledge.sql', import.meta.url);
const pgliteMigrationUrl = new URL('../../src/pglite/migrations/0033_knowledge.sql', import.meta.url);
const legacyModelsMigrationUrl = new URL('../../src/pglite/migrations/0031_semantic_models.sql', import.meta.url);
const legacySourcesMigrationUrl = new URL('../../src/pglite/migrations/0032_semantic_knowledge_sources.sql', import.meta.url);

async function applyMigration(db: PGlite, url: URL) {
    const migration = await readFile(url, 'utf8');
    for (const statement of migration
        .split('--> statement-breakpoint')
        .map(value => value.trim())
        .filter(Boolean))
        await db.exec(statement);
}

test('Postgres and PGlite Knowledge migrations stay aligned', async () => {
    const [postgresSql, pgliteSql] = await Promise.all([readFile(postgresMigrationUrl, 'utf8'), readFile(pgliteMigrationUrl, 'utf8')]);
    assert.equal(pgliteSql, postgresSql);
});

test('PGlite migration preserves Knowledge data and delete policies', async () => {
    const db = new PGlite();
    await db.exec('CREATE TABLE connections (id text PRIMARY KEY);');
    await applyMigration(db, legacyModelsMigrationUrl);
    await applyMigration(db, legacySourcesMigrationUrl);

    await db.exec("INSERT INTO connections (id) VALUES ('connection-1'); INSERT INTO semantic_models (id, organization_id, name) VALUES ('model-1', 'org-1', 'Revenue');");
    await db.exec(
        "INSERT INTO semantic_model_knowledge_sources (id, organization_id, semantic_model_id, connection_id, file_name, format, content_text, byte_size) VALUES ('source-1', 'org-1', 'model-1', 'connection-1', 'rules.md', 'markdown', '# Rules', 7);",
    );
    await db.exec("INSERT INTO semantic_verified_queries (id, semantic_model_id, source_connection_id, title, question, sql) VALUES ('query-1', 'model-1', 'connection-1', 'Revenue', 'What is revenue?', 'SELECT 1');");
    await applyMigration(db, pgliteMigrationUrl);

    const model = await db.query<{ id: string }>('SELECT id FROM knowledge_models WHERE id = $1', ['model-1']);
    const query = await db.query<{ knowledge_model_id: string }>('SELECT knowledge_model_id FROM knowledge_verified_queries WHERE id = $1', ['query-1']);
    const constraints = await db.query<{ conname: string }>(
        "SELECT conname FROM pg_constraint WHERE conrelid IN ('knowledge_model_sources'::regclass, 'knowledge_sources'::regclass, 'knowledge_verified_queries'::regclass)",
    );
    assert.equal(model.rows[0]?.id, 'model-1');
    assert.equal(query.rows[0]?.knowledge_model_id, 'model-1');
    assert.ok(constraints.rows.every(constraint => !constraint.conname.includes('semantic')));
    await assert.rejects(db.exec("INSERT INTO knowledge_sources (id, organization_id, knowledge_model_id, file_name, format, content_text, byte_size) VALUES ('source-2', 'org-1', 'model-1', 'rules.md', 'markdown', '# Duplicate', 11);"));

    await db.exec("DELETE FROM connections WHERE id = 'connection-1';");
    const afterConnectionDelete = await db.query<{ connection_id: string | null }>('SELECT connection_id FROM knowledge_sources WHERE id = $1', ['source-1']);
    assert.equal(afterConnectionDelete.rows[0]?.connection_id, null);

    await db.exec("DELETE FROM knowledge_models WHERE id = 'model-1';");
    const afterModelDelete = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM knowledge_sources');
    assert.equal(afterModelDelete.rows[0]?.count, 0);
    await db.close();
});
