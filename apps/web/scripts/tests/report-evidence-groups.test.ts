import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReportEvidenceGroup, WorkDocumentContent, WorkDocumentView, WorkEvidence } from '@dory/shared/types/work-document';
import { strFromU8 } from 'fflate';

import {
    attachReportEvidenceGroup,
    reconcileReportEvidenceGroups,
    removeReportEvidenceGroup,
    reportEvidenceGroupText,
    reportEvidenceParagraphs,
} from '@/lib/work-documents/evidence-groups';
import { markdownExportFiles } from '@/lib/work-documents/export';
import { referencedEvidence } from '@/lib/work-documents/markdown';
import { renderWorkHtml, renderWorkMarkdown } from '@/lib/work-documents/render';
import { parseReport, resolvedReport } from '@/lib/work-documents/report-core';
import { workDraftSchema } from '@/lib/work-documents/schema';
import { initialWorkingState, versionContent } from '@/lib/work-documents/working-draft';

const body = 'Errors increased. [Evidence](dory://evidence-group/errors)';
const groups: ReportEvidenceGroup[] = [
    {
        id: 'errors',
        references: [
            { artifactId: 'errors-result', explanation: 'Observed errors.' },
            { artifactId: 'requests-result', explanation: 'Request denominator.' },
        ],
    },
];
const evidence = (artifactId: string): WorkEvidence => ({
    artifactId,
    title: artifactId,
    connectionId: 'connection',
    connectionName: 'Database',
    sql: 'SELECT private_data',
    capturedAt: '2026-11-02T00:00:00Z',
    columns: ['count'],
    rows: [{ count: 10 }],
    rowCount: 1,
    truncated: false,
    runId: 'work',
});
const content = (): WorkDocumentContent => ({
    format: 'restricted-mdx',
    schemaVersion: 1,
    body,
    markdown: body,
    visuals: [],
    embeds: {},
    evidence: groups[0].references.map(reference => evidence(reference.artifactId)),
    evidenceGroups: groups,
    knowledge: [],
});

test('paragraph anchors stay stable when moving prose and preserve legacy citations', () => {
    const original = '## Summary\n\nErrors increased.\n\nUnrelated text.';
    const paragraph = reportEvidenceParagraphs(original)[0];
    const linked = attachReportEvidenceGroup(original, paragraph.start, 'errors');
    assert.equal(reportEvidenceGroupText(linked, 'errors'), 'Errors increased.');
    const saved = { markdown: linked, body: linked, evidenceGroups: groups };
    const moved = 'Unrelated text.\n\n## Summary\n\n' + body;
    assert.equal(reconcileReportEvidenceGroups(saved, moved)[0].needsReview, false);
    assert.deepEqual(referencedEvidence(body + ' [Original](dory://evidence/legacy)', [], groups).ids, ['legacy', 'errors-result', 'requests-result']);
    assert.equal(reportEvidenceParagraphs(removeReportEvidenceGroup(linked, 'errors'))[0].groupId, undefined);
    assert.match(removeReportEvidenceGroup(linked, 'errors'), /Errors increased\./);
    assert.equal(reportEvidenceParagraphs('- ' + body)[0].groupId, 'errors');
});

test('first associations do not claim verification and changed prose, refs or explanations require human review', () => {
    const first = reconcileReportEvidenceGroups({ markdown: '' }, body, groups);
    assert.equal(first[0].needsReview, false);
    const saved = { markdown: body, body, evidenceGroups: first };
    const revisedBody = body.replace('increased', 'decreased');
    const prose = reconcileReportEvidenceGroups(saved, revisedBody, groups);
    assert.equal(prose[0].needsReview, true);
    const replacement = [{ ...groups[0], references: [{ artifactId: 'other-result' }] }];
    assert.equal(reconcileReportEvidenceGroups(saved, body, replacement)[0].needsReview, true);
    const explanation = [{ ...groups[0], references: [{ ...groups[0].references[0], explanation: 'Corrected explanation' }, groups[0].references[1]] }];
    assert.equal(reconcileReportEvidenceGroups(saved, body, explanation)[0].needsReview, true);
    assert.equal(reconcileReportEvidenceGroups({ ...saved, body: revisedBody, evidenceGroups: prose }, revisedBody, [{ ...groups[0], needsReview: false }])[0].needsReview, true);
    assert.equal(reconcileReportEvidenceGroups(saved, revisedBody, groups, ['errors'])[0].needsReview, false);
    const renamed = [{ ...groups[0], id: 'renamed' }];
    assert.equal(reconcileReportEvidenceGroups(saved, body.replace('/errors)', '/renamed)'), renamed)[0].needsReview, true);
    assert.deepEqual(reconcileReportEvidenceGroups(saved, 'Errors increased.'), []);
});

