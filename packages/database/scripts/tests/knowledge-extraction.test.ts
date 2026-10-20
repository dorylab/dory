import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { readFile, mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import type { PostgresDBClient } from '@dory/shared';
import { PostgresKnowledgeRepository } from '../../src/postgres/impl/knowledge';
import { createOssieDocument } from '../../src/postgres/impl/knowledge/ossie';
import { connections, knowledgeSources, knowledgeConnectors } from '../../src/postgres/schemas';
import { knowledgeExtractionJobs } from '../../src/postgres/schemas/knowledge-extraction';
import type { ExtractedKnowledge } from '../../src/postgres/schemas/knowledge-extraction';

const payload: ExtractedKnowledge = { kind: 'business_rule', name: 'Reporting timezone', description: 'Reports use UTC.', aliases: [], sourceConnectionId: null };
async function migrateFixture(db: PostgresDBClient, folder: string, run: (folder: string) => Promise<void>, legacy: boolean) {
    if (!legacy) return run(folder);
    const partial = await mkdtemp(path.join(tmpdir(), 'dory-extraction-upgrade-'));
    try {
        const journal = JSON.parse(await readFile(path.join(folder, 'meta/_journal.json'), 'utf8'));
        journal.entries = journal.entries.filter((entry: { tag: string }) => !entry.tag.startsWith('0034_'));
        await mkdir(path.join(partial, 'meta'));
        await writeFile(path.join(partial, 'meta/_journal.json'), JSON.stringify(journal));
        for (const entry of journal.entries) await copyFile(path.join(folder, `${entry.tag}.sql`), path.join(partial, `${entry.tag}.sql`));
        await run(partial);
        await db.execute(
            sql`INSERT INTO knowledge_models (id, organization_id, name, model_json) VALUES ('legacy-model', 'org', 'Before extraction', ${JSON.stringify(createOssieDocument('Before extraction', null, 'conn'))}::jsonb)`,
        );
        await db.execute(
            sql`INSERT INTO knowledge_connectors (id, organization_id, knowledge_model_id, provider, repository_id) VALUES ('legacy-github', 'org', 'legacy-model', 'github', 'legacy-repo')`,
        );
        await db.execute(
            sql`INSERT INTO knowledge_connectors (id, organization_id, knowledge_model_id, provider, linear_workspace_id, project_ids) VALUES ('legacy-linear', 'org', 'legacy-model', 'linear', 'workspace', '["project"]'::jsonb)`,
        );
        await db.execute(
            sql`INSERT INTO knowledge_sources (id, organization_id, knowledge_model_id, file_name, format, content_text, byte_size) VALUES ('legacy-source', 'org', 'legacy-model', 'legacy.md', 'markdown', 'Preserved content', 17)`,
        );
        await run(folder);
    } finally {
        await rm(partial, { recursive: true, force: true });
    }
}
async function fixture(legacy = false) {
    let db: PostgresDBClient, close: () => Promise<void>;
    const url = process.env.DORY_EXTRACTION_TEST_POSTGRES_URL;
    if (url) {
        const name = `extraction_${randomUUID().replaceAll('-', '')}`;
        const admin = new Pool({ connectionString: url });
        await admin.query(`CREATE DATABASE ${name}`);
        const target = new URL(url);
        target.pathname = `/${name}`;
        const pool = new Pool({ connectionString: target.toString() });
        db = drizzlePg(pool);
        await migrateFixture(db, new URL('../../src/postgres/migrations', import.meta.url).pathname, folder => migratePg(db, { migrationsFolder: folder }), legacy);
        close = async () => {
            await pool.end();
            await admin.query(`DROP DATABASE ${name}`);
            await admin.end();
        };
    } else {
        const client = new PGlite();
        db = drizzle(client) as unknown as PostgresDBClient;
        await migrateFixture(
            db,
            new URL('../../src/pglite/migrations', import.meta.url).pathname,
            folder => migrate(db as unknown as ReturnType<typeof drizzle>, { migrationsFolder: folder }),
            legacy,
        );
        close = () => client.close();
    }
    await db.insert(connections).values({ id: 'conn', organizationId: 'org', type: 'sqlite', engine: 'sqlite', name: 'Synthetic', database: 'main' });
    const repo = new PostgresKnowledgeRepository();
    await repo.init(db);
    const model = await repo.createModel({ organizationId: 'org', name: 'Model', connectionIds: ['conn'] });
    const connector = await repo.createConnector({
        organizationId: 'org',
        knowledgeModelId: model.id,
        installationId: '1',
        repositoryId: '2',
        repositoryFullName: 'dory/test',
        defaultBranch: 'main',
        rootPath: '',
        createdBy: 'admin',
    });
    const scope = { organizationId: 'org', knowledgeModelId: model.id };
    const sync = (body = 'Reports use UTC.', sha = body) => repo.applyConnectorSnapshot({ connectorId: connector.id, files: [{ path: 'rules.md', sha, contentText: body }] });
    return { db, close, repo, model, connector, scope, sync };
}
test('0034 migrations match and are included in the compiled PGlite bundle', async () => {
    const sql = await readFile(new URL('../../src/postgres/migrations/0034_knowledge_extraction.sql', import.meta.url), 'utf8');
    assert.equal(sql, await readFile(new URL('../../src/pglite/migrations/0034_knowledge_extraction.sql', import.meta.url), 'utf8'));
    const bundle = JSON.parse(await readFile(new URL('../../src/pglite/migrations.json', import.meta.url), 'utf8'));
    assert.ok(JSON.stringify(bundle).includes('knowledge_extraction_jobs'));
});
test('sync commits independent deduplicated extraction jobs; only reviewed rules become searchable', async () => {
    const f = await fixture();
    try {
        assert.equal(f.connector.autoExtract, true);
        await f.sync();
        await f.sync();
        assert.equal((await f.repo.extraction.status(f.scope)).jobs.length, 1);
        const job = await f.repo.extraction.claim();
        assert.ok(job);
        assert.equal(await f.repo.extraction.claim(), null);
        await f.repo.extraction.complete(job.id, job.leaseToken!, [{ payload, quotes: ['Reports use UTC.'] }]);
        assert.equal((await f.repo.extraction.listRules(f.scope)).length, 0);
        const [draft] = await f.repo.extraction.listCandidates(f.scope);
        assert.ok(draft);
        await assert.rejects(f.repo.extraction.review({ ...f.scope, organizationId: 'other', candidateId: draft.id, userId: 'admin', decision: 'approve' }), /not found/);
        const result = await f.repo.extraction.review({ ...f.scope, candidateId: draft.id, userId: 'admin', decision: 'approve' });
        const [rule] = await f.repo.extraction.listRules(f.scope);
        assert.equal(rule.id, result.assetId);
        assert.equal(rule.evidence[0].quote, 'Reports use UTC.');
        assert.equal((await f.repo.getGraph(f.scope)).sourceAssetEdges[0].assetType, 'business_rule');
        await f.sync('Reports use local time.');
        assert.equal((await f.repo.extraction.listRules(f.scope))[0].sourceState, 'outdated');
        assert.equal((await f.repo.extraction.listRules(f.scope))[0].payload.description, 'Reports use UTC.');
        assert.ok((await f.repo.extraction.listCandidates(f.scope)).some(c => c.action === 'source_changed'));
        await f.repo.applyConnectorSnapshot({ connectorId: f.connector.id, files: [] });
        const [retained] = await f.repo.extraction.listRules(f.scope);
        assert.equal(retained.id, rule.id);
        assert.equal(retained.evidence[0].state, 'missing');
        assert.equal(retained.evidence[0].sourceId, null);
        assert.ok((await f.repo.extraction.listCandidates(f.scope)).some(c => c.action === 'remove'));
    } finally {
        await f.close();
    }
});
test('partial output, stale tasks, disable, disconnect and rejected versions cannot publish new drafts', async () => {
    const f = await fixture();
    try {
        await f.sync();
        const job = await f.repo.extraction.claim();
        assert.ok(job);
        await assert.rejects(
            f.repo.extraction.complete(job.id, job.leaseToken!, [
                { payload, quotes: ['Reports use UTC.'] },
                { payload, quotes: ['invented evidence'] },
            ]),
            /evidence/,
        );
        assert.equal((await f.repo.extraction.listCandidates(f.scope)).length, 0);
        await f.repo.extraction.configure({ ...f.scope, connectorId: f.connector.id, enabled: false });
        await assert.rejects(f.repo.extraction.complete(job.id, job.leaseToken!, [{ payload, quotes: ['Reports use UTC.'] }]));
        await f.repo.extraction.configure({ ...f.scope, connectorId: f.connector.id, enabled: true });
        const retry = await f.repo.extraction.claim();
        assert.ok(retry);
        await f.repo.extraction.complete(retry.id, retry.leaseToken!, [{ payload, quotes: ['Reports use UTC.'] }]);
        const [draft] = await f.repo.extraction.listCandidates(f.scope);
        await f.repo.extraction.review({ ...f.scope, candidateId: draft.id, userId: 'admin', decision: 'reject' });
        await f.sync();
        assert.equal(await f.repo.extraction.claim(), null);
        assert.equal((await f.repo.extraction.listCandidates(f.scope)).length, 0);
        await f.sync('Reports use UTC. New revision.');
        const stale = await f.repo.extraction.claim();
        assert.ok(stale);
        await f.sync('Reports use UTC. Another revision.');
        await assert.rejects(f.repo.extraction.complete(stale.id, stale.leaseToken!, [{ payload, quotes: ['Reports use UTC.'] }]));
        const running = await f.repo.extraction.claim();
        assert.ok(running);
        await f.repo.deleteConnector({ organizationId: 'org', connectorId: f.connector.id });
        await assert.rejects(f.repo.extraction.complete(running.id, running.leaseToken!, []));
    } finally {
        await f.close();
    }
});
test('review fences source and published revisions; metric approval preserves the model and target ID', async () => {
    const f = await fixture();
    try {
        const metric: ExtractedKnowledge = { ...payload, kind: 'metric', name: 'Net revenue', description: 'Net revenue excludes refunds.', sourceConnectionId: 'conn' };
        await f.sync(metric.description);
        const job = await f.repo.extraction.claim();
        assert.ok(job);
        await f.repo.extraction.complete(job.id, job.leaseToken!, [{ payload: metric, quotes: [metric.description] }]);
        const [draft] = await f.repo.extraction.listCandidates(f.scope);
        await assert.rejects(
            f.repo.extraction.review({ ...f.scope, candidateId: draft.id, decision: 'approve', userId: 'admin', payload: { ...metric, sourceConnectionId: 'other' } }),
            /not linked/,
        );
        const approved = await f.repo.extraction.review({ ...f.scope, candidateId: draft.id, decision: 'approve', userId: 'admin' });
        const model = await f.repo.getModel(f.scope);
        assert.ok(model.model.definitions.some(d => d.id === approved.assetId && d.status === 'verified'));
        assert.equal(model.businessContextMd, f.model.businessContextMd);
        await f.sync('New revenue policy.');
        const [change] = await f.repo.extraction.listCandidates(f.scope);
        await f.repo.saveDefinitions({ ...f.scope, definitions: model.model.definitions.map(d => ({ ...d, description: 'Human edit' })) });
        await assert.rejects(f.repo.extraction.review({ ...f.scope, candidateId: change.id, decision: 'archive', userId: 'admin' }), /changed/);
        assert.ok((await f.repo.getModel(f.scope)).model.definitions.some(d => d.id === approved.assetId && d.description === 'Human edit'));
    } finally {
        await f.close();
    }
});
test('expired leases recover, temporary failures stop after five attempts and retry resets the round', async () => {
    const f = await fixture();
    try {
        await f.sync();
        let job = await f.repo.extraction.claim();
        assert.ok(job);
        await f.db
            .update(knowledgeExtractionJobs)
            .set({ leaseExpiresAt: new Date(0) })
            .where(eq(knowledgeExtractionJobs.id, job.id));
        const recovered = await f.repo.extraction.claim();
        assert.ok(recovered);
        assert.notEqual(recovered.leaseToken, job.leaseToken);
        await f.db.update(knowledgeExtractionJobs).set({ attempts: 5 }).where(eq(knowledgeExtractionJobs.id, recovered.id));
        await f.repo.extraction.fail(recovered.id, recovered.leaseToken!, 'temporary', true);
        assert.equal((await f.repo.extraction.status(f.scope)).jobs[0].status, 'failed');
        await f.repo.extraction.retry(f.scope);
        job = await f.repo.extraction.claim();
        assert.ok(job);
        await f.repo.extraction.fail(job.id, job.leaseToken!, 'AI_QUOTA_EXCEEDED', false, true);
        assert.equal((await f.repo.extraction.status(f.scope)).jobs[0].status, 'blocked');
        assert.equal(await f.repo.extraction.claim(), null);
        await f.repo.extraction.retry(f.scope);
        job = await f.repo.extraction.claim();
        assert.ok(job);
        assert.equal(job.attempts, 1);
        await f.db
            .update(knowledgeExtractionJobs)
            .set({ attempts: 5, leaseExpiresAt: new Date(0) })
            .where(eq(knowledgeExtractionJobs.id, job.id));
        assert.equal(await f.repo.extraction.claim(), null);
        assert.equal((await f.repo.extraction.status(f.scope)).jobs[0].status, 'failed');
        assert.equal((await f.db.select().from(knowledgeSources)).length, 1);
    } finally {
        await f.close();
    }
});

test('identical cross-document candidates merge evidence; divergent definitions require individual review', async () => {
    const f = await fixture();
    try {
        await f.repo.applyConnectorSnapshot({
            connectorId: f.connector.id,
            files: [
                { path: 'one.md', sha: 'a', contentText: 'Reports use UTC.' },
                { path: 'two.md', sha: 'b', contentText: 'Reports use UTC.' },
                { path: 'three.md', sha: 'c', contentText: 'Reports use local time.' },
            ],
        });
        const claims = await Promise.all([f.repo.extraction.claim(), f.repo.extraction.claim()]);
        assert.ok(claims[0] && claims[1]);
        assert.notEqual(claims[0].id, claims[1].id, 'concurrent workers cannot claim the same job');
        for (const job of claims) await f.repo.extraction.complete(job!.id, job!.leaseToken!, [{ payload, quotes: ['Reports use UTC.'] }]);
        let drafts = await f.repo.extraction.listCandidates(f.scope);
        assert.equal(drafts.length, 1);
        assert.equal(drafts[0].evidence.length, 2);
        const third = await f.repo.extraction.claim();
        assert.ok(third);
        await f.repo.extraction.complete(third.id, third.leaseToken!, [{ payload: { ...payload, description: 'Reports use local time.' }, quotes: ['Reports use local time.'] }]);
        drafts = await f.repo.extraction.listCandidates(f.scope);
        assert.equal(drafts.length, 2);
        assert.ok(drafts.every(d => d.action === 'conflict'));
        await assert.rejects(f.repo.extraction.review({ ...f.scope, candidateId: drafts[0].id, userId: 'admin', decision: 'approve' }), /explicit target/);
        const result = await f.repo.extraction.review({ ...f.scope, candidateId: drafts[0].id, userId: 'admin', decision: 'approve', createNew: true });
        assert.ok(result.assetId);
        assert.equal((await f.repo.extraction.listRules(f.scope)).length, 1);
    } finally {
        await f.close();
    }
});

test('upgrading an existing 0033 database retains sources and keeps both providers opted out', async () => {
    const f = await fixture(true);
    try {
        const connectors = await f.db.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.knowledgeModelId, 'legacy-model'));
        assert.equal(connectors.length, 2);
        assert.ok(connectors.every(c => c.autoExtract === false));
        assert.deepEqual(connectors.find(c => c.provider === 'linear')!.projectIds, ['project']);
        assert.equal((await f.db.select().from(knowledgeSources).where(eq(knowledgeSources.id, 'legacy-source')))[0].contentText, 'Preserved content');
        assert.equal((await f.repo.extraction.status({ organizationId: 'org', knowledgeModelId: 'legacy-model' })).jobs.length, 0);
    } finally {
        await f.close();
    }
});

