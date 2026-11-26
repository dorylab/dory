import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { PostgresDBClient } from '@dory/shared';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle as postgres } from 'drizzle-orm/node-postgres';
import { drizzle as pglite } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import { savedQueries } from '../../src/postgres/schemas';
import { savedQueriesAnonymousOwnershipMigration } from '../../src/postgres/impl/organization/anonymous-migrations/saved-queries';
import { PostgresKnowledgeRepository } from '../../src/postgres/impl/knowledge';
import { PostgresSavedQueriesRepository } from '../../src/postgres/impl/sql-console/save-queries';

async function fixture() {
    const url = process.env.DORY_GENERATION_TEST_POSTGRES_URL;
    if (!url) {
        const client = new PGlite();
        return { provider: 'pglite', db: pglite(client) as unknown as PostgresDBClient, exec: (sql: string) => client.exec(sql), close: () => client.close() };
    }
    const name = 'unified_' + randomUUID().replaceAll('-', '');
    const admin = new Pool({ connectionString: url });
    await admin.query('CREATE DATABASE ' + name);
    const target = new URL(url);
    target.pathname = '/' + name;
    const pool = new Pool({ connectionString: target.href });
    return {
        provider: 'postgres',
        db: postgres(pool),
        exec: (sql: string) => pool.query(sql),
        close: async () => {
            await pool.end();
            await admin.query('DROP DATABASE ' + name);
            await admin.end();
        },
    };
}

