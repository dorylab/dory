import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const postgresMigrationUrl = new URL('../../src/postgres/migrations/0037_agent_assets.sql', import.meta.url);
const pgliteMigrationUrl = new URL('../../src/pglite/migrations/0037_agent_assets.sql', import.meta.url);

test('Postgres and PGlite Agent asset migrations stay aligned', async () => {
    const [postgresSql, pgliteSql] = await Promise.all([readFile(postgresMigrationUrl, 'utf8'), readFile(pgliteMigrationUrl, 'utf8')]);
    assert.equal(pgliteSql, postgresSql);
});

test('Agent asset migration backfills Knowledge usage with stable refs', async () => {
    const db = new PGlite();
    await db.exec(`
        CREATE TABLE works (work_id text PRIMARY KEY, user_id text NOT NULL);
        CREATE TABLE work_events (event_id text PRIMARY KEY, user_id text NOT NULL);
        CREATE TABLE mcp_access_tokens (
            id text PRIMARY KEY,
            organization_id text NOT NULL,
            created_by_user_id text NOT NULL
        );
        CREATE TABLE work_knowledge_assets (
            work_id text NOT NULL,
            organization_id text NOT NULL,
            user_id text NOT NULL,
            knowledge_model_id text NOT NULL,
            asset_type text NOT NULL,
            asset_id text NOT NULL,
            asset_snapshot jsonb NOT NULL,
            use_count integer DEFAULT 1 NOT NULL,
            first_used_at timestamp with time zone DEFAULT now() NOT NULL,
            last_used_at timestamp with time zone DEFAULT now() NOT NULL
        );
        INSERT INTO works (work_id, user_id) VALUES ('work-1', 'user-1');
        INSERT INTO mcp_access_tokens (id, organization_id, created_by_user_id) VALUES ('token-1', 'org-1', 'user-1');
        INSERT INTO work_knowledge_assets (work_id, organization_id, user_id, knowledge_model_id, asset_type, asset_id, asset_snapshot)
        VALUES ('work-1', 'org-1', 'user-1', 'kn-1', 'definition', 'metric:mrr', '{"name":"MRR"}'::jsonb);
    `);
    await db.exec(await readFile(pgliteMigrationUrl, 'utf8'));
    const usage = await db.query<{ asset_ref: string; asset_kind: string; revision: string }>('SELECT asset_ref, asset_kind, revision FROM work_agent_assets');
    assert.deepEqual(usage.rows[0], {
        asset_ref: 'dory://knowledge/kn-1/definitions/metric:mrr',
        asset_kind: 'knowledge_definition',
        revision: 'legacy',
    });
    const token = await db.query<{ principal_type: string; principal_id: string }>('SELECT principal_type, principal_id FROM mcp_access_tokens');
    assert.deepEqual(token.rows[0], { principal_type: 'user', principal_id: 'user-1' });
    await db.close();
});