test('active scoped business rules prevent unlinking their model data source', async () => {
    const f = await fixture();
    try {
        await f.db.insert(connections).values({ id: 'conn-two', organizationId: 'org', type: 'sqlite', engine: 'sqlite', name: 'Second', database: 'main' });
        await f.repo.addDataSource({ ...f.scope, connectionId: 'conn-two' });
        await f.sync();
        const job = await f.repo.extraction.claim();
        await f.repo.extraction.complete(job!.id, job!.leaseToken!, [{ payload: { ...payload, sourceConnectionId: 'conn-two' }, quotes: ['Reports use UTC.'] }]);
        const [draft] = await f.repo.extraction.listCandidates(f.scope);
        const { assetId } = await f.repo.extraction.review({ ...f.scope, candidateId: draft.id, userId: 'admin', decision: 'approve' });
        await assert.rejects(f.repo.removeDataSource({ ...f.scope, connectionId: 'conn-two' }), /business rules/);
        await assert.rejects(f.repo.replaceDataSources({ ...f.scope, connectionIds: ['conn'] }), /business rules/);
        await f.repo.extraction.updateRule({ ...f.scope, id: assetId!, expectedRevision: 1, userId: 'admin', archived: true });
        await f.repo.removeDataSource({ ...f.scope, connectionId: 'conn-two' });
    } finally {
        await f.close();
    }
});

