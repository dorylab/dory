import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { PostgresDBClient } from '@dory/shared';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';

import { PostgresKnowledgeRepository } from '../../src/postgres/impl/knowledge';
import { createOssieDocument } from '../../src/postgres/impl/knowledge/ossie';
import { knowledgeConnectors, knowledgeConnectorSyncJobs, knowledgeModels, knowledgeSources } from '../../src/postgres/schemas/knowledge';

async function storage(legacy = false) {
    const postgresUrl = process.env.DORY_LINEAR_TEST_POSTGRES_URL;
    let db: PostgresDBClient;
    let client: { close: () => Promise<void> };
    let execute: (sql: string) => Promise<unknown>;
    if (postgresUrl) {
        const schemaName = `linear_test_${randomUUID().replaceAll('-', '')}`;
        const admin = new Pool({ connectionString: postgresUrl });
        await admin.query(`CREATE DATABASE ${schemaName}`);
        const databaseUrl = new URL(postgresUrl);
        databaseUrl.pathname = `/${schemaName}`;
        const pool = new Pool({ connectionString: databaseUrl.toString() });
        db = drizzlePg(pool);
        execute = sql => pool.query(sql);
        if (!legacy) await migratePg(db, { migrationsFolder: new URL('../../src/postgres/migrations', import.meta.url).pathname, migrationsSchema: 'drizzle' });
        client = {
            close: async () => {
                await pool.end();
                await admin.query(`DROP DATABASE ${schemaName}`);
                await admin.end();
            },
        };
    } else {
        const pglite = new PGlite();
        db = drizzle(pglite) as unknown as PostgresDBClient;
        execute = sql => pglite.exec(sql);
        if (!legacy) await migrate(db as unknown as ReturnType<typeof drizzle>, { migrationsFolder: new URL('../../src/pglite/migrations', import.meta.url).pathname });
        client = pglite;
    }
    if (legacy) {
        const engine = postgresUrl ? 'postgres' : 'pglite';
        const journal = JSON.parse(await readFile(new URL(`../../src/${engine}/migrations/meta/_journal.json`, import.meta.url), 'utf8'));
        for (const entry of journal.entries.filter((entry: { idx: number }) => entry.idx <= 31)) {
            const sql = await readFile(new URL(`../../src/${engine}/migrations/${entry.tag}.sql`, import.meta.url), 'utf8');
            for (const statement of sql.split('--> statement-breakpoint')) if (statement.trim()) await execute(statement);
        }
    }
    return { db, client, execute };
}

async function fixture() {
    const { db, client } = await storage();
    await db.insert(knowledgeModels).values({ id: 'model', name: 'Model', organizationId: 'org', modelJson: createOssieDocument('Model', null, 'connection') });
    const repository = new PostgresKnowledgeRepository();
    await repository.init(db as unknown as PostgresDBClient);
    const credential = await repository.linear.saveCredential({
        organizationId: 'org',
        workspaceId: 'workspace',
        workspaceName: 'Workspace',
        apiKeyEncrypted: 'encrypted-key',
    });
    const connector = await repository.createLinearConnector({
        organizationId: 'org',
        knowledgeModelId: 'model',
        credentialId: credential.id,
        projectIds: ['project'],
        createdBy: 'admin',
    });
    return { client, db, repository, credential, connector };
}
const file = { path: 'document/stable-id.md', title: 'Revenue definition', contentText: '# Net revenue', sha: 'v1', sourceUrl: 'https://linear.app/dory/document/revenue' };

