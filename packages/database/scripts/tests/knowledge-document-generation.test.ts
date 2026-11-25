import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { PostgresDBClient } from '@dory/shared';
import type { DocumentDraft, DocumentGenerationInput } from '@dory/shared/types/knowledge-document-draft';
import { PGlite } from '@electric-sql/pglite';
import { eq, sql } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';

import { PostgresKnowledgeRepository } from '../../src/postgres/impl/knowledge';
import { connections, knowledgeDocumentGenerationTasks as tasks, knowledgeSources } from '../../src/postgres/schemas';

async function fixture() {
    let db: PostgresDBClient, close: () => Promise<void>;
    const url = process.env.DORY_GENERATION_TEST_POSTGRES_URL;
    if (url) {
        const name = 'generation_' + randomUUID().replaceAll('-', '');
        const admin = new Pool({ connectionString: url });
        await admin.query(`CREATE DATABASE ${name}`);
        const target = new URL(url);
        target.pathname = '/' + name;
        const pool = new Pool({ connectionString: target.toString() });
        db = drizzlePg(pool);
        await migratePg(db, { migrationsFolder: new URL('../../src/postgres/migrations', import.meta.url).pathname });
        close = async () => {
            await pool.end();
            await admin.query(`DROP DATABASE ${name}`);
            await admin.end();
        };
    } else {
        const client = new PGlite();
        const pglite = drizzle(client);
        await migrate(pglite, { migrationsFolder: new URL('../../src/pglite/migrations', import.meta.url).pathname });
        db = pglite as unknown as PostgresDBClient;
        close = () => client.close();
    }
    await db.insert(connections).values({ id: 'conn', organizationId: 'org', type: 'sqlite', engine: 'sqlite', name: 'Test', database: 'main' });
    const repo = new PostgresKnowledgeRepository();
    await repo.init(db);
    const model = await repo.createModel({ organizationId: 'org', name: 'Model', connectionIds: ['conn'] });
    const input: DocumentGenerationInput = {
        knowledgeModelId: model.id,
        connectionId: 'conn',
        database: 'main',
        tables: ['orders'],
        prompt: '',
        documentIds: [],
        queryIds: [],
        locale: 'en',
    };
    const owner = { organizationId: 'org', userId: 'author' };
    const enqueue = (id = randomUUID()) => repo.documentGeneration.enqueue({ id, ...owner, input, folderId: null, executionContext: 'encrypted-context' });
    return { db, repo, owner, input, enqueue, close };
}
const draft: DocumentDraft = {
    topics: [
        {
            name: 'Commerce',
            documents: [
                {
                    fileName: 'Guide.md',
                    contentText: '# Orders',
                    proof: 'signed',
                    evidence: { database: 'main', tables: [{ name: 'orders', digest: 'a'.repeat(64) }], references: [] },
                },
            ],
        },
    ],
    failedTables: [],
};

test('generation migrations match and task summaries isolate owners without exposing credentials or drafts', async () => {
    const file = '0049_knowledge_document_generation_tasks.sql';
    assert.equal(
        await readFile(new URL('../../src/pglite/migrations/' + file, import.meta.url), 'utf8'),
        await readFile(new URL('../../src/postgres/migrations/' + file, import.meta.url), 'utf8'),
    );
    const f = await fixture();
    try {
        const task = await f.enqueue();
        const again = await f.enqueue(task.id);
        assert.equal(again.id, task.id);
        assert.equal((await f.repo.documentGeneration.list(f.owner)).length, 1);
        assert.deepEqual(await f.repo.documentGeneration.list({ ...f.owner, userId: 'other' }), []);
        await assert.rejects(f.repo.documentGeneration.get({ ...f.owner, organizationId: 'other', id: task.id }), /not found/);
        await assert.rejects(f.repo.documentGeneration.get({ ...f.owner, userId: 'other', id: task.id }), /not found/);
        const text = JSON.stringify(await f.repo.documentGeneration.list(f.owner));
        assert.ok(!text.includes('executionContext') && !text.includes('encrypted-context') && !text.includes('"draft"') && !text.includes('"input"'));
        await assert.rejects(
            f.repo.documentGeneration.enqueue({ ...f.owner, id: task.id, input: { ...f.input, prompt: 'different' }, folderId: null, executionContext: null }),
            /Invalid/,
        );
        await assert.rejects(
            f.repo.documentGeneration.enqueue({ ...f.owner, id: randomUUID(), input: f.input, folderId: 'deleted-folder', executionContext: null }),
            /local folder/,
        );
    } finally {
        await f.close();
    }
});