test('0051 preserves legacy IDs and private folders, then saves, shares, edits and unlinks a single SQL asset', async () => {
    const f = await fixture();
    try {
        const migrations = readMigrationFiles({ migrationsFolder: new URL('../../src/' + f.provider + '/migrations', import.meta.url).pathname });
        const index = migrations.findIndex(m => m.sql.some(s => s.includes('CREATE TABLE saved_query_collections')));
        assert.ok(index > 0);
        for (const m of migrations.slice(0, index)) await f.exec(m.sql.join('\n'));
        await f.exec(`
            INSERT INTO connections(id,organization_id,name,type,engine,updated_at) VALUES ('conn','org','test','sqlite','sqlite',now());
            INSERT INTO knowledge_models(id,organization_id,name) VALUES('kb','org','Original');
            INSERT INTO knowledge_model_sources(knowledge_model_id,connection_id) VALUES('kb','conn');
            INSERT INTO saved_queries(id,organization_id,user_id,title,sql_text,connection_id,position,folder_id,context,tags)
                VALUES('private','org','alice','Example','SELECT 42','conn',700,'folder','{"schema":"orders"}','{tag}');
            INSERT INTO knowledge_verified_queries(id,knowledge_model_id,source_connection_id,title,question,sql,source_type,source_id)
                VALUES('kvq_explicit','kb','conn','Example','百度净利润','SELECT 42','saved_query','private'),
                ('kvq_copy','kb','conn','Example','B?','SELECT 42','workspace',NULL);
            INSERT INTO knowledge_sources(id,organization_id,knowledge_model_id,file_name,format,content_text,byte_size)
                VALUES('doc','org','kb','notes.md','markdown',repeat('x', 1000) || '调整后净利润',1018);
            INSERT INTO knowledge_query_sources(knowledge_source_id,query_id,relation_type) VALUES('doc','kvq_explicit','provided');
        `);
        await f.exec('BEGIN;\n' + migrations[index]!.sql.join('\n') + '\nCOMMIT;');
        const kb = new PostgresKnowledgeRepository();
        await kb.init(f.db);
        const saved = new PostgresSavedQueriesRepository();
        await saved.init(f.db);
        const scope = { organizationId: 'org', knowledgeModelId: 'kb' };
        const alice = { organizationId: 'org', connectionId: 'conn', userId: 'alice' };
        const bob = { ...alice, userId: 'bob' };
        const question = '百度 2023 财年的净利润是多少？';
        assert.deepEqual(
            (await kb.listVerifiedQueries({ ...scope, query: question })).map(row => row.id),
            ['kvq_explicit'],
        );
        const matches = await kb.searchKnowledgeSources({ ...scope, query: question });
        assert.equal(matches[0]?.id, 'doc');
        assert.match(matches[0]!.excerpt, /调整后净利润/);
        const old = await saved.getById({ ...alice, id: 'private' });
        assert.equal(old?.folderId, 'folder');
        assert.equal(old?.position, 700);
        assert.deepEqual(old?.context, { schema: 'orders' });
        assert.deepEqual(old?.tags, ['tag']);
        assert.equal((await kb.getVerifiedQuery({ ...scope, id: 'kvq_explicit' })).savedQueryId, 'private');
        assert.equal((await kb.getVerifiedQuery({ ...scope, id: 'kvq_copy' })).savedQueryId, 'kvq_copy');
        assert.equal((await kb.listQuerySources({ ...scope, queryId: 'kvq_explicit' }))[0]?.sourceId, 'doc');
        assert.equal(await saved.getById({ ...bob, id: 'private' }), null);
        const input = {
            organizationId: 'org',
            userId: 'alice',
            sourceConnectionId: 'conn',
            newModelName: 'New base',
            description: 'Returns a constant for testing.',
            sql: 'SELECT 1',
            title: 'New query',
            collect: true,
            requestId: randomUUID(),
        };
        const failed = { ...input, knowledgeSourceIds: ['unknown'] };
        const before = await kb.listModels(alice);
        await assert.rejects(kb.saveQuery(failed), /unavailable/);
        assert.equal((await kb.listModels(alice)).length, before.length);
        assert.equal((await saved.list(alice)).length, 1);
        const [first, retry] = await Promise.all([kb.saveQuery(input), kb.saveQuery(input)]);
        assert.equal(first.id, retry.id);
        assert.equal(first.description, input.description);
        assert.equal((await kb.saveQuery(input)).id, first.id);
        assert.equal((await saved.list(alice)).length, 2);
        assert.equal((await kb.listConnectionQueries(alice)).filter(q => q.id === first.id).length, 1);
        const stale = {
            organizationId: 'org',
            sourceConnectionId: 'conn',
            userId: 'alice',
            existingQueryId: first.id,
            newModelName: 'Rejected',
            edit: { revision: first.revision + 1, title: 'Updated title', sqlText: 'SELECT 10', description: 'Updated description' },
            requestId: randomUUID(),
        };
        await assert.rejects(kb.saveQuery(stale), /Reload/);
        assert.equal(
            (await kb.listModels(alice)).some(model => model.name === 'Rejected'),
            false,
        );
        assert.equal((await saved.getById({ ...alice, id: first.id }))?.sqlText, 'SELECT 1');
        const second = await kb.saveQuery({
            ...scope,
            userId: 'alice',
            sourceConnectionId: 'conn',
            existingQueryId: first.id,
            question: 'Local meaning',
            knowledgeSourceIds: ['doc'],
        });
        assert.equal(second.savedQueryId, first.id);
        await kb.replaceQuerySources({ ...scope, queryId: second.id, sourceIds: ['doc'] });
        assert.deepEqual(await kb.listQuerySources({ ...scope, knowledgeModelId: first.knowledgeModelId, queryId: first.id }), []);
        await assert.rejects(saved.update({ ...alice, id: first.id, patch: { sqlText: 'SELECT 9' } }), /access/);
        await saved.update({ ...alice, id: first.id, allowSharedEdit: true, patch: { sqlText: 'SELECT 2', revision: first.revision } });
        await assert.rejects(kb.updateVerifiedQuery({ ...scope, id: second.id, question: '?', sql: 'SELECT 3', title: 'stale', revision: first.revision }), /Reload/);
        assert.equal((await kb.getVerifiedQuery({ ...scope, id: second.id })).sql, 'SELECT 2');
        const options = await kb.listQueryMembershipOptions({ ...alice, id: first.id });
        assert.equal(options.collected, true);
        assert.deepEqual(new Set(options.models.filter(model => model.included).map(model => model.id)), new Set(['kb', first.knowledgeModelId]));
        const managing = {
            ...alice,
            id: first.id,
            title: first.title,
            sqlText: 'SELECT 2',
            description: first.description,
            addModelIds: [],
            removeModelIds: ['kb'],
            revision: first.revision,
        };
        await assert.rejects(kb.editSavedQuery(managing), /Reload/);
        assert.equal((await kb.listQuerySources({ ...scope, queryId: second.id })).length, 1);
        const updated = await kb.editSavedQuery({ ...managing, revision: first.revision + 1 });
        assert.deepEqual(await kb.listQuerySources({ ...scope, queryId: second.id }), []);
        assert.equal((await kb.getVerifiedQuery({ organizationId: 'org', knowledgeModelId: first.knowledgeModelId, id: first.id })).sql, 'SELECT 2');
        assert.equal((await saved.getById({ ...alice, id: first.id }))?.sqlText, 'SELECT 2');
        await saved.collectShared({ ...bob, id: first.id });
        await saved.collectShared({ ...bob, id: first.id });
        assert.equal((await saved.list(bob)).length, 1);
        await saved.delete({ ...bob, id: first.id });
        await saved.delete({ ...alice, id: first.id });
        assert.equal((await kb.getVerifiedQuery({ ...scope, knowledgeModelId: first.knowledgeModelId, id: first.id })).sql, 'SELECT 2');
        await kb.editSavedQuery({ ...managing, ...bob, revision: updated.revision, removeModelIds: [first.knowledgeModelId] });
        assert.equal((await saved.getById({ ...bob, id: first.id }))?.sqlText, 'SELECT 2');
        assert.equal((await kb.listVerifiedQueries({ ...scope, knowledgeModelId: first.knowledgeModelId })).length, 0);
        await saved.delete({ ...bob, id: first.id });
        await kb.deleteModel({ ...scope, knowledgeModelId: first.knowledgeModelId });
        assert.equal((await f.db.select().from(savedQueries)).length, 2);
        const secret = await saved.create({ ...alice, title: 'Private', sqlText: 'SELECT 99' });
        assert.ok(!(await kb.queryOptions(bob)).some(q => q.id === secret.id));
        await assert.rejects(kb.saveQuery({ ...scope, userId: 'bob', sourceConnectionId: 'conn', existingQueryId: secret.id, question: '?' }), /unavailable/);
        await assert.rejects(kb.listQueryMembershipOptions({ ...bob, id: secret.id }), /unavailable/);
        await assert.rejects(kb.editSavedQuery({ ...managing, ...bob, id: secret.id, revision: secret.revision, addModelIds: ['kb'], removeModelIds: [] }), /unavailable/);
        await f.db.transaction(tx =>
            savedQueriesAnonymousOwnershipMigration.migrate(tx, {
                sourceOrganizationId: 'org',
                targetOrganizationId: 'target',
                anonymousUserId: 'alice',
                newUserId: 'linked',
            }),
        );
        const destination = { organizationId: 'target', userId: 'linked', connectionId: 'conn' };
        const linked = await saved.list(destination);
        assert.ok(linked.some(row => row.id === secret.id));
        const copy = linked.find(row => row.title === 'Example');
        assert.ok(copy && copy.id !== 'private');
        assert.equal(copy.folderId, 'folder');
        assert.equal((await kb.getVerifiedQuery({ ...scope, id: 'kvq_explicit' })).savedQueryId, 'private');
        assert.equal((await saved.list(alice)).length, 0);
        const referenceBase = await kb.createModel({ organizationId: 'org', name: 'Reference', connectionIds: ['conn'] });
        const multi = {
            ...alice,
            sourceConnectionId: 'conn',
            title: 'Saved to two bases',
            sql: 'SELECT 7',
            knowledgeModelIds: ['kb', referenceBase.id],
            collect: true,
            requestId: randomUUID(),
        };
        await assert.rejects(kb.saveQuery({ ...multi, knowledgeModelIds: ['kb', 'missing'] }), /not found/);
        assert.equal((await saved.list(alice)).length, 0);
        const created = await kb.saveQuery(multi);
        const repeated = await kb.saveQuery({ ...multi, knowledgeModelIds: [...multi.knowledgeModelIds].reverse() });
        assert.equal(repeated.savedQueryId, created.savedQueryId);
        for (const knowledgeModelId of multi.knowledgeModelIds) {
            const membership = await kb.getVerifiedQuery({ organizationId: 'org', knowledgeModelId, id: created.id });
            assert.equal(membership.savedQueryId, created.savedQueryId);
        }
        assert.equal((await saved.list(alice)).length, 1);
    } finally {
        await f.close();
    }
});