test('rejects dangling, duplicate, heading, empty and executable evidence anchors', () => {
    assert.throws(() => reconcileReportEvidenceGroups({ markdown: '' }, body, []), /Missing evidence/);
    assert.throws(() => reconcileReportEvidenceGroups({ markdown: '' }, body, [...groups, groups[0]]), /unique/);
    assert.throws(() => reportEvidenceParagraphs(body + '\n\n' + body), /exactly one paragraph/);
    assert.throws(() => reportEvidenceParagraphs('# ' + body), /body paragraph/);
    assert.throws(() => reportEvidenceParagraphs('[Evidence](dory://evidence-group/errors)'), /non-empty prose/);
    assert.throws(() => reconcileReportEvidenceGroups({ markdown: '' }, body, [{ id: 'errors', references: [groups[0].references[0], groups[0].references[0]] }]), /unique/);
    assert.throws(() => reconcileReportEvidenceGroups({ markdown: '' }, body, groups, ['missing']), /not in this report/);
    assert.equal(parseReport(body, []).diagnostics.length, 0);
    assert.ok(parseReport('Errors. [Evidence](javascript:alert%281%29)', []).diagnostics.length);
    assert.deepEqual(reportEvidenceParagraphs('```md\n' + body + '\n```'), []);
});

test('group-only evidence is retained in resolved and versioned reports without creating a visual', () => {
    const original = content();
    assert.equal(resolvedReport(original).evidence.length, 2);
    const state = initialWorkingState('Reliability', original);
    const version = versionContent({ userId: 'user', documentId: 'report', baseRevision: 1, expectedReportRevision: 1, revision: 1, state, results: {} });
    assert.deepEqual(
        version.evidence.map(item => item.artifactId),
        ['errors-result', 'requests-result'],
    );
    assert.deepEqual(version.evidenceGroups, groups);
    assert.throws(() => resolvedReport({ ...original, evidence: original.evidence.slice(0, 1) }), /Missing report evidence/);
    assert.deepEqual(original.evidenceGroups, groups);
});

test('HTML and Markdown exports preserve grouped references and explanations without SQL', () => {
    const document: WorkDocumentView = {
        id: 'report',
        title: 'Reliability',
        chatId: null,
        scope: { connectionIds: [] },
        content: content(),
        revision: 1,
        status: 'draft',
        archivedAt: null,
        createdAt: '2026-11-02',
        updatedAt: '2026-11-02',
    };
    assert.match(renderWorkMarkdown(document.content), /data-evidence-group="errors"/);
    const html = renderWorkHtml(document);
    assert.match(html, /id="evidence-group-errors"/);
    assert.match(html, /Request denominator\./);
    assert.doesNotMatch(html, /private_data/);
    const markdown = strFromU8(markdownExportFiles(document)['report.md']);
    assert.match(markdown, /\[1\].*Observed errors/);
    assert.match(markdown, /\[2\].*Request denominator/);
    assert.doesNotMatch(markdown, /dory:\/\/evidence-group/);
    assert.doesNotMatch(markdown, /private_data/);
});

test('draft inputs accept associations and explicit human review, never a forged server review state', () => {
    const draft = { title: 'Report', markdown: body, visuals: [], status: 'draft', evidenceGroups: groups, reviewedEvidenceGroupIds: ['errors'] };
    assert.equal(workDraftSchema.parse(draft).evidenceGroups?.length, 1);
    assert.equal(workDraftSchema.safeParse({ ...draft, evidenceGroups: [{ ...groups[0], needsReview: false }] }).success, false);
    assert.equal(workDraftSchema.safeParse({ ...draft, evidenceGroups: [{ ...groups[0], references: [] }] }).success, false);
});
