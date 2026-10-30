import { initialWorkingState, materializeWorkingContent } from '../../apps/web/lib/work-documents/working-draft';
import type { ReportWorkingDraft } from '@dory/shared/types/report-workspace';
import type { WorkDocumentView, WorkVisual } from '@dory/shared/types/work-document';
import { expect } from '@playwright/test';

import { parseReport, reportEmbeds, resolvedReport } from '../../apps/web/lib/work-documents/report-core';
import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

test.use({ actionTimeout: 15000 });
const connection = createWorkbenchConnection();
const now = '2026-10-28T00:00:00Z';
function fixture(): WorkDocumentView {
    const visuals: WorkVisual[] = [
        {
            id: 'metric',
            title: 'Revenue',
            type: 'metric',
            evidenceId: 'report-result',
            metric: { column: 'value', rowIndex: 0, format: 'currency', currency: 'USD', precision: 2 },
        },
        { id: 'rows', title: 'Saved details', type: 'table', evidenceId: 'report-result' },
        { id: 'chart', title: 'Revenue by category', type: 'chart', evidenceId: 'report-result', chart: { type: 'bar', xKey: 'category', yKey: 'value' } },
    ];
    const evidence = [
        {
            snapshotId: 'snapshot-1',
            artifactId: 'report-result',
            title: 'Revenue query',
            connectionId: connection.connection.id,
            connectionName: 'Orders',
            sql: 'SELECT secret_field FROM private_table',
            capturedAt: now,
            columns: ['category', 'value'],
            rows: Array.from({ length: 60 }, (_, i) => ({ category: `category-${i}`, value: 123.45 + i })),
            rowCount: 60,
            truncated: false,
            runId: null,
        },
    ];
    const body = '# Revenue report\n\n## Overview\n\nA stable report.\n\n<Metric source="metric" />\n\n<DataTable source="rows" />\n\n<Chart source="chart" />';
    return {
        id: 'report-v2',
        title: 'Revenue report',
        chatId: null,
        scope: { connectionIds: [connection.connection.id] },
        revision: 1,
        status: 'ready',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        content: {
            format: 'restricted-mdx',
            schemaVersion: 1,
            body,
            markdown: parseReport(body, visuals).presentation,
            visuals,
            evidence,
            embeds: reportEmbeds(visuals, evidence),
            knowledge: [],
            diagnostics: [],
        },
    };
}

