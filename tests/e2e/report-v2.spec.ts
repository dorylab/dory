import { chooseReportMode, pendingReport } from './helpers/report';
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

test('Reports save once, restore immutable history and export the selected version', async ({ page, appErrors }, testInfo) => {
    test.setTimeout(180_000);
    let document = fixture();
    const history = new Map([[1, structuredClone(document)]]);
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
        if (actionId === 'report.component.sources') return route.fulfill({ json: { ok: true, data: { rows: [] } } });
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
        if (url.searchParams.has('publication')) return route.fulfill({ status: 410, json: { error: 'REPORT_VERSION_REMOVED' } });
        const selected = url.searchParams.has('revision') ? history.get(Number(url.searchParams.get('revision'))) : document;
        if (!selected) return route.fulfill({ status: 410, json: { error: 'REPORT_VERSION_REMOVED' } });
        return route.fulfill({
            json: {
                document: { ...selected, version: selected?.revision },
                editorOwnerId: 'fixture',
                versions: [...history.values()].reverse().map(item => ({ revision: item.revision, version: item.revision, source: 'user', createdAt: now })),
            },
        });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/reports/report-v2`);
    await expect(page.getByTestId('work-markdown').getByRole('heading', { level: 1, name: 'Revenue report', exact: true })).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'View source and data', exact: true })).toHaveCount(0);

    const surface = page.getByTestId('work-report');
    expect(
        await surface.evaluate(element => {
            const content = element.querySelector('[data-testid="report-content"]')!;
            return content.getBoundingClientRect().top - element.getBoundingClientRect().top;
        }),
    ).toBeLessThanOrEqual(96);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('report-compact-desktop.png') });
    await chooseReportMode(page, 'Edit');
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
    expect(document.content.visuals[0].title).toBe('Revenue');
    await page.getByRole('button', { name: 'Edit Reviewed revenue', exact: true }).click();
    await expect(component.getByRole('textbox', { name: 'Component title', exact: true })).toHaveValue('Reviewed revenue');
    await component.getByRole('button', { name: 'Cancel', exact: true }).click();
    const save = page.getByTestId('report-toolbar').getByRole('button', { name: 'Save', exact: true });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit Reviewed revenue', exact: true })).toBeVisible();
    await save.click();
    await expect.poll(() => document.revision).toBe(2);
    expect(document.content.visuals[0].title).toBe('Reviewed revenue');
    const versions = page.getByRole('button', { name: 'Version history', exact: true });
    await versions.click();
    await page.getByRole('menuitemradio', { name: /v1$/ }).click();
    await page.getByRole('button', { name: 'Restore this version', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version', exact: true }).click();
    await expect.poll(() => document.revision).toBe(3);
    await chooseReportMode(page, 'Source');
    const source = page.getByTestId('markdown-source').locator('textarea').first();
    await source.press('ControlOrMeta+Home');
    await page.keyboard.insertText('Updated summary.\n\n');
    expect(document.content.body).not.toContain('Updated summary.');
    await save.click();
    await expect.poll(() => document.revision).toBe(4);
    await versions.click();
    await page.getByRole('menuitemradio', { name: /v1$/ }).click();
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
    for (const selector of ['publication=old-release', 'revision=23']) {
        await page.goto(`/${organization}/reports/report-v2?${selector}`);
        await expect(page.getByTestId('work-report').getByRole('alert')).toContainText('This historical version has been cleared.');
        await page.getByRole('button', { name: 'Open current report', exact: true }).click();
        await expect(page.getByTestId('work-markdown')).toContainText('Updated summary.');
    }
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
    await chooseReportMode(page, 'Edit');
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Keep my unsaved title');
    await page.getByTestId('report-toolbar').getByRole('button', { name: 'Save', exact: true }).click();
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

test('Editable SQL blocks use the report theme in light and dark mode', async ({ page }) => {
    const report = fixture();
    report.content.body = 'Query the `financial_metrics` table.\n\n```sql\nSELECT fiscal_year\nFROM financial_metrics\n```';
    await page.addInitScript(() => localStorage.setItem('theme', 'system'));
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/work-documents/report-v2*', route => route.fulfill({ json: { document: report, versions: [], publications: [] } }));
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/reports/report-v2`);
    await chooseReportMode(page, 'Edit');
    const editor = page.getByTestId('report-block-editor');
    const block = editor.locator('[data-content-type="codeBlock"]');
    const code = block.locator('pre > code');
    await expect(code).toHaveText('SELECT fiscal_year\nFROM financial_metrics');
    await code.click();
    for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(editor.locator('.bn-root')).toHaveAttribute('data-color-scheme', colorScheme);
        const palette = await page.evaluate(() => {
            const sample = document.createElement('span');
            sample.style.cssText = 'color: var(--code-foreground); background-color: var(--code)';
            document.body.append(sample);
            const { color, backgroundColor } = getComputedStyle(sample);
            sample.remove();
            return { color, backgroundColor };
        });
        await expect(code).toHaveCSS('color', palette.color);
        await expect(block).toHaveCSS('background-color', palette.backgroundColor);
        await expect(block.locator('pre')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(code).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
});