test('new evidence for published knowledge stays private until reviewed and merges existing evidence on approval', async () => {
    const f = await fixture();
    try {
        await f.sync();
        const first = await f.repo.extraction.claim();
        await f.repo.extraction.complete(first!.id, first!.leaseToken!, [{ payload, quotes: ['Reports use UTC.'] }]);
        const [initial] = await f.repo.extraction.listCandidates(f.scope);
        const published = await f.repo.extraction.review({ ...f.scope, candidateId: initial.id, decision: 'approve', userId: 'admin' });
        await f.repo.applyConnectorSnapshot({
            connectorId: f.connector.id,
            files: [
                { path: 'rules.md', sha: 'Reports use UTC.', contentText: 'Reports use UTC.' },
                { path: 'corroboration.md', sha: 'new', contentText: 'Reports use UTC.' },
            ],
        });
        const second = await f.repo.extraction.claim();
        await f.repo.extraction.complete(second!.id, second!.leaseToken!, [{ payload, quotes: ['Reports use UTC.'] }]);
        const [draft] = await f.repo.extraction.listCandidates(f.scope);
        assert.equal(draft.action, 'update');
        assert.equal(draft.evidence.length, 2);
        assert.ok(draft.evidence.every(e => e.assetId === null));
        assert.equal((await f.repo.extraction.listRules(f.scope))[0].evidence.length, 1, 'Agent-visible evidence cannot change before review');
        await f.repo.extraction.review({
            ...f.scope,
            candidateId: draft.id,
            decision: 'approve',
            targetAssetId: published.assetId!,
            expectedTargetRevision: draft.targetRevision!,
            userId: 'admin',
        });
        const [rule] = await f.repo.extraction.listRules(f.scope);
        assert.equal(rule.id, published.assetId);
        assert.equal(rule.evidence.length, 2);
    } finally {
        await f.close();
    }
});

