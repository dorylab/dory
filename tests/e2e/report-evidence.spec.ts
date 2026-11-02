import type { WorkDocumentView } from '@dory/shared/types/work-document';
import { expect } from '@playwright/test';

import { reconcileReportEvidenceGroups } from '../../apps/web/lib/work-documents/evidence-groups';
import { parseReport } from '../../apps/web/lib/work-documents/report-core';
import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

test('Report evidence stays in context, pages preserved results and lets authors correct a conclusion', async ({ page, appErrors }, testInfo) => {
    test.setTimeout(180_000);
    const now = '2026-11-02T00:00:00Z';
    const connection = createWorkbenchConnection();
    const evidence = ['Error totals', 'Request totals', 'Historical baseline'].map((title, index) => ({
        artifactId: `result-${index}`,
        snapshotId: `snapshot-${index}`,
        title,
        connectionId: index === 2 ? null : connection.connection.id,
        connectionName: index === 2 ? null : 'Service database',
        sql: `SELECT value FROM source_${index}`,
        capturedAt: now,
        columns: ['value'],
        rows: [{ value: index + 10 }],
        rowCount: index === 0 ? 30 : 1,
        truncated: index === 0,
        runId: 'work-evidence',
        ...(index === 2
            ? { attachmentSource: { userId: 'fixture', chatId: 'chat', files: [{ attachmentId: 'file', filename: 'baseline.csv', sha256: 'hash', table: 'baseline' }] } }
            : {}),
    }));
    const body = '# Reliability report\n\nErrors increased relative to request volume. [Evidence](dory://evidence-group/error-rate)';
    let document: WorkDocumentView = {
        id: 'report-evidence',
        title: 'Reliability report',
        chatId: 'chat',
        scope: { connectionIds: [connection.connection.id] },
        revision: 1,
        status: 'draft',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        content: {
            format: 'restricted-mdx',
            schemaVersion: 1,
            body,
            markdown: parseReport(body, []).presentation,
            visuals: [],
            embeds: {},
            evidence,
            knowledge: [],
            evidenceGroups: [
                {
                    id: 'error-rate',
                    references: evidence.map((item, index) => ({ artifactId: item.artifactId, explanation: `Evidence explanation ${index + 1}` })),
                    needsReview: false,
                },
            ],
        },
    };
    const history = new Map([[1, structuredClone(document)]]);
    const freshEvidence = { ...evidence[0], artifactId: 'work-result', snapshotId: 'work-snapshot', title: 'New Work result' };
    let queryRuns = 0;
    const rowRequests: number[] = [];
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/actions/execute', async route => {
        const { actionId, input } = route.request().postDataJSON();
        if (actionId === 'report.evidence.inspect') {
            const saved = history.get(input.revision)!.content.evidence.find(item => item.artifactId === input.artifactId)!;
            expect(input.snapshotId).toBe(saved.snapshotId);
            return route.fulfill({
                json: { ok: true, data: { evidence: saved, artifactAvailable: false, fullResultAvailable: input.artifactId === 'result-0', canOpenWorkspace: false } },
            });
        }
        if (actionId === 'report.evidence.rows') {
            rowRequests.push(input.offset);
            const rows = Array.from({ length: 30 }, (_, index) => ({ value: index + 100 })).slice(input.offset, input.offset + input.limit);
            return route.fulfill({ json: { ok: true, data: { columns: ['value'], rows, rowCount: 30, offset: input.offset, limit: input.limit } } });
        }
        if (actionId === 'report.evidence.candidates')
            return route.fulfill({ json: { ok: true, data: { artifacts: [...evidence, freshEvidence].map(item => ({ id: item.artifactId, title: item.title })) } } });
        if (actionId === 'report.workspace.execute' || actionId === 'query.execute') queryRuns++;
        return route.fallback();
    });
    await page.route('**/api/work-documents/report-evidence*', async route => {
        if (route.request().method() === 'PATCH') {
            const input = route.request().postDataJSON();
            expect(input.action).toBe('save');
            const nextBody = input.draft.body;
            document = {
                ...document,
                revision: document.revision + 1,
                content: {
                    ...document.content,
                    body: nextBody,
                    markdown: parseReport(nextBody, []).presentation,
                    evidence: input.draft.evidenceGroups?.some((group: { references: Array<{ artifactId: string }> }) =>
                        group.references.some(reference => reference.artifactId === freshEvidence.artifactId),
                    )
                        ? [...evidence, freshEvidence]
                        : evidence,
                    evidenceGroups: reconcileReportEvidenceGroups(document.content, nextBody, input.draft.evidenceGroups, input.draft.reviewedEvidenceGroupIds),
                },
            };
            history.set(document.revision, structuredClone(document));
            return route.fulfill({ json: { document } });
        }
        const url = new URL(route.request().url());
        return route.fulfill({
            json: {
                document: history.get(Number(url.searchParams.get('revision'))) ?? document,
                versions: [...history.values()].map(item => ({ revision: item.revision, source: 'user', createdAt: now })),
                publications: [],
            },
        });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    const reportUrl = `/${organization}/reports/report-evidence`;
    await page.goto(reportUrl);
    await page.getByRole('link', { name: 'View evidence · 3', exact: true }).click();
    const panel = page.getByTestId('report-evidence-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('cell', { name: '10', exact: true })).toBeVisible();
    expect(rowRequests).toEqual([]);
    await expect(panel.getByText('Evidence explanation 1', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Full query result', exact: true }).click();
    await expect(panel.getByRole('cell', { name: '124', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(panel.getByRole('cell', { name: '129', exact: true })).toBeVisible();
    expect(rowRequests).toEqual([0, 25]);
    await panel.getByRole('button', { name: 'Historical baseline', exact: true }).click();
    await expect(panel.getByText('baseline.csv', { exact: true })).toBeVisible();
    await expect(panel.getByText('Only the report snapshot is preserved; the full original result is unavailable.')).toBeVisible();
    await expect(panel.getByRole('cell', { name: '12', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('report-evidence-panel.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('combobox', { name: 'Paragraph', exact: true }).click();
    await page.getByRole('option', { name: 'Errors increased relative to request volume.', exact: true }).click();
    await page.getByRole('button', { name: 'Manage evidence', exact: true }).click();
    const editor = page.getByTestId('report-evidence-editor');
    await editor.getByRole('textbox', { name: 'How this supports the conclusion' }).first().fill('Errors and requests use the same time range.');
    await editor.getByRole('button', { name: 'Remove', exact: true }).last().click();
    await editor.getByRole('checkbox').check();
    await editor.getByRole('button', { name: 'Apply to draft', exact: true }).click();
    await expect.poll(() => document.content.evidenceGroups?.[0].references.length).toBe(2);
    expect(document.content.evidenceGroups![0].references[0].explanation).toBe('Errors and requests use the same time range.');
    expect(document.content.evidenceGroups![0].needsReview).toBe(false);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('link', { name: 'View evidence · 2', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('combobox', { name: 'Paragraph', exact: true }).click();
    await page.getByRole('option', { name: 'Errors increased relative to request volume.', exact: true }).click();
    await page.getByRole('button', { name: 'Manage evidence', exact: true }).click();
    await editor.getByRole('combobox', { name: 'Choose a result', exact: true }).click();
    await page.getByRole('option', { name: 'New Work result', exact: true }).click();
    await editor.getByRole('button', { name: 'Add', exact: true }).click();
    await editor.getByRole('checkbox').check();
    await editor.getByRole('button', { name: 'Apply to draft', exact: true }).click();
    await expect(page.getByText('Missing report evidence.', { exact: true })).toHaveCount(0);
    await expect.poll(() => document.content.evidenceGroups?.[0].references.some(reference => reference.artifactId === 'work-result')).toBe(true);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.goto(`${reportUrl}?revision=1`);
    await expect(page.getByRole('link', { name: 'View evidence · 3', exact: true })).toBeVisible();
    expect(history.get(1)!.content.evidenceGroups![0].references[0].explanation).toBe('Evidence explanation 1');
    expect(queryRuns).toBe(0);
    await expectAppHealthy(appErrors);
});
