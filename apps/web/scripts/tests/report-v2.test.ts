import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PostgresWorkDocumentsRepository } from '@dory/database/postgres/impl/work-documents';
import type { PostgresDBClient } from '@dory/shared';
import type { WorkDocumentContent, WorkDocumentView, WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { strFromU8, unzipSync } from 'fflate';

import { exportDoryMdxZip, markdownExportFiles } from '@/lib/work-documents/export';
import { formatReportMetric, reportMetrics } from '@/lib/work-documents/format';
import { renderWorkHtml, workChartSvg } from '@/lib/work-documents/render';
import { selectReportEvidence } from '@/lib/work-documents/workspace-evidence';
import { editableReport, legacyToMdx, parseReport, reportEmbeds, resolvedReport } from '@/lib/work-documents/report-core';

const visual: WorkVisual = {
    id: 'total',
    type: 'metric',
    evidenceId: 'artifact',
    title: 'Revenue',
    metric: { column: 'value', rowIndex: 0, format: 'currency', currency: 'USD', precision: 2 },
};
const evidence: WorkEvidence = {
    artifactId: 'artifact',
    title: 'Revenue',
    connectionId: 'connection',
    connectionName: 'Commerce',
    sql: 'select confidential from private_table',
    capturedAt: '2026-10-28T00:00:00Z',
    rows: [{ value: 123.45, base: 0 }],
    columns: ['value', 'base'],
    columnTypes: [{ name: 'value', type: 'decimal' }],
    rowCount: 1,
    truncated: false,
    runId: null,
};
function content(body = '# Revenue\n\n<Metric source="total" />'): WorkDocumentContent {
    return {
        format: 'restricted-mdx',
        schemaVersion: 1,
        body,
        markdown: parseReport(body, [visual]).presentation,
        visuals: [visual],
        evidence: [evidence],
        embeds: reportEmbeds([visual], [evidence]),
        knowledge: [],
        diagnostics: [],
    };
}

test('MDX is parsed, never executed; rejects expressions, imports, HTML, props, unknown references and URLs', () => {
    for (const body of [
        '{globalThis.process.exit()}',
        'import X from "x"',
        'export const a = 1',
        '<script>alert(1)</script>',
        '<Metric source={"total"} />',
        '<Metric source="total" onClick="x" />',
        '<Metric {...props} />',
        '<Unknown source="total" />',
        '<Chart source="total" />',
        '<Metric source="missing" />',
        '[x](javascript:alert%281%29)',
        '[x][a]\n\n[a]: javascript:foo',
        '![remote](https://example.com/image.png)',
        'Text <Metric source="total" />',
    ]) {
        assert.ok(parseReport(body, [visual]).diagnostics.length, body);
    }
    const safe = '## Findings\n\n<Metric source="total" />\n\n```mdx\n{danger()}\n<script />\n```';
    const parsed = parseReport(safe, [visual]);
    assert.deepEqual(parsed.diagnostics, []);
    assert.equal(parsed.components.length, 1);
    assert.match(parsed.presentation, /dory:\/\/visual\/total/);
    assert.match(parsed.presentation, /\{danger\(\)\}/);
    assert.ok(parseReport('<div />', []).diagnostics[0].line);
});

test('legacy conversion preserves literal Markdown, code examples and visual references', () => {
    const source = "# Title\n\nLiteral {braces} and <script>text</script>.\n\n![Revenue](dory://visual/total)\n\n```sql\nselect '{json}';\n```";
    const body = legacyToMdx(source, [visual]);
    const parsed = parseReport(body, [visual]);
    assert.deepEqual(parsed.diagnostics, []);
    assert.equal(parsed.components[0].visualId, 'total');
    assert.match(parsed.presentation, /select '\{json\}';/);
    assert.match(body, /Metric source="total"/);
});

test('publication freezes the selected revision, is idempotent, retains snapshots and enforces ownership', async () => {
    const db = new PGlite();
    const repo = new PostgresWorkDocumentsRepository();
    try {
        for (const migration of ['0038_work_documents', '0041_report_publications']) {
            const sql = await readFile(`../../packages/database/src/postgres/migrations/${migration}.sql`, 'utf8');
            assert.equal(await readFile(`../../packages/database/src/pglite/migrations/${migration}.sql`, 'utf8'), sql);
            await db.exec(sql);
        }
        await repo.init(drizzle(db) as unknown as PostgresDBClient);
        const owner = { organizationId: 'org', userId: 'alice' };
        const first = await repo.create({
            ...owner,
            title: 'Revenue',
            creationKey: 'new',
            content: { markdown: '', visuals: [], evidence: [], knowledge: [] },
            scope: { connectionIds: [] },
        });
        const target = { ...owner, documentId: first.id };
        const saved = await repo.update({ ...target, expectedRevision: 1, title: first.title, content: content(), scope: first.scope, status: 'ready', source: 'user' });
        assert.equal((await repo.publications(target)).length, 0, 'ready is not published');
        assert.ok(saved.content.evidence[0].snapshotId);
        assert.equal(saved.content.embeds!.total.snapshotId, saved.content.evidence[0].snapshotId);
        assert.doesNotThrow(() => resolvedReport(saved.content));
        const [published, duplicate] = await Promise.all([
            repo.publish({ ...target, expectedRevision: 2, requestId: 'publish' }),
            repo.publish({ ...target, expectedRevision: 2, requestId: 'publish' }),
        ]);
        assert.equal(published.publication.id, duplicate.publication.id);
        assert.equal(published.publication.number, 1);
        const next = await repo.update({
            ...target,
            expectedRevision: 2,
            title: 'New draft',
            content: { ...saved.content, body: 'Changed\n\n<Metric source="total" />' },
            scope: first.scope,
            status: 'draft',
            source: 'user',
        });
        assert.equal(next.content.evidence[0].snapshotId, saved.content.evidence[0].snapshotId, 'reuses immutable data');
        assert.equal((await repo.getPublication({ ...target, publicationId: published.publication.id })).title, 'Revenue');
        assert.equal((await repo.publish({ ...target, expectedRevision: 2, requestId: 'publish' })).publication.id, published.publication.id);
        await assert.rejects(repo.publish({ ...target, expectedRevision: 2, requestId: 'stale' }), /changed/);
        await assert.rejects(repo.publish({ ...target, expectedRevision: 3, requestId: 'publish' }), /already used/);
        await assert.rejects(repo.getPublication({ ...target, userId: 'bob', publicationId: published.publication.id }), /not found/);
        const second = await repo.publish({ ...target, expectedRevision: 3, requestId: 'second' });
        assert.equal(second.publication.number, 2);
        const restored = await repo.restore({ ...target, revision: 2, expectedRevision: 3 });
        assert.equal(restored.revision, 4);
        assert.equal((await repo.publications(target)).length, 2);
        await repo.archive({ ...target, archived: true });
        const historical = await repo.getPublication({ ...target, publicationId: published.publication.id });
        // No Artifact or ResultSet tables exist here: reading/exporting only needs retained report data.
        const view: WorkDocumentView = {
            ...historical,
            createdAt: historical.createdAt.toISOString(),
            updatedAt: historical.updatedAt.toISOString(),
            archivedAt: historical.archivedAt?.toISOString() ?? null,
        };
        assert.match(renderWorkHtml(view), /123.45/);
        assert.equal((await db.query<{ count: number }>('select count(*)::int as count from report_snapshots')).rows[0].count, 1);
        assert.deepEqual(await repo.listReferencingArtifact({ ...owner, artifactId: 'artifact' }), [{ id: first.id, title: historical.title }]);
        assert.deepEqual(await repo.listReferencingArtifact({ ...owner, userId: 'bob', artifactId: 'artifact' }), []);
        await repo.archive({ ...target, archived: false });
        await repo.update({
            ...target,
            expectedRevision: 4,
            title: 'No current evidence',
            content: { ...content(), evidence: [], visuals: [], embeds: {}, body: 'No data' },
            scope: first.scope,
            status: 'draft',
            source: 'user',
        });
        assert.equal((await repo.listReferencingArtifact({ ...owner, artifactId: 'artifact' })).length, 1, 'historical references remain discoverable once each');
        const archive = unzipSync(exportDoryMdxZip(view));
        assert.doesNotMatch(strFromU8(archive['manifest.json']), /confidential|private_table|"sql"|connectionId/);
        assert.match(strFromU8(archive['report.mdx']), /Metric/);
    } finally {
        await db.close();
    }
});

test('static exports preserve metric formatting and attach only the saved table range', () => {
    assert.equal(formatReportMetric(null, visual.metric!), '—');
    assert.equal(formatReportMetric(0.9543, { column: 'x', rowIndex: 0, format: 'percent', precision: 2 }), '95.43%');
    assert.equal(formatReportMetric(95.43, { column: 'x', rowIndex: 0, format: 'percent', percentScale: 'whole', precision: 2 }), '95.43%');
    assert.equal(reportMetrics({ ...visual, metric: { ...visual.metric!, comparison: { column: 'base', rowIndex: 0 } } }, evidence)[0].comparison, '—');
    const table: WorkVisual = { id: 'table', type: 'table', evidenceId: evidence.artifactId, title: 'Details' };
    const tableEvidence = { ...evidence, rows: Array.from({ length: 70 }, (_, value) => ({ value: `row-${value}` })), truncated: true };
    const doc: WorkDocumentView = {
        id: 'doc',
        title: 'Details',
        chatId: null,
        scope: { connectionIds: [] },
        revision: 1,
        status: 'ready',
        archivedAt: null,
        createdAt: evidence.capturedAt,
        updatedAt: evidence.capturedAt,
        content: { markdown: '![Details](dory://visual/table)', visuals: [table], evidence: [tableEvidence], knowledge: [] },
    };
    const files = markdownExportFiles(doc);
    assert.match(strFromU8(files['report.md']), /Draft r1/);
    assert.doesNotMatch(strFromU8(files['report.md']), /row-69/);
    assert.match(strFromU8(files['data/table.csv']), /row-69/);
    const invalid = editableReport(doc.content);
    invalid.body = '{alert(1)}';
    assert.throws(() => markdownExportFiles({ ...doc, content: invalid }), /syntax/);
});

test('legacy nested and reference-style embeds remain valid when editing', () => {
    for (const source of ['- Context ![Revenue](dory://visual/total)', '> ![Revenue](dory://visual/total)', '![Revenue][data]\n\n[data]: dory://visual/total']) {
        const converted = legacyToMdx(source, [visual]);
        const parsed = parseReport(converted, [visual]);
        assert.deepEqual(parsed.diagnostics, [], converted);
        assert.equal(parsed.components.length, 1);
    }
});

test('static line and area charts retain gaps instead of joining missing values', () => {
    const source = {
        ...evidence,
        columns: ['category', 'value'],
        rows: [
            { category: 'A', value: 1 },
            { category: 'B', value: null },
            { category: 'C', value: 3 },
        ],
    };
    for (const type of ['line', 'area'] as const) {
        const svg = workChartSvg({ id: 'trend', type: 'chart', title: 'Trend', evidenceId: 'artifact', chart: { type, xKey: 'category', yKey: 'value' } }, source);
        assert.equal((svg.match(type === 'line' ? /<polyline /g : /<polygon /g) ?? []).length, 2);
        assert.ok(!svg.includes('NaN'));
    }
});

test('MDX export strips source links without changing code examples', () => {
    const draft = content('See [source](dory://evidence/artifact).\n\n```md\n[source](dory://evidence/artifact)\n```');
    const files = unzipSync(
        exportDoryMdxZip({
            id: 'report',
            title: 'Report',
            chatId: null,
            scope: { connectionIds: [] },
            revision: 1,
            status: 'draft',
            archivedAt: null,
            createdAt: evidence.capturedAt,
            updatedAt: evidence.capturedAt,
            content: draft,
        }),
    );
    const body = strFromU8(files['report.mdx']);
    assert.match(body, /See source/);
    assert.match(body, /```md\n\[source\]\(dory:\/\/evidence\/artifact\)/);
});

test('restricted MDX accepts only registered standalone legacy visual links', () => {
    const table = { id: 'rows', type: 'table' as const, title: 'Rows', evidenceId: 'result' };
    const parsed = parseReport('## Result\n\n![Rows](dory://visual/rows)', [table]);
    assert.equal(parsed.diagnostics.length, 0);
    assert.equal(parsed.components[0].visualId, 'rows');
    assert.ok(parseReport('![Unknown](dory://visual/missing)', [table]).diagnostics.length);
    assert.ok(parseReport('text ![Rows](dory://visual/rows)', [table]).diagnostics.length);
    assert.ok(parseReport('![External](https://example.com/image.png)', [table]).diagnostics.length);
});

test('Workspace selects the exact version snapshot, validates attachment ownership and supports legacy evidence', () => {
    const reference = { documentId: 'doc', artifactId: 'artifact', revision: 2, snapshotId: 'saved' };
    const document = { revision: 2, chatId: 'chat', content: { ...content(), evidence: [{ ...evidence, snapshotId: 'saved' }] } };
    assert.deepEqual(selectReportEvidence(document, reference, 'alice').rows, evidence.rows);
    assert.throws(() => selectReportEvidence(document, { ...reference, revision: 3 }, 'alice'), /version/);
    assert.throws(() => selectReportEvidence(document, { ...reference, snapshotId: 'other' }, 'alice'), /snapshot/);
    assert.throws(() => selectReportEvidence(document, { ...reference, artifactId: 'other' }, 'alice'), /snapshot/);
    assert.equal(selectReportEvidence({ ...document, content: content() }, { ...reference, snapshotId: undefined }, 'alice'), evidence);
    document.content.evidence[0] = { ...document.content.evidence[0], attachmentSource: { userId: 'alice', chatId: 'chat', files: [] } };
    assert.throws(() => selectReportEvidence(document, reference, 'bob'), /Private/);
    assert.throws(() => selectReportEvidence({ ...document, chatId: 'another' }, reference, 'alice'), /Private/);
});