test('Wide report tables scroll within the editor and keep their theme colors when selected', async ({ page, baseURL }) => {
    const report = fixture();
    report.content.body = 'A stable report.\n\n<DataTable source="rows" />';
    const evidence = report.content.evidence[0];
    const extraValues = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`financial_period_${index + 1}`, 'FY2025 financial results']));
    evidence.columns.push(...Object.keys(extraValues));
    evidence.rows = evidence.rows.map(row => ({ ...row, ...extraValues }));
    await page.context().addCookies([{ name: 'active_theme', value: 'green', url: baseURL! }]);
    await page.addInitScript(() => localStorage.setItem('theme', 'system'));
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/work-documents/report-v2*', route => route.fulfill({ json: { document: report, versions: [], publications: [] } }));
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/reports/report-v2`);
    await chooseReportMode(page, 'Edit');
    const editor = page.getByTestId('report-block-editor');
    const table = editor.locator('figure[data-visual="rows"]');
    const scrollArea = table.locator('.work-table-scroll');
    const lastHeader = table.getByRole('columnheader').last();
    await expect(lastHeader).not.toBeInViewport();
    const layout = await scrollArea.evaluate(element => ({
        fitsEditor: element.clientWidth <= element.closest('.bn-editor')!.clientWidth,
        cellsFit: [...element.querySelectorAll('tr:first-child > td')].every(cell => cell.scrollWidth <= cell.clientWidth + 1),
    }));
    expect(layout).toEqual({ fitsEditor: true, cellsFit: true });
    await scrollArea.hover();
    await page.mouse.wheel(10000, 0);
    await expect(lastHeader).toBeInViewport();
    await table.locator('summary').click();
    await editor.getByText('A stable report.', { exact: true }).click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
    await page.keyboard.press('ArrowDown');
    for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(editor.locator('.bn-root')).toHaveAttribute('data-color-scheme', colorScheme);
        await expect(editor.locator('.ProseMirror-selectednode')).toContainText('Saved details');
        const cell = table.getByRole('cell').first();
        const colors = await cell.evaluate(element => {
            const reference = document.createElement('span');
            reference.style.cssText = 'color: var(--foreground); accent-color: var(--primary)';
            document.body.append(reference);
            const { color: foreground, accentColor: primary } = getComputedStyle(reference);
            reference.remove();
            return { text: getComputedStyle(element).color, selected: getComputedStyle(element, '::selection').color, foreground, primary };
        });
        expect(colors.selected).toBe(colors.foreground);
        expect(colors.text).toBe(colors.foreground);
        const checkbox = table.getByRole('checkbox', { name: 'category' });
        await expect(checkbox).toHaveCSS('accent-color', colors.primary);
    }
});

test('A long metric column list scrolls to the last field in the component dialog', async ({ page }) => {
    const document = fixture();
    const evidence = document.content.evidence[0];
    const fields = Array.from({ length: 25 }, (_, index) => `field_${index + 1}`);
    evidence.columns.push(...fields);
    const values = Object.fromEntries(fields.map((field, index) => [field, index + 1]));
    evidence.rows = evidence.rows.map(row => ({ ...row, ...values }));
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/work-documents/report-v2*', route => route.fulfill({ json: { document, versions: [], publications: [] } }));
    await page.route('**/api/actions/execute', route =>
        route.request().postDataJSON().actionId === 'report.component.sources' ? route.fulfill({ json: { ok: true, data: { rows: [] } } }) : route.fallback(),
    );
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/reports/report-v2`);
    await chooseReportMode(page, 'Edit');
    await page.getByRole('button', { name: 'Edit Revenue', exact: true }).click();
    const column = page.getByTestId('report-component-dialog').getByRole('combobox', { name: 'Column', exact: true });
    await column.click();
    const lastField = page.getByRole('option', { name: 'field_25', exact: true });
    await expect(lastField).not.toBeInViewport();
    await page.getByRole('listbox').hover();
    await page.mouse.wheel(0, 1200);
    await expect(lastField).toBeInViewport();
    await lastField.click();
    await expect(column).toHaveText('field_25');
});

