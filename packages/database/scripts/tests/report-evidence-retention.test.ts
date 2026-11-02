import assert from 'node:assert/strict';
import test from 'node:test';

import { joinObjectPath } from '@dory/artifacts';
import type { ReportWorkingState } from '@dory/shared/types/report-workspace';
import type { WorkDocumentContent, WorkEvidence } from '@dory/shared/types/work-document';
import { and, eq } from 'drizzle-orm';

import { artifacts, queryRuns, resultSets, workQuerySessions, works } from '../../src/postgres/schemas';
import { PostgresWorksRepository } from '../../src/postgres/impl/works';
import { reportRetentionFixture } from './report-retention-fixture';

const owner = { organizationId: 'org', userId: 'alice' };
function content(evidence: WorkEvidence[]): WorkDocumentContent {
    return { format: 'restricted-mdx', schemaVersion: 1, body: 'Analysis', markdown: 'Analysis', visuals: [], evidence, knowledge: [], embeds: {}, diagnostics: [] };
}
function state(value: WorkDocumentContent): ReportWorkingState {
    return { title: 'Analysis', content: value, tabs: [], activeTabId: null, proseNeedsReview: false };
}

test('drafts, historical versions, publications and archived reports retain full data through expiration and capacity cleanup', async () => {
    const f = await reportRetentionFixture();
    try {
        const rows = Array.from({ length: 750 }, (_, value) => ({ value }));
        const original = await f.seedEvidence('original', rows);
        const next = await f.seedEvidence('next');
        const candidate = await f.seedEvidence('candidate');
        await f.seedEvidence('disposable');
        const report = await f.reports.create({ ...owner, creationKey: 'report', title: 'Report', scope: { connectionIds: [] }, content: content([original]) });
        const target = { ...owner, documentId: report.id };
        await f.reports.publish({ ...target, expectedRevision: 1, requestId: 'first' });
        const changed = await f.reports.update({
            ...target,
            expectedRevision: 1,
            title: 'Changed',
            scope: report.scope,
            content: content([next]),
            status: 'ready',
            source: 'user',
        });
        await f.reports.initializeWorkingDraft({ ...target, baseRevision: changed.revision, state: state(changed.content) });
        await f.reports.recordWorkingResult({
            ...target,
            baseRevision: changed.revision,
            resultId: 'candidate',
            result: { sourceArtifactId: next.artifactId, evidence: candidate },
        });
        await f.reports.archive({ ...target, archived: true });
        const expired = new Date(Date.now() - 1000);
        await f.db.update(resultSets).set({ expiresAt: expired });
        await f.db.update(artifacts).set({ expiresAt: expired });

        const cleaned = await f.results.cleanupWorkspaceStorage({ organizationId: 'org', maxStorageBytes: 0 });
        assert.equal(cleaned.deletedResultSets, 1);
        assert.deepEqual((await f.db.select({ id: artifacts.id }).from(artifacts)).map(row => row.id).sort(), ['candidate', 'next', 'original']);
        assert.ok(cleaned.usageAfter.totalBytes > 0, 'retained evidence may exceed capacity but is never silently evicted');
        const originalArtifact = await f.catalog.get({ ...owner, artifactId: 'original' });
        const full = await f.results.readRows({ ...owner, resultSetId: originalArtifact.sourceResultSetId!, limit: 1000 });
        assert.equal(full.rows.length, 750, 'the full result remains independently readable beyond the 500-row report preview');
        assert.equal(full.dataAvailability, 'full');
        assert.equal((await f.reports.getVersion({ ...target, revision: 1 })).content.evidence[0].rows.length, 500);
        assert.deepEqual(
            await f.reports.listReferencingArtifact({ ...owner, artifactId: 'candidate' }),
            [],
            'unapplied query results are protected but not presented as report citations',
        );
        assert.equal((await f.reports.listReferencingArtifact({ ...owner, artifactId: 'original' }))[0].revision, 1, 'references open the version containing the evidence');
        assert.deepEqual(await f.reports.listReferencingArtifact({ ...owner, userId: 'bob', artifactId: 'original' }), []);
        await assert.rejects(f.catalog.delete({ ...owner, artifactId: 'original' }), /retained by a report/);
        await assert.rejects(f.results.deleteResultSet({ organizationId: 'org', resultSetId: originalArtifact.sourceResultSetId! }), /retained by a report/);
        await assert.rejects(f.catalog.unpin({ ...owner, artifactId: 'original' }), /retained by a report/);
    } finally {
        await f.close();
    }
});