test('Reports publish immutable snapshots, interact locally, restore to draft and export selected versions', async ({ page, appErrors }, testInfo) => {
    test.setTimeout(180_000);
    let document = fixture();
    const history = new Map([[1, structuredClone(document)]]);
    const publications: WorkDocumentView[] = [];
    let originalRequests = 0;
    const drafts = new Map<number, ReportWorkingDraft>();
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/actions/execute', async route => {
        const { actionId, input } = route.request().postDataJSON();
        if (actionId === 'report.workspace.analysis') {
            const base = history.get(input.revision)!;
            if (!drafts.has(input.revision))
                drafts.set(input.revision, {
                    userId: 'fixture',
                    documentId: document.id,
                    baseRevision: input.revision,
                    expectedReportRevision: document.revision,
                    revision: 1,
                    results: {},
                    state: initialWorkingState(base.title, base.content),
                });
            return route.fulfill({
                json: {
                    ok: true,
                    data: {
                        draft: drafts.get(input.revision),
                        sources: base.content.evidence.map(evidence => ({
                            reference: { ...input, artifactId: evidence.artifactId, snapshotId: evidence.snapshotId },
                            title: base.title,
                            evidence,
                            source: { kind: 'unavailable', reason: 'Original source unavailable.' },
                        })),
                    },
                },
            });
        }
        if (actionId === 'report.workspace.saveDraft') {
            const draft = drafts.get(input.baseRevision)!;
            draft.state = {
                ...draft.state,
                title: input.title,
                tabs: input.tabs,
                activeTabId: input.activeTabId,
                content: { ...draft.state.content, body: input.body, visuals: input.visuals },
            };
            draft.state.content = materializeWorkingContent(draft.state, draft.results);
            draft.revision++;
            return route.fulfill({ json: { ok: true, data: draft } });
        }
        if (actionId === 'report.workspace.saveVersion') {
            const draft = drafts.get(input.baseRevision)!;
            document = { ...document, revision: document.revision + 1, title: draft.state.title, content: draft.state.content };
            const published = { ...structuredClone(document), publication: { id: `pub-${publications.length + 1}`, number: publications.length + 1, publishedAt: now } };
            publications.push(published);
            document.publishedVersionId = published.publication.id;
            history.set(document.revision, structuredClone(document));
            return route.fulfill({ json: { ok: true, data: published } });
        }
        if (actionId === 'report.workspace.context')
            return route.fulfill({
                json: {
                    ok: true,
                    data: {
                        reference: input,
                        title: document.title,
                        evidence: history.get(input.revision)!.content.evidence[0],
                        source: { kind: 'unavailable', reason: 'Original source unavailable.' },
                    },
                },
            });
        if (actionId === 'report.workspace.source') return route.fulfill({ json: { ok: true, data: { available: false, reason: 'Original source unavailable.', tables: [] } } });
        if (actionId === 'artifact.list') return route.fulfill({ json: { ok: true, data: { rows: [], total: 0 } } });
        if (actionId === 'artifact.get') {
            originalRequests++;
            return route.fulfill({ status: 404, json: { ok: false, error: { message: 'Expired' } } });
        }
        await route.fallback();
    });
    await page.route('**/api/work-documents/report-v2*', async route => {
        const url = new URL(route.request().url());
        if (route.request().method() === 'PATCH') {
            const input = route.request().postDataJSON();
            if (input.expectedRevision !== document.revision) return route.fulfill({ status: 409, json: { error: 'Report changed.' } });
            if (input.action === 'publish') {
                resolvedReport(document.content);
                const published = { ...structuredClone(document), publication: { id: `pub-${publications.length + 1}`, number: publications.length + 1, publishedAt: now } };
                publications.push(published);
                document.publishedVersionId = published.publication.id;
                return route.fulfill({ json: { document: published } });
            }
            if (input.action === 'restore') document = { ...structuredClone(history.get(input.revision)!), revision: document.revision + 1 };
            else {
                const parsed = parseReport(input.draft.body, input.draft.visuals);
                document = {
                    ...document,
                    title: input.draft.title,
                    revision: document.revision + 1,
                    content: {
                        ...document.content,
                        body: input.draft.body,
                        markdown: parsed.presentation,
                        visuals: input.draft.visuals,
                        embeds: reportEmbeds(input.draft.visuals, document.content.evidence),
                        diagnostics: parsed.diagnostics,
                    },
                };
            }
            history.set(document.revision, structuredClone(document));
            return route.fulfill({ json: { document } });
        }
        const selected = url.searchParams.get('publication')
            ? publications.find(item => item.publication?.id === url.searchParams.get('publication'))
            : url.searchParams.has('revision')
              ? history.get(Number(url.searchParams.get('revision')))
              : document;
        return route.fulfill({
            json: {
                document: selected,
                versions: [...history.values()].map(item => ({ revision: item.revision, source: 'user', createdAt: now })),
                publications: publications.map(item => ({ ...item.publication, revision: item.revision })),
            },
        });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/reports/report-v2`);
    await expect(page.getByRole('heading', { name: 'Revenue report', exact: true })).toHaveCount(1);
    await expect(page.getByText('$123.45', { exact: true })).toBeVisible();
    const filter = page.getByRole('textbox', { name: 'Filter saved rows' });
    await filter.fill('category-59');
    await expect(page.getByRole('cell', { name: 'category-59', exact: true })).toBeVisible();
    expect(originalRequests).toBe(0);
    const widths = await page.getByTestId('work-markdown').evaluate(element => {
        const prose = element.querySelector('.report-prose')!;
        const visuals = [...element.querySelectorAll('figure[data-visual]')];
        return {
            prose: prose.getBoundingClientRect().width,
            visuals: visuals.map(visual => ({ width: visual.getBoundingClientRect().width, border: getComputedStyle(visual).borderTopWidth })),
        };
    });
    for (const visual of widths.visuals) {
        expect(visual.width).toBeCloseTo(widths.prose, 0);
        expect(visual.border).toBe('0px');
    }
    await expect(page.getByRole('button', { name: 'View source', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'View query and results', exact: true })).toHaveCount(3);

    const surface = page.getByTestId('work-report');
    expect(
        await surface.evaluate(element => {
            const content = element.querySelector('[data-testid="report-content"]')!;
            return content.getBoundingClientRect().top - element.getBoundingClientRect().top;
        }),
    ).toBeLessThanOrEqual(96);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('report-compact-desktop.png') });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editMetric = page.getByRole('button', { name: 'Edit Revenue', exact: true });
    await editMetric.click();
    const component = page.getByTestId('report-component-dialog');
    await expect(component).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('report-component-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await component.getByRole('tab', { name: 'Preview', exact: true }).click();
    await expect(component.getByText('$123.45', { exact: true })).toBeVisible();
    await expect(component.getByRole('textbox', { name: 'Component title', exact: true })).not.toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('report-component-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 720 });
    await component.getByRole('textbox', { name: 'Component title', exact: true }).fill('Discarded metric');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toContainText('Discard component changes?');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(component).toHaveCount(0);
    await expect(editMetric).toBeFocused();
    expect(document.revision).toBe(1);
    await editMetric.click();
    await component.getByRole('textbox', { name: 'Component title', exact: true }).fill('Reviewed revenue');
    await component.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect.poll(() => drafts.get(1)?.state.content.visuals[0].title).toBe('Reviewed revenue');
    await page.getByRole('button', { name: 'Edit Reviewed revenue', exact: true }).click();
    await expect(component.getByRole('textbox', { name: 'Component title', exact: true })).toHaveValue('Reviewed revenue');
    await component.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Report preview', exact: true }).last().click();
    await expect(page.getByText('Original source unavailable.', { exact: false })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Report snapshot', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save new version', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save new version', exact: true }).click();
    await expect.poll(() => publications.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Report versions', exact: true })).toHaveText('Published v1');
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restore this version', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const source = page.getByTestId('markdown-source').locator('textarea').first();
    await source.press('ControlOrMeta+Home');
    await page.keyboard.insertText('Updated summary.\n\n');
    await expect.poll(() => drafts.get(document.revision)?.state.content.body).toContain('Updated summary.');
    await page.getByRole('button', { name: 'Save new version', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save new version', exact: true }).click();
    await expect.poll(() => publications.length).toBe(2);
    await page.getByRole('button', { name: 'Report versions', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Published v1', exact: true }).click();
    await expect(page.getByText('Updated summary.', { exact: true })).toHaveCount(0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'HTML', exact: true }).click();
    const stream = await (await download).createReadStream();
    let html = '';
    for await (const chunk of stream!) html += chunk.toString();
    expect(html).toContain('v1');
    expect(html).toContain('category-0');
    expect(html).toContain('category-59');
    expect(html).not.toContain('Updated summary.');
    expect(html).not.toContain('secret_field');
    await surface.evaluate(element => {
        (element as HTMLElement).style.width = '560px';
    });
    await expect(page.getByRole('button', { name: 'Export', exact: true })).not.toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('report-compact-narrow-pane.png') });
    await surface.evaluate(element => {
        (element as HTMLElement).style.width = '';
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page.getByRole('button', { name: 'Export', exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Continue analysis', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'Continue analysis', exact: true })).not.toBeVisible();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('report-v2-dark-mobile.png'), fullPage: true });
    expect(await page.getByTestId('work-report').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expectAppHealthy(appErrors);
});

test('Compact report toolbar handles long titles, empty sources, archives and save conflicts', async ({ page, appErrors }) => {
    const document = fixture();
    document.title = 'A report with a long title that remains available in full while the toolbar uses one line '.repeat(2).slice(0, 160);
    document.archivedAt = now;
    document.content = { ...document.content, body: '## Overview\n\nNo data attached.', markdown: '## Overview\n\nNo data attached.', visuals: [], evidence: [], embeds: {} };
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/actions/execute', route => route.fulfill({ json: { ok: true, data: { rows: [], total: 0 } } }));
    await page.route('**/api/work-documents/report-v2*', route =>
        route.request().method() === 'PATCH'
            ? route.fulfill({ status: 409, json: { error: 'Report changed. Read the latest version before editing.' } })
            : route.fulfill({ json: { document, versions: [], publications: [] } }),
    );
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/reports/report-v2`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveAttribute('title', document.title);
    expect(await page.getByTestId('report-toolbar').evaluate(element => element.getBoundingClientRect().height)).toBe(44);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'More actions', exact: true })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Report details', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
    document.archivedAt = null;
    await page.reload();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Keep my unsaved title');
    await expect(page.getByTestId('report-toolbar').getByRole('status')).toHaveText('Save failed');
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Keep my unsaved title');
    await expectAppHealthy(appErrors);
});