test('Report chart fields are searchable and the series layout updates before and after applying', async ({ page, appErrors }) => {
    test.setTimeout(120_000);
    let document = fixture();
    const columns = ['category', 'revenue', 'profit'].map(name => ({ name }));
    const rows = [
        { category: 'First', revenue: 125, profit: 25 },
        { category: 'Second', revenue: 150, profit: 30 },
    ];
    let saves = 0;
    let rowRequests = 0;
    let releaseSave!: () => void;
    const saveGate = new Promise<void>(resolve => {
        releaseSave = resolve;
    });
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/work-documents/report-v2*', async route => {
        if (route.request().method() === 'PATCH') {
            const { draft } = route.request().postDataJSON();
            expect(draft).not.toHaveProperty('evidence');
            saves++;
            await saveGate;
            const evidence = [
                ...document.content.evidence,
                {
                    ...document.content.evidence[0],
                    artifactId: 'financials',
                    snapshotId: 'financial-snapshot',
                    columns: columns.map(column => column.name),
                    rows,
                    rowCount: rows.length,
                },
            ];
            document = {
                ...document,
                revision: document.revision + 1,
                content: { ...document.content, evidence, body: draft.body, visuals: draft.visuals, embeds: reportEmbeds(draft.visuals, evidence) },
            };
        }
        return route.fulfill({ json: { document, versions: [], publications: [] } });
    });
    await page.route('**/api/actions/execute', route => {
        const { actionId, input } = route.request().postDataJSON();
        if (actionId === 'report.component.sources') {
            expect(input.documentId).toBe(document.id);
            return route.fulfill({ json: { ok: true, data: { rows: [{ id: 'financials', title: 'Financial results' }] } } });
        }
        if (actionId === 'artifact.get' && input.artifactId === 'financials') {
            return route.fulfill({
                json: {
                    ok: true,
                    data: {
                        title: 'Financial results',
                        resultSet: { id: 'financial-rows', columns, sql: null },
                        createdAt: now,
                        connectionName: 'Orders',
                        connectionId: connection.connection.id,
                        workId: null,
                    },
                },
            });
        }
        if (actionId === 'resultSet.rows.read' && input.resultSetId === 'financial-rows') {
            rowRequests++;
            return route.fulfill({ json: { ok: true, data: { columns, rows, rowCount: rows.length, dataAvailability: 'full' } } });
        }
        return route.fallback();
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/reports/report-v2`);
    await chooseReportMode(page, 'Edit');
    await page.getByRole('button', { name: 'Insert component', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Chart', exact: true }).click();
    const dialog = page.getByTestId('report-component-dialog');
    const preview = dialog.getByTestId('report-component-preview');
    const columnSearch = page.getByRole('combobox', { name: 'Search columns', exact: true });
    await expect(dialog.getByRole('textbox', { name: 'Search columns', exact: true })).toHaveCount(0);
    await dialog.getByRole('combobox', { name: 'Artifact source', exact: true }).click();
    await page.getByRole('option', { name: 'Financial results', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'X', exact: true }).click();
    await columnSearch.fill('cate');
    await expect(page.getByRole('option', { name: 'profit', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'category', exact: true }).click();
    await expect(columnSearch).toHaveCount(0);
    await dialog.getByRole('combobox', { name: 'Y', exact: true }).click();
    await columnSearch.fill('rev');
    const revenue = page.getByRole('option', { name: 'revenue', exact: true });
    await revenue.click();
    await expect(revenue).toHaveAttribute('aria-checked', 'true');
    await expect(preview.locator('.recharts-bar')).toHaveCount(1);
    await columnSearch.fill('prof');
    const profit = page.getByRole('option', { name: 'profit', exact: true });
    await profit.click();
    await expect(preview.locator('.recharts-bar')).toHaveCount(2);
    await expect(preview.locator('.recharts-wrapper')).toHaveCount(2);
    await profit.click();
    await expect(preview.locator('.recharts-bar')).toHaveCount(1);
    await profit.click();
    await columnSearch.press('Escape');
    await expect(columnSearch).toHaveCount(0);
    const layout = dialog.getByRole('combobox', { name: 'Series layout', exact: true });
    await expect(layout).toHaveText('One chart per field');
    await layout.click();
    await page.getByRole('option', { name: 'One chart', exact: true }).click();
    await expect(preview.locator('.recharts-wrapper')).toHaveCount(1);
    await expect(preview.locator('.recharts-bar')).toHaveCount(2);
    await dialog.getByRole('combobox', { name: 'Chart type', exact: true }).click();
    await page.getByRole('option', { name: 'line', exact: true }).click();
    await expect(preview.locator('.recharts-line-curve')).toHaveCount(2);
    expect(rowRequests).toBe(1);
    expect(saves).toBe(0);
    const apply = dialog.getByRole('button', { name: 'Apply', exact: true });
    const inlineChart = page.getByTestId('report-block-editor').locator('.recharts-line-curve');
    try {
        await apply.click();
        await expect(dialog).toHaveCount(0);
        await expect(inlineChart).toHaveCount(2);
        await page.getByTestId('report-toolbar').getByRole('button', { name: 'Save', exact: true }).click();
        await expect.poll(() => saves).toBe(1);
    } finally {
        releaseSave();
    }
    await expect.poll(() => document.revision).toBe(2);
    const inserted = document.content.visuals.find(visual => visual.evidenceId === 'financials')!;
    expect(inserted.chart?.seriesLayout).toBe('combined');
    const savedChart = page.getByTestId('report-content').locator(`[data-visual="${inserted.id}"]`);
    await expect(savedChart.locator('.recharts-wrapper')).toHaveCount(1);
    await expect(savedChart.locator('.recharts-line-curve')).toHaveCount(2);
    await expectAppHealthy(appErrors);
});

test('Report block editing preserves source through mode switches, saves prose, splits blocks and supports undo', async ({ page, appErrors }, testInfo) => {
    test.setTimeout(120_000);
    let document = fixture();
    const body = '## Overview\n\nOriginal paragraph.\n\n<Metric source="metric" />\n\n[Reference][ref]\n\n[ref]: https://example.com';
    document.content = { ...document.content, body, markdown: parseReport(body, document.content.visuals).presentation };
    let saves = 0;
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.route('**/api/actions/execute', route => {
        const { actionId, input } = route.request().postDataJSON();
        if (actionId !== 'report.component.sources') return route.fallback();
        const rows = input.query === 'older report' ? [{ id: 'older-result', title: 'Older report result' }] : [];
        return route.fulfill({ json: { ok: true, data: { rows } } });
    });
    await page.route('**/api/work-documents/report-v2*', async route => {
        if (route.request().method() === 'PATCH') {
            const { draft } = route.request().postDataJSON();
            saves++;
            document = {
                ...document,
                revision: document.revision + 1,
                title: draft.title,
                content: {
                    ...document.content,
                    body: draft.body,
                    visuals: draft.visuals,
                    embeds: reportEmbeds(draft.visuals, document.content.evidence),
                    markdown: parseReport(draft.body, draft.visuals).presentation,
                },
            };
            return route.fulfill({ json: { document } });
        }
        return route.fulfill({ json: { document, versions: [], editorOwnerId: 'fixture' } });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/reports/report-v2`);
    await expect(page.getByTestId('report-toolbar').getByRole('button', { name: 'View', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await chooseReportMode(page, 'Edit');
    const editor = page.getByTestId('report-block-editor');
    await expect(editor).toBeVisible();
    await expect(editor.getByText('Original paragraph.', { exact: true })).toBeVisible();
    await chooseReportMode(page, 'Source');
    const sourceEditor = page.getByTestId('markdown-source');
    await expect(sourceEditor).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage evidence', exact: true })).toHaveCount(0);
    for (const viewport of [
        { width: 1280, height: 900 },
        { width: 390, height: 844 },
    ]) {
        await page.setViewportSize(viewport);
        await expect
            .poll(() =>
                sourceEditor.evaluate(element => {
                    const report = element.closest('[data-testid="work-report"]')!;
                    return Math.abs(report.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom);
                }),
            )
            .toBeLessThanOrEqual(20);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await chooseReportMode(page, 'Edit');
    await chooseReportMode(page, 'View');
    expect(saves).toBe(0);
    expect(document.content.body).toBe(body);
    await chooseReportMode(page, 'Edit');
    const paragraph = editor.locator('.bn-inline-content').filter({ hasText: 'Original paragraph.' });
    await paragraph.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
    await page.keyboard.insertText(' 中文输入。');
    await expect.poll(async () => (await pendingReport(page)).content.body).toContain('中文输入。');
    await page.keyboard.insertText(' Still focused.');
    await expect.poll(async () => (await pendingReport(page)).content.body).toContain('中文输入。 Still focused.');
    expect((await pendingReport(page)).content.body).toContain('[Reference][ref]\n\n[ref]: https://example.com');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('Second block.');
    await expect(editor.locator('.bn-block-outer').filter({ hasText: 'Second block.' })).toHaveCount(1);
    await expect.poll(async () => (await pendingReport(page)).content.body).toContain('Second block.');
    const second = editor.locator('.bn-block-outer').filter({ hasText: 'Second block.' });
    await second.hover();
    await second.locator('.bn-inline-content').click();
    await second.hover();
    await page.getByRole('button', { name: 'Open block menu', exact: true }).click();
    // Isolate this command from the preceding typing in ProseMirror's undo history.
    await page.waitForTimeout(550);
    await page.getByRole('menuitem', { name: 'Move up', exact: true }).click();
    await expect
        .poll(async () => (await pendingReport(page)).content.body!.indexOf('Second block.') < (await pendingReport(page)).content.body!.indexOf('Original paragraph.'))
        .toBe(true);
    await editor.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
        .poll(async () => (await pendingReport(page)).content.body!.indexOf('Second block.') > (await pendingReport(page)).content.body!.indexOf('Original paragraph.'))
        .toBe(true);
    await second.hover();
    await second.locator('.bn-inline-content').click();
    await editor.getByRole('button', { name: 'Block actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => (await pendingReport(page)).content.body).not.toContain('Second block.');
    await editor.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await pendingReport(page)).content.body).toContain('Second block.');
    await second.locator('.bn-inline-content').click();
    await editor.getByRole('button', { name: 'Insert block', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Metric', exact: true }).click();
    const dialog = page.getByTestId('report-component-dialog');
    const sourceSelect = dialog.getByRole('combobox', { name: 'Artifact source', exact: true });
    const sourceSearch = page.getByRole('combobox', { name: 'Find data source', exact: true });
    await expect(sourceSearch).toHaveCount(0);
    await sourceSelect.click();
    await expect(sourceSearch).toBeFocused();
    await sourceSearch.fill('older report');
    await expect(page.getByRole('option', { name: 'Older report result', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Revenue query', exact: true })).toHaveCount(0);
    await sourceSearch.press('Escape');
    await expect(sourceSelect).toBeFocused();
    await sourceSelect.click();
    await expect(sourceSearch).toHaveValue('');
    await sourceSearch.fill('revenue');
    await page.getByRole('option', { name: 'Revenue query', exact: true }).click();
    await expect(sourceSelect).toHaveText('Revenue query');
    await dialog.getByRole('combobox', { name: 'Column', exact: true }).click();
    await page.getByRole('option', { name: 'value', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Component title', exact: true }).fill('Inserted metric');
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect.poll(async () => (await pendingReport(page)).content.visuals.some(visual => visual.title === 'Inserted metric')).toBe(true);
    const inserted = (await pendingReport(page)).content.visuals.find(visual => visual.title === 'Inserted metric')!;
    expect((await pendingReport(page)).content.body).toContain(`Second block.\n\n<Metric source="${inserted.id}" />`);
    await editor.getByRole('button', { name: 'Insert block', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Table', exact: true }).click();
    await editor.getByRole('cell').first().locator('p').click();
    await page.keyboard.insertText('Definition');
    await expect.poll(async () => (await pendingReport(page)).content.body).toContain('Definition');
    const firstProseBlock = editor.locator('.bn-block-outer').filter({ hasText: 'Original paragraph.' });
    await firstProseBlock.hover();
    const handle = await page.locator('[data-test="dragHandle"]').boundingBox();
    const target = await second.boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width + 10, handle!.y + handle!.height / 2, { steps: 5 });
    await page.mouse.move(target!.x + 100, target!.y + target!.height + 5, { steps: 15 });
    await page.mouse.move(target!.x + 101, target!.y + target!.height + 6);
    await page.mouse.up();
    await expect
        .poll(async () => (await pendingReport(page)).content.body!.indexOf('Original paragraph.') > (await pendingReport(page)).content.body!.indexOf('Second block.'))
        .toBe(true);
    await page.screenshot({ path: testInfo.outputPath('report-block-editor-light.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.document.documentElement.classList.add('dark'));
    await expect(page.getByTestId('report-toolbar').getByRole('button', { name: 'Report mode', exact: true })).toHaveText('Edit');
    await page.screenshot({ path: testInfo.outputPath('report-block-editor-dark-mobile.png'), fullPage: true });
    expect(await page.getByTestId('work-report').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await chooseReportMode(page, 'Source');
    const source = page.getByTestId('markdown-source').locator('textarea').first();
    await source.press('ControlOrMeta+Home');
    await page.keyboard.insertText('{invalid}\n\n');
    await chooseReportMode(page, 'Edit');
    await expect(page.getByTestId('markdown-source')).toBeVisible();
    await expect(editor).toHaveCount(0);
    await expect(page.getByText('Fix the MDX errors in Source before opening block editing.')).toBeVisible();
    expect(saves).toBe(0);
    await page.getByTestId('report-toolbar').getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(document.content.body).toBe(body);
    await expectAppHealthy(appErrors);
});

for (const status of [409, 500]) {
    test(`BlockNote keeps new input during save and preserves the draft after ${status}`, async ({ page, appErrors }) => {
        let document = fixture();
        document.content.body = 'Original paragraph.';
        document.content.markdown = 'Original paragraph.';
        let saving = false;
        let fail = true;
        let releaseSave: () => void = () => {};
        const firstSave = new Promise<void>(resolve => {
            releaseSave = resolve;
        });
        await mockWorkbenchApis(page, { initialConnections: [connection] });
        await page.route('**/api/work-documents/report-v2*', async route => {
            if (route.request().method() !== 'PATCH') return route.fulfill({ json: { document, versions: [], publications: [] } });
            const { draft } = route.request().postDataJSON();
            if (!saving) {
                saving = true;
                await firstSave;
            } else if (fail) return route.fulfill({ status, json: { error: status === 409 ? 'Report changed. Read the latest version.' : 'Could not save report.' } });
            document = {
                ...document,
                revision: document.revision + 1,
                content: { ...document.content, body: draft.body, markdown: parseReport(draft.body, draft.visuals).presentation, visuals: draft.visuals },
            };
            return route.fulfill({ json: { document } });
        });
        await page.goto('/');
        const organization = new URL(page.url()).pathname.split('/')[1];
        await page.goto(`/${organization}/reports/report-v2`);
        await chooseReportMode(page, 'Edit');
        const editor = page.getByTestId('report-block-editor');
        const paragraph = editor.locator('.bn-inline-content').filter({ hasText: 'Original paragraph.' });
        await paragraph.click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
        await page.keyboard.insertText(' First edit.');
        const save = page.getByTestId('report-toolbar').getByRole('button', { name: 'Save', exact: true });
        await save.click();
        await expect.poll(() => saving).toBe(true);
        await paragraph.click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
        await page.keyboard.insertText(' New input.');
        releaseSave();
        await expect(save).toBeEnabled();
        await save.click();
        await expect(page.getByTestId('report-toolbar').getByRole('status')).toHaveText('Save failed');
        await expect(paragraph).toContainText('First edit. New input.');
        await paragraph.click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
        await page.keyboard.insertText(' Caret retained.');
        await expect(paragraph).toContainText('New input. Caret retained.');
        await chooseReportMode(page, 'View');
        await page.getByRole('alertdialog').getByRole('button', { name: 'Keep editing' }).click();
        await expect(editor).toBeVisible();
        await chooseReportMode(page, 'Source');
        await expect(page.getByTestId('markdown-source')).toBeVisible();
        await chooseReportMode(page, 'Edit');
        await expect(paragraph).toContainText('New input. Caret retained.');
        fail = false;
        await save.click();
        await expect(editor).toHaveCount(0);
        expect(document.content.body).toContain('New input. Caret retained.');
        await expectAppHealthy(
            appErrors.filter(error => status !== 500 || error !== 'console: Failed to load resource: the server responded with a status of 500 (Internal Server Error)'),
        );
    });
}