test('0032 migrations match and preserve existing GitHub rows when upgrading a pre-Linear database', async () => {
    const pg = await readFile(new URL('../../src/postgres/migrations/0032_linear_knowledge_connector.sql', import.meta.url), 'utf8');
    assert.equal(pg, await readFile(new URL('../../src/pglite/migrations/0032_linear_knowledge_connector.sql', import.meta.url), 'utf8'));
    const client = new PGlite();
    try {
        const journal = JSON.parse(await readFile(new URL('../../src/pglite/migrations/meta/_journal.json', import.meta.url), 'utf8'));
        for (const entry of journal.entries.filter((entry: { idx: number }) => entry.idx < 31)) {
            const sql = await readFile(new URL(`../../src/pglite/migrations/${entry.tag}.sql`, import.meta.url), 'utf8');
            for (const statement of sql.split('--> statement-breakpoint')) if (statement.trim()) await client.exec(statement);
        }
        await client.exec(`INSERT INTO knowledge_models (id, organization_id, name) VALUES ('model', 'org', 'Model');
            INSERT INTO knowledge_connectors (id, organization_id, knowledge_model_id, provider, installation_id, repository_id, repository_full_name, default_branch) VALUES ('github', 'org', 'model', 'github', '10', '20', 'dory/docs', 'main');`);
        for (const statement of pg.split('--> statement-breakpoint')) if (statement.trim()) await client.exec(statement);
        const result = await client.query<{ repository_full_name: string; provider: string }>('SELECT provider, repository_full_name FROM knowledge_connectors');
        assert.deepEqual(result.rows, [{ provider: 'github', repository_full_name: 'dory/docs' }]);
    } finally {
        await client.close();
    }
});

test('complete snapshots preserve source identity, update renamed titles, retain unchanged timestamps, and clean only owned sources', async () => {
    const { client, db, repository, connector } = await fixture();
    try {
        await db
            .insert(knowledgeSources)
            .values({ id: 'manual', organizationId: 'org', knowledgeModelId: 'model', fileName: 'manual.md', format: 'markdown', contentText: 'Keep me', byteSize: 7 });
        await repository.applyConnectorSnapshot({ connectorId: connector.id, files: [file] });
        const first = (await repository.listKnowledgeSources({ organizationId: 'org', knowledgeModelId: 'model' })).find(source => source.connectorId)!;
        assert.equal(first.sourceUrl, file.sourceUrl);
        assert.equal(first.connectorProvider, 'linear');
        assert.equal(first.fileName, 'Revenue definition');
        assert.equal((await repository.getKnowledgeSource({ organizationId: 'org', knowledgeModelId: 'model', id: first.id })).fileName, 'Revenue definition');
        assert.equal((await repository.searchKnowledgeSources({ organizationId: 'org', knowledgeModelId: 'model', query: 'revenue' }))[0].fileName, 'Revenue definition');
        assert.match((await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, first.id)))[0].fileName, / · .* · stable-id\.md$/);
        await repository.applyConnectorSnapshot({ connectorId: connector.id, files: [file] });
        const unchanged = await repository.getKnowledgeSource({ organizationId: 'org', knowledgeModelId: 'model', id: first.id });
        assert.equal(unchanged.updatedAt.getTime(), first.updatedAt.getTime());
        await repository.applyConnectorSnapshot({ connectorId: connector.id, files: [{ ...file, title: 'Renamed', sha: 'v2', contentText: '# Renamed revenue' }] });
        const renamed = await repository.getKnowledgeSource({ organizationId: 'org', knowledgeModelId: 'model', id: first.id });
        assert.equal(renamed.fileName, 'Renamed');
        assert.equal(renamed.contentText, '# Renamed revenue');
        assert.equal((await repository.searchKnowledgeSources({ organizationId: 'org', knowledgeModelId: 'model', query: 'revenue' }))[0].sourceUrl, file.sourceUrl);
        await assert.rejects(repository.applyConnectorSnapshot({ connectorId: connector.id, files: [{ ...file, contentText: 'x'.repeat(10_000_001) }] }), /10 MB|large|exceed/i);
        assert.equal((await repository.getKnowledgeSource({ organizationId: 'org', knowledgeModelId: 'model', id: first.id })).contentText, '# Renamed revenue');
        await repository.applyConnectorSnapshot({ connectorId: connector.id, files: [] });
        assert.deepEqual(
            (await repository.listKnowledgeSources({ organizationId: 'org', knowledgeModelId: 'model' })).map(source => source.id),
            ['manual'],
        );
    } finally {
        await client.close();
    }
});