test('a changed document cannot discard a merged draft still supported by an unchanged document', async () => {
    const f = await fixture();
    try {
        const files = [
            { path: 'one.md', sha: 'utc-a', contentText: 'Reports use UTC.' },
            { path: 'two.md', sha: 'utc-b', contentText: 'Reports use UTC.' },
        ];
        await f.repo.applyConnectorSnapshot({ connectorId: f.connector.id, files });
        for (let i = 0; i < 2; i++) {
            const job = await f.repo.extraction.claim();
            await f.repo.extraction.complete(job!.id, job!.leaseToken!, [{ payload, quotes: ['Reports use UTC.'] }]);
        }
        assert.equal((await f.repo.extraction.listCandidates(f.scope))[0].evidence.length, 2);
        await f.repo.applyConnectorSnapshot({ connectorId: f.connector.id, files: [{ ...files[0], sha: 'local', contentText: 'Reports use local time.' }, files[1]] });
        const [retained] = await f.repo.extraction.listCandidates(f.scope);
        assert.equal(retained.payload.description, payload.description);
        assert.equal(retained.evidence.length, 1);
        assert.ok(retained.evidence.every(e => e.state === 'current'));
        const changed = await f.repo.extraction.claim();
        await f.repo.extraction.complete(changed!.id, changed!.leaseToken!, [
            { payload: { ...payload, description: 'Reports use local time.' }, quotes: ['Reports use local time.'] },
        ]);
        const conflicts = await f.repo.extraction.listCandidates(f.scope);
        assert.equal(conflicts.length, 2);
        assert.ok(conflicts.every(c => c.action === 'conflict'));
    } finally {
        await f.close();
    }
});
