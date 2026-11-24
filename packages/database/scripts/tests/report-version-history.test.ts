import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { PostgresDBClient } from '@dory/shared';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as postgres } from 'drizzle-orm/node-postgres';
import { drizzle as pglite } from 'drizzle-orm/pglite';
import { Client } from 'pg';

import { PostgresWorkDocumentsRepository } from '../../src/postgres/impl/work-documents';

const owner = { organizationId: 'org', userId: 'user', documentId: 'report' };
const current = { markdown: 'Current content', visuals: [], knowledge: [], evidence: [] };

for (const engine of ['pglite', 'postgres'] as const) {
    test(`${engine} resets history exactly once and commits only completed edits`, { skip: engine === 'postgres' && !process.env.REPORT_TEST_POSTGRES_URL }, async () => {
        const migration = (name: string) => readFile(new URL(`../../src/${engine}/migrations/${name}.sql`, import.meta.url), 'utf8');
        const client = engine === 'pglite' ? new PGlite() : new Client({ connectionString: process.env.REPORT_TEST_POSTGRES_URL, connectionTimeoutMillis: 8000 });
        if (client instanceof Client) await client.connect();
        const db = (client instanceof Client ? postgres(client) : pglite(client)) as unknown as PostgresDBClient;
        const schema = 'history_' + crypto.randomUUID().replaceAll('-', '');
        const exec = async (sql: string) => {
            if (client instanceof Client) await client.query(sql);
            else await client.exec(sql);
        };
        try {
            await exec(`create schema ${schema}; set search_path to ${schema}`);
            for (const name of ['0038_work_documents', '0041_report_publications', '0042_report_working_drafts']) await exec(await migration(name));
            await exec(`insert into work_documents(id, organization_id, user_id, creation_key, title, scope, content, revision)
                values ('report','org','user','key','Current','{"connectionIds":[]}','${JSON.stringify(current)}',23);
                insert into work_document_versions(document_id,revision,title,scope,content,status,source)
                select id, i, title, scope, content, status, 'user' from work_documents cross join generate_series(1,23) i;
                insert into report_publications(id,document_id,number,revision,request_id,title,content,scope)
                select 'pub'||i,id,i,i,'req'||i,title,content,scope from work_documents cross join generate_series(1,2) i;
                insert into work_documents(id,organization_id,user_id,creation_key,title,scope,content,revision,archived_at)
                select 'archived',organization_id,user_id,'archived',title,scope,content,revision,now() from work_documents where id='report'`);
            const evidence = { artifactId: 'artifact', snapshotId: 'snapshot', columns: ['value'], rows: [{ value: 18 }] };
            const archivedContent = {
                ...current,
                evidence: [evidence],
                visuals: [{ id: 'chart', type: 'chart', evidenceId: 'artifact' }],
                embeds: { chart: { artifactId: 'artifact', snapshotId: 'snapshot' } },
            };
            await exec(`update work_documents set content = '${JSON.stringify(archivedContent)}' where id = 'archived';
                insert into report_working_drafts(document_id,organization_id,user_id,base_revision,expected_report_revision,state)
                values ('report','org','user',23,23,'{"baseline":{"revision":23},"canvas":{"baselineRevision":23},"title":"Personal analysis"}')`);
            await exec('create table artifacts (id text primary key)');
            await exec(await migration('0043_report_connected_workspace'));
            const reset = await migration('0048_report_version_history');
            await assert.rejects(exec(reset), /invalid current content or evidence/);
            await exec(`insert into report_snapshots(id,document_id,evidence) values ('snapshot','archived','${JSON.stringify(evidence)}')`);
            await exec(reset);
            await exec(reset);
            const repo = new PostgresWorkDocumentsRepository();
            await repo.init(db);
            const base = await repo.get(owner);
            assert.equal(base.version, 1);
            assert.equal(base.revision, 24);
            assert.deepEqual(base.content, current);
            const archived = await repo.get({ ...owner, documentId: 'archived' });
            assert.ok(archived.archivedAt);
            assert.deepEqual(archived.content, archivedContent);
            assert.equal(archived.version, 1);
            const working = await client.query("select base_revision, expected_report_revision, state from report_working_drafts where document_id = 'report'");
            assert.deepEqual(working.rows[0], {
                base_revision: 24,
                expected_report_revision: 24,
                state: { title: 'Personal analysis', baseline: { revision: 24, version: 1 }, canvas: { baselineRevision: 24 } },
            });
            await assert.rejects(repo.getVersion({ ...owner, revision: 23 }), /REPORT_VERSION_REMOVED/);
            const turn = { ...owner, requestId: 'turn', sourceChatId: 'chat' };
            const partial = await repo.stageAgent({ ...turn, expectedRevision: 24, title: 'Updating', scope: base.scope, content: current, status: 'draft' });
            await assert.rejects(repo.finishAgent(turn), /incomplete/);
            assert.equal((await repo.get(owner)).title, 'Current');
            await repo.stageAgent({ ...turn, expectedRevision: partial.revision, title: 'Updated', scope: base.scope, content: current, status: 'ready' });
            const saved = await repo.finishAgent(turn);
            assert.equal(saved.version, 2);
            assert.equal((await repo.finishAgent(turn)).revision, saved.revision);
            const noOp = { ...turn, requestId: 'unchanged' };
            await repo.stageAgent({ ...noOp, expectedRevision: saved.revision, title: saved.title, scope: saved.scope, content: saved.content, status: 'ready' });
            assert.equal((await repo.finishAgent(noOp)).revision, saved.revision);
            const history = await repo.versions(owner);
            assert.deepEqual(
                history.map(v => [v.source, v.version]),
                [
                    ['agent', 2],
                    ['baseline', 1],
                ],
            );
            assert.equal(history[0].sourceChatId, 'chat');
            const edit = {
                ...owner,
                expectedRevision: saved.revision,
                title: 'Manual edit',
                source: 'user' as const,
                scope: base.scope,
                content: current,
                status: 'ready' as const,
            };
            const changed = await repo.update(edit);
            assert.equal(changed.version, 3);
            assert.equal((await repo.update({ ...edit, expectedRevision: changed.revision })).revision, changed.revision);
            await assert.rejects(repo.update({ ...edit, title: 'Stale' }), /changed/);
            const restored = await repo.restore({ ...owner, revision: base.revision, expectedRevision: changed.revision });
            assert.equal(restored.version, 4);
            assert.equal(restored.title, base.title);
            assert.equal((await repo.finishAgent(noOp)).revision, saved.revision);
            const state = { title: 'SQL analysis', content: restored.content, tabs: [], activeTabId: null, proseNeedsReview: false };
            const draft = await repo.initializeWorkingDraft({ ...owner, baseRevision: restored.revision, state });
            const workspace = {
                ...owner,
                baseRevision: restored.revision,
                expectedDraftRevision: draft.revision,
                requestId: 'apply',
                content: { ...current, markdown: 'Selected SQL result' },
            };
            const applied = await repo.saveWorkingVersion(workspace);
            assert.equal(applied.version, 5);
            assert.equal((await repo.saveWorkingVersion(workspace)).revision, applied.revision);
            assert.equal((await repo.versions(owner))[0].source, 'workspace');
            assert.equal((await repo.getVersion({ ...owner, revision: changed.revision })).title, 'Manual edit');
        } finally {
            if (client instanceof Client) {
                try {
                    await exec(`drop schema if exists ${schema} cascade`);
                } finally {
                    await client.end();
                }
            } else await client.close();
        }
    });
}