test('queue coalesces concurrent requests and accepts a follow-up event during a running snapshot', async () => {
    const { client, repository, connector } = await fixture();
    try {
        const queued = await Promise.all([repository.queueConnectorSync({ connectorId: connector.id }), repository.queueConnectorSync({ connectorId: connector.id })]);
        assert.equal(queued[0].id, queued[1].id);
        const first = (await repository.claimConnectorSyncJob())!;
        assert.equal(first.attempts, 1);
        assert.equal(await repository.claimConnectorSyncJob(), null);
        const followup = await repository.queueConnectorSync({ connectorId: connector.id });
        assert.notEqual(followup.id, first.id);
        await repository.applyConnectorSnapshot({ connectorId: connector.id, configRevision: first.configRevision, jobId: first.id, leaseToken: first.leaseToken!, files: [file] });
        await repository.finishConnectorSyncJob({ jobId: first.id, connectorId: connector.id, leaseToken: first.leaseToken! });
        assert.equal((await repository.claimConnectorSyncJob())?.id, followup.id);
    } finally {
        await client.close();
    }
});

test('scope revision, stale leases, and disconnect prevent stale snapshots from recreating content', async () => {
    const { client, db, repository, connector } = await fixture();
    try {
        await repository.queueConnectorSync({ connectorId: connector.id });
        const job = (await repository.claimConnectorSyncJob())!;
        await repository.updateLinearProjects({ organizationId: 'org', connectorId: connector.id, projectIds: ['another'] });
        await assert.rejects(repository.applyConnectorSnapshot({ connectorId: connector.id, configRevision: job.configRevision, files: [file] }), /selection changed/);
        await repository.queueConnectorSync({ connectorId: connector.id });
        const abandoned = (await repository.claimConnectorSyncJob())!;
        await db
            .update(knowledgeConnectorSyncJobs)
            .set({ updatedAt: new Date(Date.now() - 6 * 60_000) })
            .where(eq(knowledgeConnectorSyncJobs.id, abandoned.id));
        await repository.recoverConnectorSyncJobs();
        const reclaimed = (await repository.claimConnectorSyncJob())!;
        assert.notEqual(reclaimed.leaseToken, job.leaseToken);
        await assert.rejects(repository.applyConnectorSnapshot({ connectorId: connector.id, jobId: job.id, leaseToken: job.leaseToken!, files: [file] }), /lease expired/);
        await repository.finishConnectorSyncJob({ connectorId: connector.id, jobId: job.id, leaseToken: job.leaseToken!, error: 'stale' });
        assert.equal((await repository.getConnectorById(connector.id)).status, 'syncing');
        await repository.deleteConnector({ organizationId: 'org', connectorId: connector.id });
        await assert.rejects(repository.applyConnectorSnapshot({ connectorId: connector.id, files: [file] }), /unavailable/);
        assert.equal((await db.select().from(knowledgeSources)).length, 0);
    } finally {
        await client.close();
    }
});

test('credential updates are tenant-scoped, versioned and invalidate old jobs without losing content', async () => {
    const { client, db, repository, connector, credential } = await fixture();
    try {
        await assert.rejects(repository.linear.getCredential('other-org', credential.id), /not found/);
        assert.deepEqual(await repository.linear.listCredentials('other-org'), []);
        const safe = (await repository.linear.listCredentials('org'))[0];
        assert.equal('apiKeyEncrypted' in safe, false);
        await repository.applyConnectorSnapshot({ connectorId: connector.id, files: [file] });
        const oldJob = (await repository.claimConnectorSyncJob())!;
        const updated = await repository.linear.saveCredential({
            organizationId: 'org',
            workspaceId: 'workspace',
            workspaceName: 'Renamed workspace',
            apiKeyEncrypted: 'new-encrypted',
            credentialId: credential.id,
        });
        assert.equal(updated.id, credential.id);
        assert.equal(updated.version, credential.version + 1);
        assert.equal(await repository.linear.invalidateCredential('org', credential.id, credential.version), false);
        assert.equal((await repository.linear.getCredential('org', credential.id)).status, 'active');
        const after = await repository.getConnectorById(connector.id);
        assert.equal(after.status, 'pending');
        assert.equal(after.linearWorkspaceName, 'Renamed workspace');
        assert.ok(after.configRevision > connector.configRevision);
        await assert.rejects(
            repository.applyConnectorSnapshot({ connectorId: connector.id, configRevision: oldJob.configRevision, jobId: oldJob.id, leaseToken: oldJob.leaseToken!, files: [] }),
            /selection changed|lease expired/,
        );
        const next = (await repository.claimConnectorSyncJob())!;
        assert.notEqual(next.id, oldJob.id);
        assert.equal(await repository.linear.invalidateCredential('other-org', credential.id, updated.version), false);
        assert.equal(await repository.linear.invalidateCredential('org', credential.id, updated.version), true);
        assert.equal((await repository.getConnectorById(connector.id)).status, 'disabled');
        assert.equal(await repository.claimConnectorSyncJob(), null);
        assert.equal((await repository.listKnowledgeSources({ organizationId: 'org', knowledgeModelId: 'model' })).length, 1);
        await assert.rejects(repository.applyConnectorSnapshot({ connectorId: connector.id, files: [] }), /unavailable/);
        await assert.rejects(
            repository.linear.saveCredential({
                organizationId: 'other-org',
                workspaceId: 'workspace',
                workspaceName: 'Other',
                apiKeyEncrypted: 'wrong',
                credentialId: credential.id,
            }),
            /same Linear workspace/,
        );
        await assert.rejects(
            repository.linear.saveCredential({ organizationId: 'org', workspaceId: 'different', workspaceName: 'Other', apiKeyEncrypted: 'wrong', credentialId: credential.id }),
            /same Linear workspace/,
        );
        assert.equal((await repository.linear.getCredential('org', credential.id)).apiKeyEncrypted, 'new-encrypted');
    } finally {
        await client.close();
    }
});

