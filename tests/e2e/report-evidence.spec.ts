import type { WorkDocumentView } from '@dory/shared/types/work-document';
import { expect } from '@playwright/test';

import { reconcileReportEvidenceGroups } from '../../apps/web/lib/work-documents/evidence-groups';
import { parseReport, reportEmbeds } from '../../apps/web/lib/work-documents/report-core';
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
            expect(input.groupId).toBe('error-rate');
            return route.fulfill({
                json: { ok: true, data: { evidence: saved, artifactAvailable: false, fullResultAvailable: input.artifactId === 'result-0', canOpenWorkspace: true } },
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
    await expect(panel.getByTestId('report-evidence-data')).toHaveCount(0);
    await panel.getByRole('button', { name: /Error totals/ }).click();
    await expect(panel.getByRole('cell', { name: '10', exact: true })).toBeVisible();
    await expect(panel.getByText('SELECT value FROM source_0', { exact: true })).toBeVisible();
    await expect(panel.getByText('Columns', { exact: true })).toHaveCount(0);
    const positions = await panel.evaluate(element => ({
        sql: element.querySelector('[data-testid=report-source-query]')!.getBoundingClientRect().top,
        data: element.querySelector('[data-testid=report-data-preview]')!.getBoundingClientRect().top,
    }));
    expect(positions.sql).toBeLessThan(positions.data);
    expect(rowRequests).toEqual([]);
    await expect(panel.getByText('Evidence explanation 1', { exact: true })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Edit SQL', exact: true })).toHaveAttribute('href', /groupId=error-rate/);
    await panel.getByRole('button', { name: 'Full result (30)', exact: true }).click();
    await expect(panel.getByRole('cell', { name: '124', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(panel.getByRole('cell', { name: '129', exact: true })).toBeVisible();
    expect(rowRequests).toEqual([0, 25]);
    await panel.getByRole('button', { name: 'Back to evidence list', exact: true }).click();
    await expect(panel.getByRole('button', { name: /Error totals/ })).toBeFocused();
    await panel.getByRole('button', { name: /Historical baseline/ }).click();
    await expect(panel.getByText(/baseline\.csv ·/)).toBeVisible();
    await expect(panel.getByText('Only the report snapshot is preserved; the full original result is unavailable.')).toBeVisible();
    await expect(panel.getByRole('cell', { name: '12', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('report-evidence-panel.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('report-evidence-mobile.png'), animations: 'disabled' });
    await expect(panel).toBeInViewport();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: 'View evidence · 3', exact: true })).toBeFocused();
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

test('source dialog previews SQL and distinguishes complete, unknown and unavailable results', async ({ page, context, appErrors }, testInfo) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(15000);
    const connection = createWorkbenchConnection();
    const sql = 'SELECT\n  value\nFROM logs\nWHERE value > 0\nORDER BY value\nLIMIT 7';
    const evidence = {
        artifactId: 'dialog-source',
        snapshotId: 'dialog-snapshot',
        title: 'Log summary',
        connectionId: connection.connection.id,
        connectionName: 'Demo database',
        sql,
        capturedAt: '2026-11-03T00:00:00Z',
        columns: ['value'],
        rows: [{ value: 7 }],
        rowCount: 1 as number | null,
        truncated: false,
        runId: null,
    };
    const body = '# Source dialog\n\n<DataTable source="logs" />';
    const visuals = [{ id: 'logs', type: 'table' as const, title: 'Logs', evidenceId: evidence.artifactId }];
    const document: WorkDocumentView = {
        id: 'dialog-report',
        title: 'Source dialog',
        revision: 1,
        chatId: null,
        status: 'draft',
        archivedAt: null,
        createdAt: evidence.capturedAt,
        updatedAt: evidence.capturedAt,
        scope: { connectionIds: [connection.connection.id] },
        content: {
            body,
            format: 'restricted-mdx',
            schemaVersion: 1,
            markdown: parseReport(body, visuals).presentation,
            embeds: reportEmbeds(visuals, [evidence]),
            visuals,
            evidence: [evidence],
            knowledge: [],
        },
    };
    let fullAvailable = true;
    const mutations: string[] = [];
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/work-documents/dialog-report*', route => route.fulfill({ json: { document, versions: [], publications: [] } }));
    await page.route('**/api/actions/execute', route => {
        const { actionId, input } = route.request().postDataJSON();
        if (actionId === 'report.evidence.inspect') {
            expect(input.componentId).toBe('logs');
            expect(input.snapshotId).toBe('dialog-snapshot');
            return route.fulfill({ json: { ok: true, data: { evidence, fullResultAvailable: fullAvailable, artifactAvailable: true, canOpenWorkspace: true } } });
        }
        if (['report.evidence.rows', 'report.workspace.execute', 'report.workspace.analysis', 'report.workspace.saveDraft', 'query.execute'].includes(actionId))
            mutations.push(actionId);
        return route.fallback();
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    const url = `/${organization}/reports/dialog-report`;
    await page.goto(url);
    const trigger = page.getByRole('button', { name: 'View source and data', exact: true });
    await trigger.click();
    const dialog = page.getByTestId('report-evidence-panel');
    await expect(dialog.getByRole('heading', { name: 'Sources and data', exact: true })).toBeVisible();
    await expect(dialog.getByText('1 row · Complete result', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Full result|Report snapshot|Next|Columns/ })).toHaveCount(0);
    await expect(dialog.getByText(/^Query limit ·/)).toBeVisible();
    const query = dialog.locator('pre');
    const collapsedHeight = await query.evaluate(element => element.clientHeight);
    await dialog.getByRole('button', { name: 'Expand SQL', exact: true }).click();
    expect(await query.evaluate(element => element.clientHeight)).toBeGreaterThan(collapsedHeight);
    await expect(query).toHaveText(sql);
    await dialog.getByRole('button', { name: 'Collapse SQL', exact: true }).click();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await dialog.getByRole('button', { name: 'Copy SQL', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sql);
    await dialog.getByRole('textbox', { name: 'Search loaded rows' }).fill('missing');
    await expect(dialog.getByText('No matching rows in the loaded data.')).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Search loaded rows' }).fill('');
    await expect(dialog.getByRole('link', { name: 'Edit SQL', exact: true })).toHaveAttribute('href', /componentId=logs/);
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(960);
    expect(Math.abs(bounds!.x + bounds!.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(2);
    expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height * 0.9 + 1);
    await page.screenshot({ path: testInfo.outputPath('source-dialog-light.png'), animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(trigger).toBeFocused();
    await page.getByText('Toggle theme', { exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await trigger.click();
    await page.screenshot({ path: testInfo.outputPath('source-dialog-dark.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('source-dialog-mobile.png'), animations: 'disabled' });
    const mobile = await dialog.boundingBox();
    expect(mobile!.x).toBeGreaterThanOrEqual(15);
    expect(mobile!.x + mobile!.width).toBeLessThanOrEqual(375);
    await expect(dialog.getByRole('link', { name: 'Edit SQL', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    evidence.rowCount = null;
    evidence.sql = "SELECT 'limit 10' AS label FROM (SELECT value FROM logs LIMIT 7) t";
    await page.reload();
    await trigger.click();
    await expect(dialog.getByText('Report contains 1 rows; the original total is unknown').first()).toBeVisible();
    await expect(dialog.getByText(/Complete result|^Query limit ·/)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Full query result', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    evidence.rowCount = 0;
    evidence.rows = [];
    evidence.sql = 'SELECT value FROM logs WHERE 1 = 0';
    await page.reload();
    await trigger.click();
    await expect(dialog.getByText('0 rows · Complete result', { exact: true })).toBeVisible();
    await expect(dialog.getByText('This query returned no rows.')).toBeVisible();
    await page.keyboard.press('Escape');
    fullAvailable = false;
    evidence.sql = '';
    await page.reload();
    await trigger.click();
    await expect(dialog.getByText('Only the report snapshot is preserved; the full original result is unavailable.')).toBeVisible();
    await expect(dialog.getByText('No SQL was saved. Check the source information above.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Full result|Full query result|Report snapshot/ })).toHaveCount(0);
    expect(mutations).toEqual([]);
    await expectAppHealthy(appErrors);
});