test('concurrent workers claim once and expired leases recover while stale workers cannot write', async () => {
    const f = await fixture();
    try {
        const first = await f.enqueue();
        const claims = await Promise.all([f.repo.documentGeneration.claim(), f.repo.documentGeneration.claim()]);
        const claimed = claims.find(row => row !== null)!;
        assert.equal(claims.filter(Boolean).length, 1);
        assert.equal(claimed.id, first.id);
        await f.repo.documentGeneration.heartbeat(claimed.id, claimed.leaseToken!, { phase: 'reading', completedTables: 1 });
        assert.equal((await f.repo.documentGeneration.get({ ...f.owner, id: first.id })).completedTables, 1);
        await f.db
            .update(tasks)
            .set({ leaseExpiresAt: sql`clock_timestamp() - interval '1 second'` })
            .where(eq(tasks.id, first.id));
        await assert.rejects(f.repo.documentGeneration.heartbeat(first.id, claimed.leaseToken!), /expired/);
        const recovered = await f.repo.documentGeneration.claim();
        assert.equal(recovered?.id, first.id);
        assert.equal(recovered?.attempts, 2);
        assert.notEqual(recovered?.leaseToken, claimed.leaseToken);
        await f.repo.documentGeneration.complete(first.id, claimed.leaseToken!, draft);
        await f.repo.documentGeneration.fail(first.id, claimed.leaseToken!, 'stale error');
        assert.equal((await f.repo.documentGeneration.get({ ...f.owner, id: first.id })).status, 'running');
        await f.repo.documentGeneration.complete(first.id, recovered!.leaseToken!, draft);
        const ready = await f.repo.documentGeneration.get({ ...f.owner, id: first.id });
        assert.equal(ready.status, 'ready');
        assert.deepEqual(ready.draft, draft);
        const [row] = await f.db.select().from(tasks).where(eq(tasks.id, first.id));
        assert.equal(row.executionContext, null);
        assert.equal(await f.repo.documentGeneration.claim(), null);
        const second = await f.enqueue();
        const repeated = await f.repo.documentGeneration.claim();
        await f.db
            .update(tasks)
            .set({ attempts: 5, leaseExpiresAt: sql`clock_timestamp() - interval '1 second'` })
            .where(eq(tasks.id, second.id));
        assert.equal(await f.repo.documentGeneration.claim(), null);
        assert.equal((await f.repo.documentGeneration.get({ ...f.owner, id: repeated!.id })).status, 'failed');
    } finally {
        await f.close();
    }
});

test('failed table details survive and retry submissions are idempotent', async () => {
    const f = await fixture();
    try {
        const task = await f.enqueue();
        const job = await f.repo.documentGeneration.claim();
        await f.repo.documentGeneration.complete(task.id, job!.leaseToken!, { topics: [], failedTables: ['restricted'] });
        assert.deepEqual((await f.repo.documentGeneration.get({ ...f.owner, id: task.id })).draft?.failedTables, ['restricted']);
        const retry = { ...f.owner, id: task.id, submissionId: randomUUID(), input: f.input, folderId: null, executionContext: 'new-context', retry: true };
        await Promise.all([f.repo.documentGeneration.enqueue(retry), f.repo.documentGeneration.enqueue(retry)]);
        const running = await f.repo.documentGeneration.claim();
        assert.equal(running!.attempts, 1);
        await f.repo.documentGeneration.enqueue(retry);
        assert.equal((await f.repo.documentGeneration.get({ ...f.owner, id: task.id })).status, 'running');
        await assert.rejects(f.repo.documentGeneration.enqueue({ ...retry, submissionId: randomUUID() }), /Only failed/);
        await f.repo.documentGeneration.fail(task.id, running!.leaseToken!, 'GENERATION_FAILED');
        assert.equal((await f.repo.documentGeneration.get({ ...f.owner, id: task.id })).status, 'failed');
    } finally {
        await f.close();
    }
});

test('reviewed save updates task atomically, rejects invalid scope and creates documents only once', async () => {
    const f = await fixture();
    try {
        const task = await f.enqueue();
        const job = await f.repo.documentGeneration.claim();
        const save = {
            organizationId: f.owner.organizationId,
            knowledgeModelId: f.input.knowledgeModelId,
            connectionId: 'conn',
            createdBy: f.owner.userId,
            batchId: task.id,
            taskId: task.id,
            folderId: null,
            elapsedMs: 1,
            topics: draft.topics,
        };
        await assert.rejects(f.repo.createDocumentBatch(save), /Invalid/);
        await f.repo.documentGeneration.complete(task.id, job!.leaseToken!, draft);
        await assert.rejects(f.repo.createDocumentBatch({ ...save, folderId: 'deleted-folder' }), /local folder/);
        assert.equal((await f.repo.documentGeneration.get({ ...f.owner, id: task.id })).status, 'ready');
        assert.equal((await f.db.select().from(knowledgeSources).where(eq(knowledgeSources.generationBatchId, task.id))).length, 0);
        await assert.rejects(f.repo.createDocumentBatch({ ...save, createdBy: 'other' }), /Invalid/);
        await assert.rejects(f.repo.createDocumentBatch({ ...save, batchId: randomUUID() }), /Invalid/);
        const [one, two] = await Promise.all([f.repo.createDocumentBatch(save), f.repo.createDocumentBatch(save)]);
        assert.deepEqual(one, two);
        assert.equal((await f.db.select().from(knowledgeSources).where(eq(knowledgeSources.generationBatchId, task.id))).length, 1);
        const stored = await f.repo.documentGeneration.get({ ...f.owner, id: task.id });
        assert.equal(stored.status, 'saved');
        assert.deepEqual(stored.documents, one);
    } finally {
        await f.close();
    }
});