test('delayed retry survives repository restart and periodic reconciliation queues without a page request', async () => {
    const { client, db, repository, connector } = await fixture();
    try {
        await repository.queueConnectorSync({ connectorId: connector.id });
        const job = (await repository.claimConnectorSyncJob())!;
        await repository.finishConnectorSyncJob({
            jobId: job.id,
            connectorId: connector.id,
            leaseToken: job.leaseToken!,
            error: 'Rate limit',
            retryAt: new Date(Date.now() + 3600_000),
        });
        assert.equal(await repository.claimConnectorSyncJob(), null);
        await db.update(knowledgeConnectorSyncJobs).set({ availableAt: new Date(0) });
        const restarted = new PostgresKnowledgeRepository();
        await restarted.init(db as unknown as PostgresDBClient);
        assert.equal((await restarted.claimConnectorSyncJob())?.attempts, 2);
        await db
            .update(knowledgeConnectors)
            .set({ status: 'ready', nextSyncAt: new Date(0) })
            .where(eq(knowledgeConnectors.id, connector.id));
        await restarted.queueDueLinearConnectors();
        assert.equal((await db.select().from(knowledgeConnectorSyncJobs)).length, 2);
        const after = (await restarted.getConnectorById(connector.id)).nextSyncAt;
        assert.ok(after.getTime() > Date.now() + 3590_000 && after.getTime() <= Date.now() + 3600_000);
        await restarted.queueDueLinearConnectors();
        assert.equal((await restarted.getConnectorById(connector.id)).nextSyncAt.getTime(), after.getTime());
    } finally {
        await client.close();
    }
});

test('saving a shared key rebinds migrated connectors and queues all models exactly once', async () => {
    const { client, db, repository, connector, credential } = await fixture();
    try {
        await db.insert(knowledgeModels).values({ id: 'second', name: 'Second', organizationId: 'org', modelJson: createOssieDocument('Second', null, 'connection') });
        const second = await repository.createLinearConnector({
            organizationId: 'org',
            knowledgeModelId: 'second',
            credentialId: credential.id,
            projectIds: ['project'],
            createdBy: 'admin',
        });
        await repository.applyConnectorSnapshot({ connectorId: connector.id, files: [file] });
        await db.update(knowledgeConnectors).set({ credentialId: null, status: 'disabled' }).where(eq(knowledgeConnectors.id, connector.id));
        await Promise.all(
            [1, 2].map(n => repository.linear.saveCredential({ organizationId: 'org', workspaceId: 'workspace', workspaceName: 'Workspace', apiKeyEncrypted: `key-${n}` })),
        );
        assert.equal((await repository.linear.getCredential('org', credential.id)).version, 3);
        for (const id of [connector.id, second.id]) {
            const bound = await repository.getConnectorById(id);
            assert.equal(bound.credentialId, credential.id);
            assert.equal(bound.status, 'pending');
            const jobs = await db.select().from(knowledgeConnectorSyncJobs).where(eq(knowledgeConnectorSyncJobs.connectorId, id));
            assert.equal(jobs.filter(job => job.status === 'queued').length, 1);
        }
        assert.equal((await repository.listKnowledgeSources({ organizationId: 'org', knowledgeModelId: 'model' })).length, 1);
    } finally {
        await client.close();
    }
});

