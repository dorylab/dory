import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { PostgresDBClient } from '@dory/shared';
import { OSSIE_VERSION } from '@dory/shared/types/ossie';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import { PostgresKnowledgeRepository } from '../../src/postgres/impl/knowledge';
import { migrateLegacyOssieModels } from '../../src/postgres/impl/knowledge/migrate-ossie';
import { ossieRevision, parseOssieYaml, projectOssieDocument } from '../../src/postgres/impl/knowledge/ossie';
import { EMPTY_OSSIE_DOCUMENT, EMPTY_OSSIE_YAML, type OssieDocument } from '../../src/postgres/schemas/knowledge';

async function fixture() {
    const client = new PGlite();
    await client.exec(`CREATE TABLE knowledge_models (
        id text PRIMARY KEY, organization_id text NOT NULL, name text NOT NULL, description text,
        publication_mode text NOT NULL DEFAULT 'review', publication_epoch integer NOT NULL DEFAULT 0,
        business_context_md text NOT NULL DEFAULT '', model_yaml text NOT NULL, model_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE work_agent_assets (work_id text, revision text, asset_snapshot jsonb);
    INSERT INTO work_agent_assets VALUES ('historic-run', 'original-revision', '{"ossieVersion":"0.1.1","modelRevision":"original-revision"}');`);
    const model = {
        name: 'commerce',
        ai_context: { instructions: 'Revenue excludes tax.', audience: 'finance' },
        datasets: [
            {
                name: 'orders',
                source: 'public.orders',
                fields: [
                    {
                        name: 'amount',
                        expression: {
                            dialects: [
                                { dialect: 'ANSI_SQL', expression: 'amount' },
                                { dialect: 'SNOWFLAKE', expression: '"AMOUNT"' },
                            ],
                        },
                    },
                ],
                custom_extensions: [{ vendor_name: 'COMMON', data: JSON.stringify({ dory: { id: 'entity:orders', sourceConnectionId: 'conn', status: 'verified' } }) }],
            },
        ],
        metrics: [
            {
                name: 'revenue',
                expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'SUM(orders.amount)' }] },
                custom_extensions: [{ vendor_name: 'DBT', data: '{"keep":true}' }],
            },
        ],
        relationships: [],
    };
    const legacy = { version: '0.1.1', semantic_model: [model], dialects: ['ANSI_SQL', 'SNOWFLAKE'], vendors: ['COMMON', 'DBT'] };
    const insert = (id: string, value: unknown) =>
        client.query(
            `INSERT INTO knowledge_models (id, organization_id, name, model_yaml, model_json, created_at, updated_at)
         VALUES ($1, 'org', $1, 'old-yaml', $2, '2026-10-13T00:00:00Z', '2026-10-13T01:00:00Z')`,
            [id, JSON.stringify(value)],
        );
    return { client, db: drizzle(client) as unknown as PostgresDBClient, model, legacy, insert };
}

test('0031 defaults agree across providers and produce valid canonical YAML and JSON', async () => {
    const pg = await readFile(new URL('../../src/postgres/migrations/0031_ossie_020_defaults.sql', import.meta.url), 'utf8');
    const pglite = await readFile(new URL('../../src/pglite/migrations/0031_ossie_020_defaults.sql', import.meta.url), 'utf8');
    assert.equal(pg, pglite);
    const { client } = await fixture();
    try {
        for (const statement of pg.split('--> statement-breakpoint')) await client.exec(statement);
        const result = await client.query<{ model_yaml: string; model_json: OssieDocument }>(
            `INSERT INTO knowledge_models (id, organization_id, name) VALUES ('default', 'org', 'Default') RETURNING model_yaml, model_json`,
        );
        assert.equal(result.rows[0].model_yaml, EMPTY_OSSIE_YAML);
        assert.deepEqual(result.rows[0].model_json, EMPTY_OSSIE_DOCUMENT);
        assert.deepEqual(parseOssieYaml(result.rows[0].model_yaml), result.rows[0].model_json);
    } finally {
        await client.close();
    }
});

test('initialization migrates stored models once, preserves ownership, verification and historical Run context', async () => {
    const { client, db, model, legacy, insert } = await fixture();
    try {
        await insert('legacy', legacy);
        const repository = new PostgresKnowledgeRepository();
        await repository.init(db);
        const result = await client.query<{ model_yaml: string; model_json: OssieDocument; organization_id: string; updated_at: Date }>('SELECT * FROM knowledge_models');
        const stored = result.rows[0];
        assert.deepEqual(stored.model_json, { version: OSSIE_VERSION, ...model });
        assert.deepEqual(parseOssieYaml(stored.model_yaml), stored.model_json);
        assert.equal(stored.organization_id, 'org');
        assert.equal(new Date(stored.updated_at).toISOString(), '2026-10-13T01:00:00.000Z');
        assert.deepEqual(projectOssieDocument(stored.model_json).definitions[0], {
            id: 'entity:orders',
            name: 'orders',
            kind: 'entity',
            status: 'verified',
            sourceConnectionId: 'conn',
            source: 'public.orders',
            description: undefined,
            aliases: undefined,
            aiContext: undefined,
        });
        assert.match(ossieRevision(stored.model_json), /^[a-f0-9]{64}$/);
        assert.equal(await migrateLegacyOssieModels(db), 0);
        const history = await client.query('SELECT * FROM work_agent_assets');
        assert.deepEqual(history.rows, [{ work_id: 'historic-run', revision: 'original-revision', asset_snapshot: { ossieVersion: '0.1.1', modelRevision: 'original-revision' } }]);
    } finally {
        await client.close();
    }
});

test('an invalid stored model rolls back the entire batch without hiding or partially converting rows', async () => {
    const { client, db, legacy, insert } = await fixture();
    try {
        await insert('a-valid', legacy);
        await insert('b-invalid', { version: '0.1.1', semantic_model: [{ name: 'empty', datasets: [] }] });
        await assert.rejects(migrateLegacyOssieModels(db), /b-invalid.*rolled back/i);
        const result = await client.query<{ model_json: { version: string }; model_yaml: string }>('SELECT model_json, model_yaml FROM knowledge_models');
        assert.equal(result.rows.length, 2);
        assert.ok(result.rows.every(row => row.model_json.version === '0.1.1' && row.model_yaml === 'old-yaml'));
    } finally {
        await client.close();
    }
});

test('stored empty, multiple and mixed model wrappers cannot be silently truncated during migration', async () => {
    const { client, db, legacy, model, insert } = await fixture();
    try {
        for (const semantic_model of [[], [model, model]]) {
            await insert('invalid', { ...legacy, semantic_model });
            await assert.rejects(migrateLegacyOssieModels(db), /rolled back/i);
            await client.exec('DELETE FROM knowledge_models');
        }
        await insert('mixed', { ...legacy, name: 'unexpected-root-name' });
        await assert.rejects(migrateLegacyOssieModels(db), /rolled back/i);
    } finally {
        await client.close();
    }
});