test('publications validate actual stored results while incomplete data and capacity failures leave editable drafts intact', async () => {
    const f = await reportRetentionFixture();
    try {
        const evidence = await f.seedEvidence('result', [{ value: 1 }], 'select value from fixture limit 1');
        const report = await f.reports.create({ ...owner, creationKey: 'report', title: 'Report', scope: { connectionIds: [] }, content: content([evidence]) });
        const target = { ...owner, documentId: report.id };
        const artifact = await f.catalog.get({ ...owner, artifactId: evidence.artifactId });
        const [record] = await f.db.select().from(resultSets).where(eq(resultSets.id, artifact.sourceResultSetId!));
        const manifest = await f.store.resultSets.readManifest(record.artifactRefJson);
        assert.ok(manifest.files.data?.parts?.length);
        const published = await f.reports.publish({ ...target, expectedRevision: 1, requestId: 'limited-sql' });
        assert.equal(published.publication.number, 1, 'an explicit SQL LIMIT is a complete query result');

        const next = await f.reports.update({ ...target, expectedRevision: 1, title: 'Changed', scope: report.scope, content: report.content, status: 'ready', source: 'user' });
        await f.db.update(resultSets).set({ dataAvailability: 'preview-only' }).where(eq(resultSets.id, record.id));
        await assert.rejects(f.reports.publish({ ...target, expectedRevision: next.revision, requestId: 'preview' }), /complete retained result/);
        assert.equal((await f.reports.get(target)).revision, next.revision);
        await f.db
            .update(resultSets)
            .set({ dataAvailability: 'full', byteSize: 6 * 1024 ** 3 })
            .where(eq(resultSets.id, record.id));
        await assert.rejects(f.reports.publish({ ...target, expectedRevision: next.revision, requestId: 'capacity' }), /storage limit/);
        await f.db.update(resultSets).set({ byteSize: record.byteSize }).where(eq(resultSets.id, record.id));
        await f.store.objectStore.delete(joinObjectPath(record.artifactRefJson.basePath, manifest.files.data!.parts![0].path));
        await assert.rejects(f.reports.publish({ ...target, expectedRevision: next.revision, requestId: 'missing-part' }), /complete retained result/);
        assert.equal((await f.reports.publications(target)).length, 1);
        assert.equal((await f.reports.getVersion({ ...target, revision: 1 })).content.evidence[0].rows[0].value, 1);
        assert.equal(
            (await f.reports.publish({ ...target, expectedRevision: 1, requestId: 'limited-sql' })).publication.id,
            published.publication.id,
            'publication retries remain idempotent',
        );

        const empty = await f.seedEvidence('empty', [], 'select value from fixture where false');
        const emptyReport = await f.reports.create({ ...owner, creationKey: 'empty', title: 'Empty', scope: { connectionIds: [] }, content: content([empty]) });
        await f.reports.publish({ ...owner, documentId: emptyReport.id, expectedRevision: 1, requestId: 'empty' });
        const preview = await f.seedEvidence('preview');
        const previewArtifact = await f.catalog.get({ ...owner, artifactId: preview.artifactId });
        await f.db.update(resultSets).set({ dataAvailability: 'preview-only' }).where(eq(resultSets.id, previewArtifact.sourceResultSetId!));
        const previewDraft = await f.reports.create({ ...owner, creationKey: 'preview-draft', title: 'Preview draft', scope: { connectionIds: [] }, content: content([preview]) });
        await assert.rejects(f.reports.publish({ ...owner, documentId: previewDraft.id, expectedRevision: 1, requestId: 'preview-publication' }), /complete retained result/);
        assert.equal((await f.reports.get({ ...owner, documentId: previewDraft.id })).content.evidence[0].rows.length, 1);
    } finally {
        await f.close();
    }
});