test('a crash after snapshot commit is recovered and exhausted jobs stop after five attempts', async () => {
    const { client, db, repository, connector } = await fixture();
    try {
        await repository.queueConnectorSync({ connectorId: connector.id });
        const job = (await repository.claimConnectorSyncJob())!;
        await repository.applyConnectorSnapshot({ connectorId: connector.id, files: [file] });
        await db
            .update(knowledgeConnectorSyncJobs)
            .set({ updatedAt: new Date(0) })
            .where(eq(knowledgeConnectorSyncJobs.id, job.id));
        await repository.recoverConnectorSyncJobs();
        assert.equal((await repository.claimConnectorSyncJob())?.attempts, 2);
        await db.update(knowledgeConnectors).set({ status: 'pending' }).where(eq(knowledgeConnectors.id, connector.id));
        await db
            .update(knowledgeConnectorSyncJobs)
            .set({ status: 'queued', attempts: 5, availableAt: new Date(0) })
            .where(eq(knowledgeConnectorSyncJobs.id, job.id));
        assert.equal(await repository.claimConnectorSyncJob(), null);
        assert.equal((await repository.getConnectorById(connector.id)).status, 'error');
    } finally {
        await client.close();
    }
});

test('0033 preserves OAuth connector content, scope and sync history, pauses old work and never converts tokens', async () => {
    const pg = await readFile(new URL('../../src/postgres/migrations/0033_linear_api_key.sql', import.meta.url), 'utf8');
    assert.equal(pg, await readFile(new URL('../../src/pglite/migrations/0033_linear_api_key.sql', import.meta.url), 'utf8'));
    const { client, db, execute } = await storage(true);
    try {
        await execute(`INSERT INTO knowledge_models (id, organization_id, name) VALUES ('model', 'org', 'Model');
            INSERT INTO knowledge_linear_authorizations (id, organization_id, workspace_id, workspace_name, access_token_encrypted, refresh_token_encrypted, expires_at) VALUES ('old-auth', 'org', 'workspace', 'Workspace', 'oauth-token', 'refresh-token', now());
            INSERT INTO knowledge_connectors (id, organization_id, knowledge_model_id, provider, authorization_id, linear_workspace_id, linear_workspace_name, project_ids, status, last_synced_at) VALUES ('linear', 'org', 'model', 'linear', 'old-auth', 'workspace', 'Workspace', '["project"]', 'syncing', '2026-10-01T00:00:00Z');
            INSERT INTO knowledge_connectors (id, organization_id, knowledge_model_id, provider, installation_id, repository_id, repository_full_name, default_branch, status) VALUES ('github', 'org', 'model', 'github', '10', '20', 'dory/docs', 'main', 'ready');
            INSERT INTO knowledge_sources (id, organization_id, knowledge_model_id, file_name, format, content_text, byte_size) VALUES ('old-source', 'org', 'model', 'saved.md', 'markdown', 'Keep this', 9);
            INSERT INTO knowledge_connector_items (connector_id, remote_path, knowledge_source_id, remote_sha, source_url) VALUES ('linear', 'document/stable.md', 'old-source', 'v1', 'https://linear.app/dory/document/stable');
            INSERT INTO knowledge_connector_sync_jobs (id, connector_id, status, lease_token) VALUES ('running', 'linear', 'running', 'old-lease'), ('queued', 'linear', 'queued', NULL), ('github-job', 'github', 'queued', NULL);`);
        for (const statement of pg.split('--> statement-breakpoint')) if (statement.trim()) await execute(statement);
        // The repository reads the current schema; advance past the additive extraction migration too.
        const journal = JSON.parse(await readFile(new URL('../../src/postgres/migrations/meta/_journal.json', import.meta.url), 'utf8'));
        for (const entry of journal.entries.filter((entry: { idx: number }) => entry.idx >= 33)) {
            const migration = await readFile(new URL(`../../src/postgres/migrations/${entry.tag}.sql`, import.meta.url), 'utf8');
            for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) await execute(statement);
        }
        const [linear] = await db.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, 'linear'));
        assert.equal(linear.status, 'disabled');
        assert.match(linear.lastError!, /API Key/);
        assert.equal(linear.credentialId, null);
        assert.deepEqual(linear.projectIds, ['project']);
        assert.equal(linear.lastSyncedAt?.toISOString(), '2026-10-01T00:00:00.000Z');
        assert.equal(linear.configRevision, 1);
        assert.equal((await db.select().from(knowledgeSources))[0].contentText, 'Keep this');
        const jobs = await db.select().from(knowledgeConnectorSyncJobs);
        assert.ok(jobs.filter(job => job.connectorId === 'linear').every(job => job.status === 'failed' && job.leaseToken === null));
        assert.equal(jobs.find(job => job.id === 'github-job')?.status, 'queued');
        const repository = new PostgresKnowledgeRepository();
        await repository.init(db);
        assert.deepEqual(await repository.linear.listCredentials('org'), []);
        assert.equal((await repository.getConnectorById('github')).status, 'ready');
        await assert.rejects(execute('SELECT * FROM knowledge_linear_authorizations'), /does not exist/);
        await assert.rejects(execute('SELECT * FROM knowledge_linear_oauth_states'), /does not exist/);
        await assert.rejects(execute('SELECT * FROM knowledge_linear_deliveries'), /does not exist/);
    } finally {
        await client.close();
    }
});