for (const chartType of ['bar', 'line', 'area', 'pie'] as const) {
    test(`report ${chartType} renders boolean categories from saved evidence`, async ({ page, appErrors }) => {
        const document = fixture();
        document.content.evidence[0].rows = [
            { category: true, value: 200 },
            { category: false, value: 1800 },
        ];
        document.content.evidence[0].rowCount = 2;
        document.content.visuals = [
            { id: 'chart', type: 'chart', title: 'Active customers', evidenceId: 'report-result', chart: { type: chartType, xKey: 'category', yKey: 'value' } },
        ];
        document.content.body = '<Chart source="chart" />';
        document.content.embeds = reportEmbeds(document.content.visuals, document.content.evidence);
        document.content.markdown = parseReport(document.content.body, document.content.visuals).presentation;
        await mockWorkbenchApis(page, { initialConnections: [connection] });
        await page.route('**/api/work-documents/report-v2*', route => route.fulfill({ json: { document, versions: [], publications: [] } }));
        await page.goto('/');
        const organization = new URL(page.url()).pathname.split('/')[1];
        await page.goto(`/${organization}/reports/report-v2`);
        const shape = { bar: '.recharts-bar-rectangle', line: '.recharts-line-curve', area: '.recharts-area-area', pie: '.recharts-pie-sector' }[chartType];
        await expect(page.locator(`[data-visual="chart"] ${shape}`).first()).toBeVisible();
        if (chartType === 'bar' || chartType === 'pie') await expect(page.locator(`[data-visual="chart"] ${shape}`)).toHaveCount(2);
        expect(document.content.evidence[0].rows[0].category).toBe(true);
        await expectAppHealthy(appErrors);
    });
}
