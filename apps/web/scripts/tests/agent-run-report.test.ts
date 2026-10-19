import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPreviewValue, getPreviewColumnNames, getSupportingFacts, orderReportFindings, shouldShowHeadlineMetric } from '@/lib/agent-runs/report';

test('promotes the primary finding without changing other findings or mutating stored order', () => {
    const findings = [
        { id: 'a', isPrimary: false },
        { id: 'b', isPrimary: true },
        { id: 'c', isPrimary: false },
    ];
    assert.deepEqual(
        orderReportFindings(findings).map(item => item.id),
        ['b', 'a', 'c'],
    );
    assert.deepEqual(
        findings.map(item => item.id),
        ['a', 'b', 'c'],
    );
});

test('removes only a repeated named metric, retaining equal values from other metrics', () => {
    assert.deepEqual(
        getSupportingFacts({
            metricLabel: 'Failure rate',
            metricValue: '36.84',
            metricUnit: '%',
            facts: [
                { label: 'Failure rate', value: '36.84 %' },
                { label: 'Previous week', value: '36.84%' },
                { label: 'Failures', value: '14 / 38' },
            ],
        }),
        [
            { label: 'Previous week', value: '36.84%' },
            { label: 'Failures', value: '14 / 38' },
        ],
    );
    assert.deepEqual(getSupportingFacts(null), []);
});

test('shows a measured headline only when it is not already in the conclusion title', () => {
    const metric = { metricValue: '36.84', metricUnit: '%' };
    assert.equal(shouldShowHeadlineMetric('Atlas Pay 失败率升至 36.84%，上升 33.27 个百分点', metric), false);
    assert.equal(shouldShowHeadlineMetric('Atlas Pay 失败率显著上升', metric), true);
    assert.equal(shouldShowHeadlineMetric('Historical finding', null), false);
});

test('preserves stored column ordering and headers for empty results, falling back to row keys for legacy schemas', () => {
    assert.deepEqual(getPreviewColumnNames([{ name: 'provider' }, { name: 'rate' }], []), ['provider', 'rate']);
    assert.deepEqual(getPreviewColumnNames(['rate', 'provider'], [{ provider: 'atlas', rate: 36.84 }]), ['rate', 'provider']);
    assert.deepEqual(getPreviewColumnNames([null, {}], [{ count: 0 }, { count: 1, extra: false }]), ['count', 'extra']);
    assert.equal(formatPreviewValue(0), '0');
    assert.equal(formatPreviewValue(false), 'false');
    assert.equal(formatPreviewValue(null), 'NULL');
    assert.equal(formatPreviewValue({ rate: 36.84 }), '{"rate":36.84}');
});

test('finding review resolves the reviewer through the database layer and retains history when the user is missing', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const { PostgresWorksRepository } = await import('@dory/database/postgres/impl/works');
    const schema = await import('@dory/database/postgres/schemas');
    const client = new PGlite();
    try {
        const db = drizzle({ client, schema });
        await migrate(db, { migrationsFolder: new URL('../../../../packages/database/src/pglite/migrations', import.meta.url).pathname });
        const repo = new PostgresWorksRepository();
        Object.defineProperty(repo, 'db', { value: db });
        await db.insert(schema.user).values({ id: 'reviewer', name: 'Report Reviewer', email: 'report-review@example.test', emailVerified: true });
        await db.insert(schema.works).values({ workId: 'report-work', organizationId: 'report-org', userId: 'reviewer' });
        await db
            .insert(schema.findings)
            .values({ id: 'report-finding', workId: 'report-work', organizationId: 'report-org', title: 'Evidence can be reviewed independently of execution' });
        const input = { organizationId: 'report-org', userId: 'reviewer', workId: 'report-work' };
        assert.equal((await repo.listFindings(input))[0]?.verifiedByName, null);
        await repo.setFindingVerification({ ...input, findingId: 'report-finding', verified: true });
        const reviewed = (await repo.listFindings(input))[0]!;
        assert.equal(reviewed.verifiedByName, 'Report Reviewer');
        assert.ok(reviewed.verifiedAt);
        assert.deepEqual(reviewed.evidence, []);
        await assert.rejects(repo.listFindings({ ...input, organizationId: 'other-org' }), /Work not found/);
        await assert.rejects(repo.listFindings({ ...input, userId: 'other-user' }), /Work not found/);
        await client.exec(`DELETE FROM "user" WHERE id = 'reviewer'`);
        const missingReviewer = (await repo.listFindings(input))[0]!;
        assert.equal(missingReviewer.verifiedByName, null);
        assert.equal(missingReviewer.verifiedByUserId, 'reviewer');
        assert.ok(missingReviewer.verifiedAt);
        await repo.setFindingVerification({ ...input, findingId: 'report-finding', verified: false });
        const undone = (await repo.listFindings(input))[0]!;
        assert.equal(undone.verifiedAt, null);
        assert.equal(undone.verifiedByUserId, null);
    } finally {
        await client.close();
    }
});