test('GitHub create, leased sync and disconnect remain independent of Linear credential updates', async () => {
    const { client, repository, connector, credential } = await fixture();
    try {
        const initial = (await repository.claimConnectorSyncJob())!;
        await repository.applyConnectorSnapshot({
            connectorId: connector.id,
            configRevision: initial.configRevision,
            jobId: initial.id,
            leaseToken: initial.leaseToken!,
            files: [file],
        });
        await repository.finishConnectorSyncJob({ connectorId: connector.id, jobId: initial.id, leaseToken: initial.leaseToken! });
        const github = await repository.createConnector({
            organizationId: 'org',
            knowledgeModelId: 'model',
            installationId: '10',
            repositoryId: '20',
            repositoryFullName: 'dory/docs',
            defaultBranch: 'main',
            rootPath: 'docs',
            createdBy: 'admin',
        });
        assert.equal(github.credentialId, null);
        await repository.queueConnectorSync({ connectorId: github.id, targetSha: 'commit' });
        const job = (await repository.claimConnectorSyncJob())!;
        assert.equal(job.connectorId, github.id);
        await repository.applyConnectorSnapshot({
            connectorId: github.id,
            configRevision: job.configRevision,
            jobId: job.id,
            leaseToken: job.leaseToken!,
            commitSha: 'commit',
            files: [{ path: 'docs/revenue.md', sha: 'blob', contentText: 'GitHub revenue', sourceUrl: 'https://github.com/dory/docs/blob/main/docs/revenue.md' }],
        });
        await repository.finishConnectorSyncJob({ connectorId: github.id, jobId: job.id, leaseToken: job.leaseToken! });
        assert.equal((await repository.getConnectorById(github.id)).lastCommitSha, 'commit');
        await repository.linear.saveCredential({
            organizationId: 'org',
            workspaceId: 'workspace',
            workspaceName: 'Workspace',
            credentialId: credential.id,
            apiKeyEncrypted: 'new-key',
        });
        assert.equal((await repository.getConnectorById(github.id)).status, 'ready');
        assert.equal((await repository.listKnowledgeSources({ organizationId: 'org', knowledgeModelId: 'model' })).length, 2);
        await repository.deleteConnector({ organizationId: 'org', connectorId: github.id });
        const remaining = await repository.listKnowledgeSources({ organizationId: 'org', knowledgeModelId: 'model' });
        assert.equal(remaining.length, 1);
        assert.equal(remaining[0].connectorId, connector.id);
        assert.equal((await repository.linear.getCredential('org', credential.id)).status, 'active');
    } finally {
        await client.close();
    }
});
