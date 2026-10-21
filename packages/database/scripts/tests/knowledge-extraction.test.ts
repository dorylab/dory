import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { PostgresDBClient } from '@dory/shared';
import { PGlite } from '@electric-sql/pglite';
import { eq, sql } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';

import { PostgresKnowledgeRepository } from '../../src/postgres/impl/knowledge';
import { createOssieDocument } from '../../src/postgres/impl/knowledge/ossie';
import { connections, knowledgeConnectors, knowledgeSources } from '../../src/postgres/schemas';
import { knowledgeExtractionJobs } from '../../src/postgres/schemas/knowledge-extraction';
import type { ExtractedKnowledge } from '../../src/postgres/schemas/knowledge-extraction';

const payload: ExtractedKnowledge = { kind: 'business_rule', name: 'Reporting timezone', description: 'Reports use UTC.', aliases: [], sourceConnectionId: null };
async function migrateFixture(db: PostgresDBClient, folder: string, run: (folder: string) => Promise<void>, legacy: boolean | '0034') {
    if (!legacy) return run(folder);
    const partial = await mkdtemp(path.join(tmpdir(), 'dory-extraction-upgrade-'));
    try {
        const journal = JSON.parse(await readFile(path.join(folder, 'meta/_journal.json'), 'utf8'));
        journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag < (legacy === '0034' ? '0035_' : '0034_'));
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
        if (legacy === '0034') {
            await db.execute(
                sql`INSERT INTO knowledge_business_rules (id, organization_id, knowledge_model_id, payload, revision) VALUES ('existing-rule', 'org', 'legacy-model', ${JSON.stringify(payload)}::jsonb, 7)`,
            );
            await db.execute(
                sql`INSERT INTO knowledge_business_rules (id, organization_id, knowledge_model_id, payload) VALUES ('scoped-rule', 'org', 'legacy-model', ${JSON.stringify({ ...payload, sourceConnectionId: 'conn' })}::jsonb)`,
            );
            await db.execute(
                sql`INSERT INTO knowledge_candidates (id, organization_id, knowledge_model_id, item_key, payload_hash, payload) VALUES ('old-draft', 'org', 'legacy-model', 'old', 'old', ${JSON.stringify(payload)}::jsonb)`,
            );
        }
        await run(folder);
    } finally {
        await rm(partial, { recursive: true, force: true });
    }
}
async function fixture(legacy: boolean | '0034' = false) {
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

test('0035 matches both engines and upgrades reviewed rules without changing IDs or published content', async () => {
    const pg = await readFile(new URL('../../src/postgres/migrations/0035_knowledge_rule_scopes.sql', import.meta.url), 'utf8');
    assert.equal(pg, await readFile(new URL('../../src/pglite/migrations/0035_knowledge_rule_scopes.sql', import.meta.url), 'utf8'));
    const bundle = JSON.parse(await readFile(new URL('../../src/pglite/migrations.json', import.meta.url), 'utf8'));
    assert.ok(JSON.stringify(bundle).includes('knowledge_metric_rules'));
    const f = await fixture();
    try {
        const columns = await f.db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'knowledge_business_rules'`);
        assert.ok(columns.rows.some(c => c.column_name === 'application_scope'));
    } finally {
        await f.close();
    }
});

test('staging preserves old drafts until a complete model organization commits; failures and stale snapshots cannot discard them', async () => {
    const f = await fixture();
    try {
        await f.sync();
        const sourceJob = await f.repo.extraction.claim();
        await f.repo.extraction.organization.stage(sourceJob!.id, sourceJob!.leaseToken!, [{ payload, quotes: ['Reports use UTC.'] }]);
        assert.equal((await f.repo.extraction.listCandidates(f.scope)).length, 0);
        let job = await f.repo.extraction.organization.claim();
        assert.ok(job);
        assert.equal(await f.repo.extraction.organization.claim(), null);
        let snapshot = await f.repo.extraction.organization.snapshot(f.scope);
        await assert.rejects(f.repo.extraction.organization.complete(job.id, job.leaseToken!, snapshot.fingerprint, []), /dropped/);
        assert.equal((await f.repo.extraction.listCandidates(f.scope)).length, 0);
        await f.repo.extraction.organization.complete(
            job.id,
            job.leaseToken!,
            snapshot.fingerprint,
            snapshot.items.map(i => ({ payload: i.payload, inputIds: [i.id] })),
        );
        const [old] = await f.repo.extraction.listCandidates(f.scope);
        await f.repo.extraction.organization.request(f.scope);
        job = await f.repo.extraction.organization.claim();
        snapshot = await f.repo.extraction.organization.snapshot(f.scope);
        await f.repo.extraction.review({ ...f.scope, candidateId: old.id, userId: 'admin', decision: 'reject' });
        assert.equal(
            await f.repo.extraction.organization.complete(
                job!.id,
                job!.leaseToken!,
                snapshot.fingerprint,
                snapshot.items.map(i => ({ payload: i.payload, inputIds: [i.id] })),
            ),
            false,
        );
        assert.equal((await f.repo.extraction.listCandidates(f.scope)).length, 0);
        assert.equal((await f.repo.extraction.listCandidates({ ...f.scope, status: 'rejected' }))[0].id, old.id);
        await assert.rejects(f.repo.extraction.organization.request({ ...f.scope, organizationId: 'other' }), /not found/);
    } finally {
        await f.close();
    }
});

test('shared rule dependencies publish atomically and keep official metric IDs and SQL stable', async () => {
    const f = await fixture();
    try {
        const metric: ExtractedKnowledge = {
            ...payload,
            kind: 'metric',
            name: 'Revenue',
            description: 'Revenue sums paid orders.',
            sourceConnectionId: 'conn',
            expression: 'SUM(net_amount)',
        };
        const shared: ExtractedKnowledge = {
            ...payload,
            name: 'Failed order exclusion',
            description: 'Exclude failed orders from revenue.',
            applicationScope: 'metrics',
            applicableMetricNames: ['Revenue'],
            sharingEvidence: 'Exclude failed orders from revenue.',
        };
        const body = `${metric.description}\n${shared.description}`;
        await f.sync(body);
        const sourceJob = await f.repo.extraction.claim();
        await f.repo.extraction.organization.stage(sourceJob!.id, sourceJob!.leaseToken!, [
            { payload: metric, quotes: [metric.description] },
            { payload: shared, quotes: [shared.description] },
        ]);
        const job = await f.repo.extraction.organization.claim();
        const snapshot = await f.repo.extraction.organization.snapshot(f.scope);
        await f.repo.extraction.organization.complete(job!.id, job!.leaseToken!, snapshot.fingerprint, [
            { payload: metric, inputIds: [snapshot.items[0].id], sharedRuleKeys: [(await import('../../src/postgres/impl/knowledge/extraction')).knowledgeHash(shared)] },
            { payload: shared, inputIds: [snapshot.items[1].id] },
        ]);
        const drafts = await f.repo.extraction.listCandidates(f.scope);
        const m = drafts.find(d => d.payload.kind === 'metric')!,
            r = drafts.find(d => d.payload.kind === 'business_rule')!;
        await assert.rejects(f.repo.extraction.review({ ...f.scope, candidateId: m.id, userId: 'admin', decision: 'approve' }), /together/);
        assert.equal((await f.repo.getModel(f.scope)).model.definitions.filter(d => d.kind === 'metric').length, 0);
        await assert.rejects(
            f.repo.extraction.reviewBundle({
                ...f.scope,
                userId: 'admin',
                items: [
                    { candidateId: m.id, payload: m.payload, createNew: true },
                    { candidateId: r.id, payload: { ...r.payload, metricIds: ['missing'] }, createNew: true },
                ],
            }),
            /metric|scope/,
        );
        assert.equal((await f.repo.getModel(f.scope)).model.definitions.filter(d => d.kind === 'metric').length, 0);
        await f.repo.extraction.reviewBundle({
            ...f.scope,
            userId: 'admin',
            items: [
                { candidateId: m.id, payload: m.payload, createNew: true },
                { candidateId: r.id, payload: r.payload, createNew: true },
            ],
        });
        const [official] = (await f.repo.getModel(f.scope)).model.definitions.filter(d => d.kind === 'metric');
        const [rule] = await f.repo.extraction.listRules(f.scope);
        assert.equal(rule.applicationScope, 'metrics');
        assert.deepEqual(rule.metricIds, [official.id]);
        assert.equal(official.expression, 'SUM(net_amount)');
        const { knowledgeHash } = await import('../../src/postgres/impl/knowledge/extraction');
        const before = knowledgeHash(official);
        await f.repo.extraction.updateRule({
            ...f.scope,
            id: rule.id,
            expectedRevision: rule.revision,
            userId: 'admin',
            payload: { ...rule.payload, description: 'Updated reviewed condition.' },
            expectedMetricRevisions: { [official.id]: before },
        });
        assert.equal(knowledgeHash((await f.repo.getModel(f.scope)).model.definitions.find(d => d.id === official.id)), before);
        await assert.rejects(f.repo.extraction.updateRule({ ...f.scope, id: rule.id, expectedRevision: rule.revision, userId: 'admin', payload: rule.payload }), /changed/);
        await assert.rejects(
            f.repo.extraction.updateMetricRules({ ...f.scope, metricId: official.id, expectedRevision: before, expectedReferenceIds: [], ruleIds: [], expectedRuleRevisions: {} }),
            /references changed/,
        );
        const [latest] = await f.repo.extraction.listRules(f.scope);
        await f.repo.extraction.updateMetricRules({
            ...f.scope,
            metricId: official.id,
            expectedRevision: before,
            expectedReferenceIds: [rule.id],
            ruleIds: [],
            expectedRuleRevisions: { [rule.id]: latest.revision },
        });
        assert.deepEqual((await f.repo.extraction.listRules(f.scope))[0].metricIds, []);
        await f.repo.saveDefinitions({ ...f.scope, definitions: (await f.repo.getModel(f.scope)).model.definitions.filter(d => d.kind !== 'metric') });
        assert.equal((await f.repo.extraction.listRules(f.scope))[0].id, rule.id);
    } finally {
        await f.close();
    }
});

test('rule scopes reject missing or foreign metrics; archived rules retain references without applying', async () => {
    const f = await fixture();
    try {
        await f.sync();
        const job = await f.repo.extraction.claim();
        await f.repo.extraction.complete(job!.id, job!.leaseToken!, [{ payload, quotes: ['Reports use UTC.'] }]);
        const [draft] = await f.repo.extraction.listCandidates(f.scope);
        await assert.rejects(
            f.repo.extraction.review({
                ...f.scope,
                candidateId: draft.id,
                userId: 'admin',
                decision: 'approve',
                payload: { ...payload, applicationScope: 'metrics', metricIds: ['foreign'] },
            }),
            /metric|scope/,
        );
        await assert.rejects(
            f.repo.extraction.review({ ...f.scope, candidateId: draft.id, userId: 'admin', decision: 'approve', payload: { ...payload, applicationScope: 'data_source' } }),
            /data source/,
        );
        await f.repo.extraction.review({ ...f.scope, candidateId: draft.id, userId: 'admin', decision: 'approve', payload: { ...payload, applicationScope: 'model' } });
        const [rule] = await f.repo.extraction.listRules(f.scope);
        await f.repo.extraction.updateRule({ ...f.scope, id: rule.id, expectedRevision: rule.revision, userId: 'admin', archived: true });
        assert.equal((await f.repo.extraction.listRules(f.scope)).length, 0);
        assert.equal((await f.repo.extraction.listRules({ ...f.scope, includeArchived: true }))[0].status, 'archived');
    } finally {
        await f.close();
    }
});

test('0034 to 0035 backfills scope and schedules one-time pending organization without enabling connectors', async () => {
    const f = await fixture('0034');
    try {
        const rows = await f.db.execute(sql`SELECT id, payload, revision, application_scope FROM knowledge_business_rules WHERE knowledge_model_id = 'legacy-model' ORDER BY id`);
        assert.equal(rows.rows[0].id, 'existing-rule');
        assert.equal(rows.rows[0].revision, 7);
        assert.deepEqual(rows.rows[0].payload, payload);
        assert.equal(rows.rows[0].application_scope, 'model');
        assert.equal(rows.rows[1].application_scope, 'data_source');
        const status = await f.repo.extraction.status({ organizationId: 'org', knowledgeModelId: 'legacy-model' });
        assert.equal(status.organizationJob?.status, 'queued');
        assert.ok(status.connectors.every(c => !c.autoExtract));
        assert.equal((await f.repo.extraction.listCandidates({ organizationId: 'org', knowledgeModelId: 'legacy-model' }))[0].id, 'old-draft');
        assert.equal((await f.db.execute(sql`SELECT * FROM knowledge_metric_rules`)).rows.length, 0);
    } finally {
        await f.close();
    }
});

test('organization leases survive restart, fence old generations and allow blocked jobs to retry', async () => {
    const f = await fixture();
    try {
        await f.repo.extraction.organization.request(f.scope);
        const first = await f.repo.extraction.organization.claim();
        assert.ok(first);
        await f.db.execute(sql`UPDATE knowledge_organization_jobs SET lease_expires_at = now() - interval '1 minute'`);
        const second = await f.repo.extraction.organization.claim();
        assert.ok(second);
        assert.notEqual(first.leaseToken, second.leaseToken);
        await assert.rejects(f.repo.extraction.organization.heartbeat(first.id, first.leaseToken!), /lost/);
        await f.repo.extraction.organization.fail(second.id, second.leaseToken!, 'AI_CONFIGURATION_REQUIRED', false, true);
        assert.equal((await f.repo.extraction.status(f.scope)).organizationJob?.status, 'blocked');
        await f.repo.extraction.organization.request(f.scope);
        const third = await f.repo.extraction.organization.claim();
        assert.equal(third!.attempts, 1);
        await f.repo.extraction.configure({ ...f.scope, connectorId: f.connector.id, enabled: false });
        await assert.rejects(f.repo.extraction.organization.heartbeat(third!.id, third!.leaseToken!), /lost/);
    } finally {
        await f.close();
    }
});
