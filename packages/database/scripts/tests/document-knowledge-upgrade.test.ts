import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Client } from 'pg';

async function database() {
    const url = process.env.DORY_GENERATION_TEST_POSTGRES_URL;
    if (!url) {
        const db = new PGlite();
        return { provider: 'pglite', exec: (sql: string) => db.exec(sql), query: (sql: string) => db.query(sql), close: () => db.close() };
    }
    const name = 'document_upgrade_' + randomUUID().replaceAll('-', '');
    const admin = new Client({ connectionString: url });
    await admin.connect();
    await admin.query('CREATE DATABASE ' + name);
    const target = new URL(url);
    target.pathname = '/' + name;
    const db = new Client({ connectionString: target.toString() });
    await db.connect();
    return {
        provider: 'postgres',
        exec: (sql: string) => db.query(sql),
        query: (sql: string) => db.query(sql),
        close: async () => {
            await db.end();
            await admin.query('DROP DATABASE ' + name);
            await admin.end();
        },
    };
}

test('0050 preserves documents, guide and valid SQL provenance when upgrading a populated knowledge base', async () => {
    const db = await database();
    try {
        const migrations = readMigrationFiles({ migrationsFolder: new URL('../../src/' + db.provider + '/migrations', import.meta.url).pathname });
        const upgrade = migrations.findIndex(m => m.sql.some(s => s.includes('CREATE TABLE knowledge_query_sources')));
        assert.ok(upgrade > 0);
        for (const migration of migrations.slice(0, upgrade)) await db.exec(migration.sql.join('\n'));
        await db.exec(`
            INSERT INTO connections (id, organization_id, name, type, engine, updated_at) VALUES ('conn','org','Warehouse','sqlite','sqlite', now());
            INSERT INTO knowledge_models (id, organization_id, name, model_json) VALUES
                ('kb','org','Orders','{"ai_context":{"instructions":"# Guide"}}'), ('other','org','Other','{}');
            INSERT INTO knowledge_sources (id, organization_id, knowledge_model_id, file_name, format, content_text, byte_size) VALUES
                ('doc','org','kb','Orders.md','markdown','# Orders',8), ('raw','org','kb','Orders.yml','yaml','orders: []',10);
            INSERT INTO knowledge_verified_queries (id, knowledge_model_id, source_connection_id, title, question, sql, definition_ids)
                VALUES ('sql','kb','conn','Count','How many?','SELECT 42','["metric:count"]');
            INSERT INTO knowledge_asset_sources (knowledge_model_id, knowledge_source_id, asset_type, asset_id, relation_type) VALUES
                ('kb','doc','definition','metric:count','provided'), ('kb','raw','verified_query','sql','generated'),
                ('other','doc','verified_query','sql','provided'), ('kb','doc','verified_query','gone','provided');
        `);
        await db.exec('BEGIN;\n' + migrations[upgrade]!.sql.join('\n') + '\nCOMMIT;');
        assert.deepEqual((await db.query('SELECT knowledge_source_id, query_id, relation_type FROM knowledge_query_sources')).rows, [
            { knowledge_source_id: 'raw', query_id: 'sql', relation_type: 'generated' },
        ]);
        assert.deepEqual((await db.query("SELECT business_context_md FROM knowledge_models WHERE id='kb'")).rows, [{ business_context_md: '# Guide' }]);
        assert.deepEqual((await db.query('SELECT id, content_text FROM knowledge_sources ORDER BY id')).rows, [
            { id: 'doc', content_text: '# Orders' },
            { id: 'raw', content_text: 'orders: []' },
        ]);
        assert.deepEqual((await db.query('SELECT id, sql FROM knowledge_verified_queries')).rows, [{ id: 'sql', sql: 'SELECT 42' }]);
        assert.deepEqual((await db.query("SELECT to_regclass('knowledge_candidates') AS removed")).rows, [{ removed: null }]);
    } finally {
        await db.close();
    }
});
