import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PostgresWorkDocumentsRepository } from '@dory/database/postgres/impl/work-documents';
import type { PostgresDBClient } from '@dory/shared';
import type { WorkDocumentContent, WorkDocumentView } from '@dory/shared/types/work-document';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/pglite';
import { Pool } from 'pg';

import { parseWorkRevision } from '@/lib/work-documents/revision';
import { markdownExportFiles } from '@/lib/work-documents/export';
import { referencedEvidence } from '@/lib/work-documents/markdown';
import { renderWorkHtml, workChartSvg } from '@/lib/work-documents/render';
import { applyMarkdownEdits, workDraftSchema } from '@/lib/work-documents/schema';

const content: WorkDocumentContent = {
    markdown: '## October 2026\n\nRevenue declined. [Source](dory://evidence/art-1)',
    visuals: [],
    evidence: [
        {
            artifactId: 'art-1',
            title: 'Revenue',
            connectionId: 'c1',
            connectionName: 'Orders',
            sql: 'select revenue from secret_table',
            capturedAt: '2026-10-22T00:00:00Z',
            columns: ['month', 'revenue'],
            rows: [{ month: 'October', revenue: -20 }],
            rowCount: 1,
            truncated: false,
            runId: 'run-1',
        },
    ],
    knowledge: [],
};
test('private report lifecycle, idempotency, concurrent edits, immutable snapshots and restore', async () => {
    const admin = process.env.DORY_TEST_POSTGRES_URL ? new Pool({ connectionString: process.env.DORY_TEST_POSTGRES_URL }) : null;
    const databaseName = `dory_reports_${randomUUID().replaceAll('-', '')}`;
    if (admin) await admin.query(`CREATE DATABASE "${databaseName}"`);
    const url = process.env.DORY_TEST_POSTGRES_URL ? new URL(process.env.DORY_TEST_POSTGRES_URL) : null;
    if (url) url.pathname = `/${databaseName}`;
    const postgres = url ? new Pool({ connectionString: url.toString() }) : null;
    const db = postgres ? null : new PGlite();
    const migration = await readFile('../../packages/database/src/postgres/migrations/0038_work_documents.sql', 'utf8');
    const localMigration = await readFile('../../packages/database/src/pglite/migrations/0038_work_documents.sql', 'utf8');
    assert.equal(localMigration, migration);
    if (postgres) await postgres.query(migration);
    else await db!.exec(migration);
    const repository = new PostgresWorkDocumentsRepository();
    await repository.init((postgres ? drizzlePg(postgres) : drizzle(db!)) as unknown as PostgresDBClient);
    const owner = { organizationId: 'org', userId: 'alice' };
    try {
        const input = {
            ...owner,
            creationKey: 'chat:request-1',
            title: 'Revenue',
            chatId: 'chat',
            scope: { connectionIds: ['c1', 'c2'], databasesByConnection: { c1: 'sales', c2: 'ads' } },
            content,
        };
        const [first, retry] = await Promise.all([repository.create(input), repository.create(input)]);
        assert.equal(first.id, retry.id);
        assert.deepEqual(first.scope, input.scope);
        assert.equal((await repository.list(owner)).length, 1);
        const target = { ...owner, documentId: first.id };
        await assert.rejects(repository.get({ ...target, userId: 'bob' }), /not found/);
        await assert.rejects(repository.get({ ...target, organizationId: 'another' }), /not found/);
        assert.deepEqual(await repository.list({ ...owner, userId: 'bob' }), []);
        assert.equal((await repository.list({ ...owner, connectionId: 'c2' })).length, 1);
        assert.equal((await repository.list({ ...owner, connectionId: 'c3' })).length, 0);
        const edit = { ...target, expectedRevision: 1, title: 'Human title', content, scope: first.scope, status: 'ready' as const, source: 'user' as const };
        const saves = await Promise.allSettled([repository.update(edit), repository.update({ ...edit, title: 'Agent title', source: 'agent' })]);
        assert.equal(saves.filter(result => result.status === 'fulfilled').length, 1);
        assert.equal(saves.filter(result => result.status === 'rejected').length, 1);
        assert.equal((await repository.versions(target)).length, 2);
        const historical = await repository.getVersion({ ...target, revision: 1 });
        assert.equal(historical.title, 'Revenue');
        assert.equal(historical.revision, 1);
        assert.deepEqual(historical.content, content);
        assert.equal((await repository.get(target)).revision, 2);
        assert.equal((await repository.versions(target)).length, 2);
        await assert.rejects(repository.getVersion({ ...target, revision: 99 }), /not found/);
        await assert.rejects(repository.getVersion({ ...target, userId: 'bob', revision: 1 }), /not found/);
        await assert.rejects(repository.getVersion({ ...target, organizationId: 'another', revision: 1 }), /not found/);
        await assert.rejects(repository.restore({ ...target, revision: 1, expectedRevision: 1 }), /changed/);
        const restored = await repository.restore({ ...target, expectedRevision: 2, revision: 1 });
        assert.equal(restored.revision, 3);
        assert.equal(restored.title, 'Revenue');
        assert.deepEqual(restored.scope, input.scope);
        assert.deepEqual(restored.content.evidence, content.evidence);
        await repository.archive({ ...target, archived: true });
        assert.equal((await repository.list(owner)).length, 0);
        assert.equal((await repository.list({ ...owner, archived: true })).length, 1);
        await assert.rejects(repository.update({ ...edit, expectedRevision: 3 }), /changed or was archived/);
        await repository.archive({ ...target, archived: false });
        assert.equal((await repository.list(owner)).length, 1);
        const renamed = await repository.rename({ ...target, expectedRevision: 3, title: 'Reviewed revenue' });
        assert.equal(renamed.revision, 4);
        assert.deepEqual(renamed.content.evidence, content.evidence);
    } finally {
        await db?.close();
        await postgres?.end();
        if (admin) {
            await admin.query(`DROP DATABASE "${databaseName}"`);
            await admin.end();
        }
    }
});

