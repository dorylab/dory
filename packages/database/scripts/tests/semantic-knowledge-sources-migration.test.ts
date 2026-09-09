import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const postgresMigrationUrl = new URL('../../src/postgres/migrations/0032_semantic_knowledge_sources.sql', import.meta.url);
const pgliteMigrationUrl = new URL('../../src/pglite/migrations/0032_semantic_knowledge_sources.sql', import.meta.url);

test('Postgres and PGlite semantic knowledge source migrations stay aligned', async () => {
    const [postgresSql, pgliteSql] = await Promise.all([readFile(postgresMigrationUrl, 'utf8'), readFile(pgliteMigrationUrl, 'utf8')]);
    assert.equal(pgliteSql, postgresSql);
});

test('PGlite migration creates constraints and applies delete policies', async () => {
    const db = new PGlite();
    await db.exec('CREATE TABLE connections (id text PRIMARY KEY); CREATE TABLE semantic_models (id text PRIMARY KEY);');
    const migration = await readFile(pgliteMigrationUrl, 'utf8');
    for (const statement of migration
        .split('--> statement-breakpoint')
        .map(value => value.trim())
        .filter(Boolean))
        await db.exec(statement);

    await db.exec("INSERT INTO connections (id) VALUES ('connection-1'); INSERT INTO semantic_models (id) VALUES ('model-1');");
    await db.exec(
        "INSERT INTO semantic_model_knowledge_sources (id, organization_id, semantic_model_id, connection_id, file_name, format, content_text, byte_size) VALUES ('source-1', 'org-1', 'model-1', 'connection-1', 'rules.md', 'markdown', '# Rules', 7);",
    );
    await assert.rejects(
        db.exec(
            "INSERT INTO semantic_model_knowledge_sources (id, organization_id, semantic_model_id, file_name, format, content_text, byte_size) VALUES ('source-2', 'org-1', 'model-1', 'rules.md', 'markdown', '# Duplicate', 11);",
        ),
    );

    await db.exec("DELETE FROM connections WHERE id = 'connection-1';");
    const afterConnectionDelete = await db.query<{ connection_id: string | null }>('SELECT connection_id FROM semantic_model_knowledge_sources WHERE id = $1', ['source-1']);
    assert.equal(afterConnectionDelete.rows[0]?.connection_id, null);

    await db.exec("DELETE FROM semantic_models WHERE id = 'model-1';");
    const afterModelDelete = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM semantic_model_knowledge_sources');
    assert.equal(afterModelDelete.rows[0]?.count, 0);
    await db.close();
});