test('Desktop startup upgrades a local workspace and reopens the same query after restarting PGlite', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { migratePgliteDB } = await import('../../src/pglite/migrate-pglite');
    const { getPgliteClient, resetPgliteClient } = await import('../../src/postgres/client/pglite');
    const directory = await mkdtemp(join(tmpdir(), 'dory-unified-restart-'));
    const previous = process.env.PGLITE_DB_PATH;
    process.env.PGLITE_DB_PATH = join(directory, 'workspace');
    try {
        const legacy = new PGlite(process.env.PGLITE_DB_PATH);
        try {
            const migrations = readMigrationFiles({ migrationsFolder: new URL('../../src/pglite/migrations', import.meta.url).pathname });
            const end = migrations.findIndex(m => m.sql.some(s => s.includes('CREATE TABLE saved_query_collections')));
            assert.ok(end > 0);
            await legacy.exec('CREATE SCHEMA drizzle; CREATE TABLE drizzle.drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint);');
            for (const migration of migrations.slice(0, end)) {
                await legacy.exec(migration.sql.join('\n'));
                await legacy.query('INSERT INTO drizzle.drizzle_migrations(hash,created_at) VALUES($1,$2)', [migration.hash, migration.folderMillis]);
            }
            await legacy.exec(`INSERT INTO connections(id,organization_id,name,type,engine,updated_at) VALUES ('conn','org','test','sqlite','sqlite',now());
                INSERT INTO knowledge_models(id,organization_id,name) VALUES('kb','org','Local');
                INSERT INTO knowledge_verified_queries(id,knowledge_model_id,source_connection_id,title,question,sql) VALUES('kvq_old','kb','conn','Local SQL','Count?','SELECT 72');`);
        } finally {
            await legacy.close();
        }
        for (let boot = 0; boot < 2; boot++) {
            await migratePgliteDB();
            const repo = new PostgresKnowledgeRepository();
            await repo.init((await getPgliteClient()) as unknown as PostgresDBClient);
            assert.equal((await repo.getVerifiedQuery({ organizationId: 'org', knowledgeModelId: 'kb', id: 'kvq_old' })).sql, 'SELECT 72');
            await resetPgliteClient();
        }
    } finally {
        await resetPgliteClient();
        if (previous === undefined) delete process.env.PGLITE_DB_PATH;
        else process.env.PGLITE_DB_PATH = previous;
        await rm(directory, { recursive: true, force: true });
    }
});