test('export is self-contained, excludes SQL, escapes hostile content and handles negative chart values', () => {
    const chart = {
        id: 'chart',
        title: '</title><script>alert(1)</script>',
        type: 'chart' as const,
        evidenceId: 'art-1',
        chart: { type: 'bar' as const, xKey: 'month', yKey: 'revenue' },
    };
    const document: WorkDocumentView = {
        id: 'doc',
        title: '<script>unsafe</script>',
        chatId: null,
        scope: { connectionIds: ['c1'] },
        content: {
            ...content,
            markdown: content.markdown + '\n\n![Revenue](dory://visual/chart)\n\n<script>bad()</script>\n\n[unsafe](javascript:alert%281%29)',
            visuals: [chart],
        },
        revision: 2,
        status: 'ready',
        archivedAt: null,
        createdAt: '2026-10-22',
        updatedAt: '2026-10-22',
    };
    const html = renderWorkHtml(document);
    assert.ok(html.includes('<svg'));
    assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('secret_table'));
    assert.ok(!html.includes('src="http'));
    assert.ok(html.includes('Orders'));
    const svg = workChartSvg(chart, content.evidence[0]);
    assert.ok(!svg.includes('NaN'));
    assert.ok(!svg.includes('height="-'));
});

test('report validation rejects invalid visuals and resolves only real Markdown references', () => {
    const base = { title: 'Report', markdown: '', visuals: [], status: 'ready' };
    assert.equal(workDraftSchema.safeParse(base).success, false);
    assert.equal(workDraftSchema.safeParse({ ...base, status: 'draft' }).success, true);
    assert.equal(workDraftSchema.safeParse({ ...base, visuals: [{ id: 'm', title: '', type: 'metric', evidenceId: 'art-1' }] }).success, false);
    assert.throws(() => referencedEvidence('![Missing](dory://visual/missing)', []), /Unknown visual/);
    assert.throws(() => referencedEvidence('[broken](dory://visual/chart)', []), /Invalid report/);
    assert.deepEqual(referencedEvidence('`[example](dory://evidence/private)`', []).ids, []);
});