test('legacy missing results preserve snapshots, new missing references fail atomically, and failed saves do not retain candidates', async () => {
    const f = await reportRetentionFixture();
    try {
        const legacy = await f.seedEvidence('legacy');
        const candidate = await f.seedEvidence('candidate');
        const report = await f.reports.create({ ...owner, creationKey: 'report', title: 'Report', scope: { connectionIds: [] }, content: content([legacy]) });
        const target = { ...owner, documentId: report.id };
        // Simulate a legacy catalog deletion predating report retention.
        await f.db.delete(artifacts).where(eq(artifacts.id, legacy.artifactId));
        const renamed = await f.reports.rename({ ...target, expectedRevision: 1, title: 'Renamed' });
        assert.equal(renamed.content.evidence[0].rows[0].value, 1);
        await assert.rejects(
            f.reports.update({
                ...target,
                expectedRevision: renamed.revision,
                title: 'Bad',
                scope: report.scope,
                content: content([{ ...legacy, artifactId: 'missing' }]),
                status: 'ready',
                source: 'user',
            }),
            /evidence is no longer available/,
        );
        await assert.rejects(
            f.reports.update({ ...target, expectedRevision: 1, title: 'Stale', scope: report.scope, content: content([candidate]), status: 'ready', source: 'user' }),
            /Report changed/,
        );
        assert.equal((await f.reports.get(target)).revision, renamed.revision);
        assert.deepEqual(await f.reports.listReferencingArtifact({ ...owner, artifactId: 'candidate' }), []);
        await f.catalog.delete({ ...owner, artifactId: 'candidate' });
        assert.equal(
            (
                await f.db
                    .select()
                    .from(artifacts)
                    .where(and(eq(artifacts.organizationId, 'org'), eq(artifacts.id, 'candidate')))
            ).length,
            0,
        );
    } finally {
        await f.close();
    }
});

test('archiving the source Work preserves cited results and original execution records while reclaiming unused results', async () => {
    const f = await reportRetentionFixture();
    try {
        const evidence = await f.seedEvidence('cited');
        await f.seedEvidence('uncited');
        const workId = 'source-work';
        await f.db.insert(works).values({ ...owner, workId, title: 'Source analysis' });
        await f.db.update(resultSets).set({ workId });
        await f.db.update(queryRuns).set({ workId });
        await f.db.update(artifacts).set({ workId });
        await f.db.insert(workQuerySessions).values({ workId, sessionId: 'session_cited', userId: owner.userId, tabId: 'tab', sqlText: evidence.sql! });
        await f.reports.create({ ...owner, creationKey: 'report', title: 'Report', scope: { connectionIds: [] }, content: content([evidence]) });
        const repository = new PostgresWorksRepository(f.store);
        await repository.init(f.db);
        assert.equal((await repository.archive({ ...owner, workId }))?.status, 'archived');
        assert.deepEqual(
            (await f.db.select({ id: artifacts.id }).from(artifacts)).map(row => row.id),
            ['cited'],
        );
        assert.equal((await f.db.select().from(queryRuns)).length, 1);
        assert.equal((await f.db.select().from(workQuerySessions)).length, 1);
        const saved = await f.catalog.get({ ...owner, artifactId: 'cited' });
        assert.equal(String((await f.results.readRows({ ...owner, resultSetId: saved.sourceResultSetId! })).rows[0].value), '1');
    } finally {
        await f.close();
    }
});

test('a save racing cleanup either keeps its complete result or rejects without a dangling reference', async () => {
    const f = await reportRetentionFixture();
    try {
        const evidence = await f.seedEvidence('racing');
        const report = await f.reports.create({ ...owner, creationKey: 'report', title: 'Report', scope: { connectionIds: [] }, content: content([]) });
        let entered!: () => void;
        let release!: () => void;
        const deleting = new Promise<void>(resolve => (entered = resolve));
        const proceed = new Promise<void>(resolve => (release = resolve));
        const remove = f.store.resultSets.deleteResultSet.bind(f.store.resultSets);
        f.store.resultSets.deleteResultSet = async ref => {
            entered();
            await proceed;
            return remove(ref);
        };
        const cleanup = f.results.cleanupWorkspaceStorage({ organizationId: 'org', maxStorageBytes: 0 });
        await deleting;
        const save = f.reports.update({
            ...owner,
            documentId: report.id,
            expectedRevision: 1,
            title: 'Report',
            scope: report.scope,
            content: content([evidence]),
            status: 'ready',
            source: 'user',
        });
        release();
        const [, saved] = await Promise.allSettled([cleanup, save]);
        assert.equal(saved.status, 'rejected');
        const current = await f.reports.get({ ...owner, documentId: report.id });
        assert.equal(current.revision, 1);
        assert.deepEqual(current.content.evidence, []);
    } finally {
        await f.close();
    }
});