test('partial edits reject ambiguous or missing anchors without losing untouched human content', () => {
    assert.equal(applyMarkdownEdits('Human note\n\n## Findings\nOld', [{ oldText: 'Old', newText: 'New' }]), 'Human note\n\n## Findings\nNew');
    assert.throws(() => applyMarkdownEdits('same same', [{ oldText: 'same', newText: 'changed' }]), /exactly once/);
    assert.throws(() => applyMarkdownEdits('Human note', [{ oldText: '', newText: 'lost' }]), /empty anchor/);
    assert.throws(() => applyMarkdownEdits('Human note', [{ oldText: 'absent', newText: '' }]), /exactly once/);
});

test('multi-metric report charts validate and export every labeled series without losing the legacy single metric', () => {
    const chart = {
        type: 'line',
        xKey: 'month',
        yKeys: [
            { key: 'revenue', label: '净收入 <USD>' },
            { key: 'orders', label: '订单数' },
        ],
    };
    const visual = { id: 'trend', title: '收入与订单', type: 'chart', evidenceId: 'art-1', chart };
    const draft = { title: 'Report', markdown: '![Trend](dory://visual/trend)', visuals: [visual], status: 'ready' };
    const parsed = workDraftSchema.parse(draft);
    assert.deepEqual(parsed.visuals[0].chart, chart);
    const svg = workChartSvg(parsed.visuals[0], {
        ...content.evidence[0],
        columns: ['month', 'revenue', 'orders'],
        rows: [
            { month: 'October', revenue: 200000, orders: 400 },
            { month: 'November', revenue: 180000, orders: 350 },
        ],
    });
    assert.equal((svg.match(/<polyline/g) ?? []).length, 2);
    assert.match(svg, /净收入 &lt;USD&gt;/);
    assert.match(svg, /订单数/);
    assert.ok(!svg.includes('NaN'));
    for (const invalid of [
        { type: 'line', xKey: 'month' },
        { ...chart, yKeys: [] },
        { ...chart, yKeys: [{ label: 'Missing column' }] },
        { ...chart, yKey: 'revenue' },
    ]) {
        assert.equal(workDraftSchema.safeParse({ ...draft, visuals: [{ ...visual, chart: invalid }] }).success, false);
    }
});

test('Markdown export contains offline visuals and result tables without SQL or internal URLs', () => {
    const chart = { id: 'chart', title: 'Revenue', type: 'chart' as const, evidenceId: 'art-1', chart: { type: 'bar' as const, xKey: 'month', yKey: 'revenue' } };
    const document: WorkDocumentView = {
        id: 'doc',
        title: 'Report',
        chatId: null,
        scope: { connectionIds: ['c1'] },
        revision: 2,
        status: 'ready',
        archivedAt: null,
        createdAt: '2026-10-23',
        updatedAt: '2026-10-23',
        content: {
            ...content,
            markdown: content.markdown + '\n\n![Revenue](dory://visual/chart)\n\n![Rows](dory://visual/rows)',
            visuals: [chart, { id: 'rows', type: 'table', title: 'Rows', evidenceId: 'art-1' }],
        },
    };
    const files = markdownExportFiles(document);
    const markdown = new TextDecoder().decode(files['report.md']);
    assert.ok(files['assets/chart.svg']);
    assert.ok(markdown.includes('assets/chart.svg'));
    assert.ok(markdown.includes('| October | -20 |'));
    assert.ok(!markdown.includes('dory://'));
    assert.ok(!markdown.includes('secret_table'));
});

test('revision query parameters accept only positive safe integers', () => {
    assert.equal(parseWorkRevision(null), undefined);
    assert.equal(parseWorkRevision('5'), 5);
    for (const value of ['', '0', '-1', '1.5', '1e2', 'NaN', ' 1', '01', '9007199254740992']) assert.throws(() => parseWorkRevision(value));
});
